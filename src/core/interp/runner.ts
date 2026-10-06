// 순서도 단계별 실행: 시작 터미널에서 화살표를 따라가며 도형 글자를 계산하고,
// 단계마다 변수 값과 출력을 기록한다. (의사코드가 없어도, 학생이 그린 순서도도 실행할 수 있다)

import type { FlowGraph, FlowNode } from '../types';
import { findAssignment, splitTopLevel } from '../text';
import {
  assign,
  cloneValue,
  evaluate,
  guessInput,
  parseExpr,
  PyError,
  repr,
  str,
  truthy,
  type Env,
  type PyValue,
} from './pyexpr';

export interface TraceStep {
  nodeId: string;
  /** 이 단계에서 일어난 일 (예: "i <= n → 예") */
  note: string;
  /** 이 단계를 마친 뒤의 변수 값 (repr) */
  vars: [string, string][];
  /** 이 단계에서 값이 바뀐 변수 */
  changed: string[];
  /** 이 단계에서 새로 출력된 줄 */
  printed: string[];
  /** 지금까지의 출력 줄 수 */
  outputCount: number;
  branch?: '예' | '아니오';
  error?: string;
}

export interface Trace {
  steps: TraceStep[];
  output: string[];
  /** 정상적으로 끝 터미널에 도착했는지 */
  finished: boolean;
  /** 입력값을 몇 개 썼는지 */
  inputsUsed: number;
}

export const MAX_STEPS = 2000;

const AUG = /^(.+?)\s*(\*\*|\/\/|[+\-*/%])=\s*(.+)$/s;

function snapshot(vars: Map<string, PyValue>): [string, string][] {
  return [...vars].map(([k, v]) => [k, repr(cloneValue(v))]);
}

/** 처리 도형 하나 실행 */
function execProcess(label: string, env: Env, print: (line: string) => void): string {
  const t = label.trim();

  const inp = t.match(/^입력\s*(?::\s*(.*))?$/s);
  if (inp) {
    const targets = (inp[1] ?? '').trim();
    if (!targets) {
      env.readInput();
      return '입력';
    }
    const names = splitTopLevel(targets);
    const values = names.map(() => guessInput(env.readInput()));
    names.forEach((n, i) => assign(parseExpr(n), values[i], env));
    return `입력: ${names.map((n, i) => `${n} ← ${repr(values[i])}`).join(', ')}`;
  }

  const out = t.match(/^출력\s*(?::\s*(.*))?$/s);
  if (out) {
    const args = (out[1] ?? '').trim();
    const line = args ? splitTopLevel(args).map((a) => str(evaluate(parseExpr(a), env))).join(' ') : '';
    print(line);
    return `출력: ${line}`;
  }

  const stmt = t.replace(/\s*←\s*/, ' = ');
  const aug = stmt.match(AUG);
  const asg = findAssignment(stmt);
  if (aug && asg && asg.op !== '=') {
    const target = parseExpr(aug[1]);
    assign(target, evaluate({ k: 'bin', op: aug[2], l: target, r: parseExpr(aug[3]) }, env), env);
    return stmt;
  }
  if (asg && asg.op === '=') {
    const lhs = stmt.slice(0, asg.index).trim();
    const value = evaluate(parseExpr(stmt.slice(asg.index + 1)), env);
    assign(parseExpr(lhs), value, env);
    return stmt;
  }
  if (t === 'pass' || t === '처리') return t;
  try {
    evaluate(parseExpr(stmt), env);
  } catch (e) {
    if (e instanceof PyError && !/[()]/.test(stmt))
      throw new PyError(`'${t}'은(는) 실행할 수 있는 문장이 아닙니다. 파이썬 문법으로 써 주세요.`);
    throw e;
  }
  return stmt;
}

export function runGraph(g: FlowGraph, inputs: string[], maxSteps = MAX_STEPS): Trace {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const outs = (id: string) => g.edges.filter((e) => e.source === id);
  const start = g.nodes.find((n) => n.kind === 'terminal' && !g.edges.some((e) => e.target === n.id));

  const vars = new Map<string, PyValue>();
  const output: string[] = [];
  let inputsUsed = 0;
  const env: Env = {
    vars,
    readInput: () => {
      if (inputsUsed >= inputs.length)
        throw new PyError(`입력값이 부족합니다. 입력값 칸에 ${inputsUsed + 1}번째 값을 적어 주세요.`);
      return inputs[inputsUsed++];
    },
  };
  const steps: TraceStep[] = [];
  const trace: Trace = { steps, output, finished: false, inputsUsed: 0 };

  if (!start) {
    steps.push({ nodeId: '', note: '시작 터미널을 찾을 수 없습니다.', vars: [], changed: [], printed: [], outputCount: 0, error: '시작 터미널을 찾을 수 없습니다.' });
    return trace;
  }

  let cur: FlowNode = start;
  for (let n = 0; ; n++) {
    const before = new Map(snapshot(vars));
    const printed: string[] = [];
    let note = '';
    let branch: '예' | '아니오' | undefined;
    let error: string | undefined;
    let next: string | undefined;
    const edges = outs(cur.id);

    try {
      if (cur.kind === 'terminal') {
        note = cur === start ? '시작' : '끝';
        if (cur !== start) {
          trace.finished = true;
        } else {
          if (edges.length !== 1) throw new PyError('시작에서 나가는 화살표가 하나여야 합니다.');
          next = edges[0].target;
        }
      } else if (cur.kind === 'process') {
        note = execProcess(cur.label, env, (line) => {
          output.push(line);
          printed.push(line);
        });
        if (edges.length !== 1)
          throw new PyError(edges.length ? '이 도형에서 나가는 화살표가 여러 개입니다.' : '이 도형에서 나가는 화살표가 없습니다.');
        next = edges[0].target;
      } else {
        const v = evaluate(parseExpr(cur.label), env);
        branch = truthy(v) ? '예' : '아니오';
        note = `${cur.label} → ${branch === '예' ? '참' : '거짓'} (${branch})`;
        const e = edges.find((x) => x.label === branch);
        if (!e) throw new PyError(`판단 도형에 '${branch}' 화살표가 없습니다.`);
        next = e.target;
      }
    } catch (e) {
      if (!(e instanceof PyError)) throw e;
      error = e.message;
    }

    const after = snapshot(vars);
    const changed = after.filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
    // 계산 결과를 함께 보여 준다: "i = i + 1 → i = 3"
    if (!error && cur.kind === 'process' && changed.length && !/^(입력|출력)/.test(note)) {
      const vals = new Map(after);
      note += `  →  ${changed.map((k) => `${k} = ${vals.get(k)}`).join(', ')}`;
    }
    steps.push({
      nodeId: cur.id,
      note: error ? `오류: ${error}` : note,
      vars: after,
      changed,
      printed,
      outputCount: output.length,
      branch,
      error,
    });

    if (error || trace.finished || !next) break;
    if (n + 1 >= maxSteps) {
      steps.push({
        nodeId: next,
        note: `${maxSteps}단계가 넘었습니다. 끝나지 않는 반복인지 확인해 보세요.`,
        vars: after,
        changed: [],
        printed: [],
        outputCount: output.length,
        error: `${maxSteps}단계가 넘었습니다. 끝나지 않는 반복인지 확인해 보세요.`,
      });
      break;
    }
    cur = byId.get(next)!;
  }
  trace.inputsUsed = inputsUsed;
  return trace;
}

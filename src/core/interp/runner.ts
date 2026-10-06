// 순서도 단계별 실행: 시작 터미널에서 화살표를 따라가며 도형 글자를 계산하고,
// 단계마다 변수 값과 출력을 기록한다. (의사코드가 없어도, 학생이 그린 순서도도 실행할 수 있다)
//
// 함수: 터미널 글자가 '이름(매개변수)'인 순서도는 함수다. 식 안에서 그 이름을 부르면
// 그 순서도로 들어가 실행하고, '반환 값' 터미널에서 값을 돌려받는다.

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
  /** 이 단계를 마친 뒤의 변수 값 (repr). 함수 안의 변수는 '함수이름:변수' */
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
const MAX_DEPTH = 100;

const AUG = /^(.+?)\s*(\*\*|\/\/|[+\-*/%])=\s*(.+)$/s;
const FUNC_HEAD = /^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)$/su;
const RETURN = /^반환(?:\s+(.*))?$/s;

/** 실행을 멈춰야 할 때 (오류 단계는 이미 기록됨) */
class Stop extends Error {}

/** 함수 순서도 찾기: 들어오는 화살표가 없는 터미널 중 글자가 '이름(매개변수)'인 것 */
export function findFunctions(g: FlowGraph): Map<string, { start: FlowNode; params: string[] }> {
  const fns = new Map<string, { start: FlowNode; params: string[] }>();
  for (const n of g.nodes) {
    if (n.kind !== 'terminal' || g.edges.some((e) => e.target === n.id)) continue;
    const m = n.label.trim().match(FUNC_HEAD);
    if (m) fns.set(m[1], { start: n, params: m[2].trim() ? splitTopLevel(m[2]) : [] });
  }
  return fns;
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
  const functions = findFunctions(g);
  const funcStarts = new Set([...functions.values()].map((f) => f.start.id));
  const start = g.nodes.find(
    (n) => n.kind === 'terminal' && !funcStarts.has(n.id) && !g.edges.some((e) => e.target === n.id),
  );

  const globals = new Map<string, PyValue>();
  const output: string[] = [];
  let inputsUsed = 0;
  const readInput = () => {
    if (inputsUsed >= inputs.length)
      throw new PyError(`입력값이 부족합니다. 입력값 칸에 ${inputsUsed + 1}번째 값을 적어 주세요.`);
    return inputs[inputsUsed++];
  };
  const steps: TraceStep[] = [];
  const trace: Trace = { steps, output, finished: false, inputsUsed: 0 };

  /** 지금 실행 중인 함수들 (바깥 → 안쪽) — 변수 표에 함께 보여 준다 */
  const frames: { name: string; vars: Map<string, PyValue> }[] = [];

  const snapshot = (): [string, string][] => [
    ...[...globals].map(([k, v]): [string, string] => [k, repr(cloneValue(v))]),
    ...frames.flatMap((f) => [...f.vars].map(([k, v]): [string, string] => [`${f.name}:${k}`, repr(cloneValue(v))])),
  ];

  const pushStep = (s: Omit<TraceStep, 'outputCount'>) => {
    steps.push({ ...s, outputCount: output.length });
    if (s.error) throw new Stop();
    if (steps.length >= maxSteps) {
      const msg = `${maxSteps}단계가 넘었습니다. 끝나지 않는 반복인지 확인해 보세요.`;
      steps.push({ ...s, note: msg, error: msg, changed: [], printed: [], outputCount: output.length });
      throw new Stop();
    }
  };

  /**
   * from 도형부터 화살표를 따라 실행한다.
   * 본 순서도는 '끝'에서, 함수는 '반환' 터미널에서 멈추고 돌려줄 값을 돌려준다.
   */
  const execFrom = (from: FlowNode, env: Env, entry: { note: string; changed: string[] }): PyValue => {
    let cur = from;
    let first = true;
    for (;;) {
      const before = new Map(snapshot());
      const printed: string[] = [];
      let note = '';
      let branch: '예' | '아니오' | undefined;
      let next: string | undefined;
      let result: PyValue | undefined;
      const edges = outs(cur.id);
      let changed: string[] = [];

      try {
        if (cur.kind === 'terminal') {
          const ret = cur.label.trim().match(RETURN);
          if (first) {
            note = entry.note;
            changed = entry.changed;
            if (edges.length !== 1) throw new PyError('시작에서 나가는 화살표가 하나여야 합니다.');
            next = edges[0].target;
          } else if (frames.length && ret) {
            result = ret[1] ? evaluate(parseExpr(ret[1]), env) : null;
            note = `반환 → ${repr(result)}`;
          } else if (frames.length) {
            throw new PyError(`함수 순서도는 '반환' 터미널로 끝나야 합니다. ('${cur.label}')`);
          } else if (ret) {
            throw new PyError("'반환'은 함수 순서도에서만 쓸 수 있습니다.");
          } else {
            note = '끝';
            trace.finished = true;
            result = null;
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
        if (e instanceof Stop) throw e;
        if (!(e instanceof PyError)) throw e;
        pushStep({ nodeId: cur.id, note: `오류: ${e.message}`, vars: snapshot(), changed: [], printed, error: e.message });
      }

      const after = snapshot();
      if (!first || !entry.changed.length) changed = after.filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
      // 계산 결과를 함께 보여 준다: "i = i + 1 → i = 3"
      if (cur.kind === 'process' && changed.length && !/^(입력|출력)/.test(note)) {
        const vals = new Map(after);
        note += `  →  ${changed.map((k) => `${k} = ${vals.get(k)}`).join(', ')}`;
      }
      pushStep({ nodeId: cur.id, note, vars: after, changed, printed, branch });
      if (result !== undefined) return result;
      cur = byId.get(next!)!;
      first = false;
    }
  };

  /** 식 안에서 사용자 함수를 부를 때 */
  const callUser = (name: string, args: PyValue[]): PyValue | undefined => {
    const fn = functions.get(name);
    if (!fn) return undefined;
    if (args.length !== fn.params.length)
      throw new PyError(`${name}()에는 값 ${fn.params.length}개를 넣어야 합니다. (지금 ${args.length}개)`);
    if (frames.length >= MAX_DEPTH) throw new PyError(`함수를 너무 깊이 불렀습니다. (${MAX_DEPTH}번 넘게) 끝나지 않는 재귀인지 확인해 보세요.`);
    const vars = new Map<string, PyValue>();
    fn.params.forEach((p, i) => vars.set(p, args[i]));
    frames.push({ name, vars });
    try {
      return execFrom(fn.start, { vars, globals, readInput, callUser }, {
        note: `${name}(${args.map(repr).join(', ')}) 호출${fn.params.length ? ` → ${fn.params.map((p, i) => `${p} = ${repr(args[i])}`).join(', ')}` : ''}`,
        changed: fn.params.map((p) => `${name}:${p}`),
      });
    } finally {
      frames.pop();
    }
  };

  if (!start) {
    const msg = '시작 터미널을 찾을 수 없습니다.';
    steps.push({ nodeId: '', note: msg, vars: [], changed: [], printed: [], outputCount: 0, error: msg });
    return trace;
  }

  try {
    execFrom(start, { vars: globals, readInput, callUser }, { note: '시작', changed: [] });
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  }
  trace.inputsUsed = inputsUsed;
  return trace;
}

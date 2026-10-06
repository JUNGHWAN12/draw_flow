// 순서도(도형 + 화살표) → AST 역변환
//
// 학생이 그린 순서도가 "구조적"(순차·선택·반복만으로 이루어짐)인지 확인하고,
// 그렇다면 파이썬식 의사코드로 되돌릴 수 있는 구문 트리를 만든다.
// 구조적이지 않으면 어느 도형이 문제인지 알려 준다.

import type { ForRangeStmt, FuncDef, IfStmt, SimpleStmt, Stmt } from './ast';
import type { FlowEdge, FlowGraph, FlowNode } from './types';
import { findAssignment } from './text';

export interface StructureIssue {
  nodeId?: string;
  message: string;
}

export type StructureResult = { ok: true; body: Stmt[] } | { ok: false; issues: StructureIssue[] };

const END = '__END__';
/** 모든 갈래가 break/continue로 빠져나가 다음으로 이어지는 흐름이 없음 */
const JUMPED = '__JUMPED__';

class StructureError extends Error {
  readonly nodeId?: string;
  constructor(message: string, nodeId?: string) {
    super(message);
    this.nodeId = nodeId;
  }
}

interface LoopCtx {
  head: string;
  exit: string;
}

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
/** 함수 순서도의 시작 터미널: '이름(매개변수)' */
const FUNC_HEAD = /^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)$/su;
/** 함수 순서도의 반환 터미널: '반환' 또는 '반환 값' */
const RETURN = /^반환(?:\s+(.*))?$/s;

/** 간단한 비교식은 반대로 뒤집고, 그 밖에는 not ( … ) 으로 감싼다 */
export function negate(cond: string): string {
  const c = cond.trim();
  const m = c.match(/^not\s*\((.*)\)$/s);
  if (m) return m[1].trim();
  if (!/\b(and|or|not)\b/.test(c)) {
    const ops: [RegExp, string][] = [
      [/^(.+?)\s*==\s*(.+)$/s, '!='],
      [/^(.+?)\s*!=\s*(.+)$/s, '=='],
      [/^(.+?)\s*<=\s*(.+)$/s, '>'],
      [/^(.+?)\s*>=\s*(.+)$/s, '<'],
      [/^(.+?)\s*<\s*(.+)$/s, '>='],
      [/^(.+?)\s*>\s*(.+)$/s, '<='],
    ];
    for (const [re, op] of ops) {
      const mm = c.match(re);
      if (mm && !/[<>=!]/.test(mm[2])) return `${mm[1]} ${op} ${mm[2]}`;
    }
  }
  return `not (${c})`;
}

/** 도형 글자 → 문장 */
function labelToSimple(label: string, line?: number): SimpleStmt {
  const t = label.trim();
  const inp = t.match(/^입력\s*(?::\s*(.*))?$/s);
  if (inp) return { type: 'simple', role: 'input', text: (inp[1] ?? '').trim(), line: line ?? 0 };
  const out = t.match(/^출력\s*(?::\s*(.*))?$/s);
  if (out) return { type: 'simple', role: 'output', text: (out[1] ?? '').trim(), line: line ?? 0 };
  return { type: 'simple', role: 'process', text: t.replace(/\s*←\s*/, ' = '), line: line ?? 0 };
}

class Structurer {
  private readonly nodes = new Map<string, FlowNode>();
  private readonly out = new Map<string, FlowEdge[]>();
  private readonly heads = new Set<string>();
  private readonly done = new Set<string>();
  private readonly ends = new Set<string>();
  private readonly returns = new Set<string>();
  private mainStart = '';
  private readonly funcStarts: { id: string; name: string; params: string[]; line?: number }[] = [];

  constructor(g: FlowGraph) {
    for (const n of g.nodes) {
      this.nodes.set(n.id, n);
      this.out.set(n.id, []);
    }
    for (const e of g.edges) this.out.get(e.source)?.push(e);
  }

  run(g: FlowGraph): Stmt[] {
    const issues = this.validate(g);
    if (issues.length) throw issues;

    // 함수 순서도 → def
    const defs: FuncDef[] = [];
    for (const f of this.funcStarts) {
      this.findLoops(f.id);
      const { stmts, end } = this.seq(this.next(f.id), new Set(), null);
      if (end === END) throw new StructureError(`함수 '${f.name}' 순서도는 '반환' 터미널로 끝나야 합니다.`, f.id);
      // 맨 끝의 값 없는 '반환'은 코드에 쓰지 않아도 된다
      const last = stmts[stmts.length - 1];
      if (last?.type === 'return' && !last.value) stmts.pop();
      defs.push({ type: 'def', name: f.name, params: f.params, body: stmts, line: f.line ?? 0 });
    }

    this.findLoops(this.mainStart);
    const { stmts, end } = this.seq(this.next(this.mainStart), new Set(), null);
    if (end !== END && end !== JUMPED) throw new StructureError('흐름이 끝 터미널에 도착하지 않습니다.', end);
    return [...defs, ...stmts];
  }

  /** 도형마다 화살표 개수·라벨 검사 */
  private validate(g: FlowGraph): StructureIssue[] {
    const issues: StructureIssue[] = [];
    const incoming = (id: string) => g.edges.filter((e) => e.target === id).length;
    const terminals = g.nodes.filter((n) => n.kind === 'terminal');
    const starts = terminals.filter((n) => !incoming(n.id));
    for (const t of terminals) {
      if (!incoming(t.id) || this.out.get(t.id)!.length) continue;
      if (RETURN.test(t.label.trim())) this.returns.add(t.id);
      else this.ends.add(t.id);
    }
    const mains = starts.filter((n) => {
      const m = n.label.trim().match(FUNC_HEAD);
      if (!m) return true;
      const params = m[2].trim() ? m[2].split(',').map((p) => p.trim()) : [];
      if (params.some((p) => !IDENT.test(p)))
        issues.push({ nodeId: n.id, message: `함수 '${n.label}'의 매개변수 이름이 올바르지 않습니다.` });
      this.funcStarts.push({ id: n.id, name: m[1], params, line: n.line });
      return false;
    });

    if (mains.length !== 1)
      issues.push({
        message: mains.length
          ? '시작 터미널은 하나만 있어야 합니다. (함수 순서도는 시작 터미널에 "이름(매개변수)"를 씁니다)'
          : '시작 터미널이 없습니다.',
      });
    else this.mainStart = mains[0].id;
    if (!this.ends.size) issues.push({ message: '끝 터미널이 없습니다.' });

    for (const n of g.nodes) {
      const outs = this.out.get(n.id)!;
      if (n.kind === 'terminal') {
        if (starts.includes(n) && outs.length !== 1)
          issues.push({ nodeId: n.id, message: '시작 터미널에서는 화살표가 하나만 나가야 합니다.' });
        if (!starts.includes(n) && outs.length)
          issues.push({ nodeId: n.id, message: '끝 터미널에서는 화살표가 나가면 안 됩니다.' });
      } else if (n.kind === 'process') {
        if (outs.length !== 1)
          issues.push({
            nodeId: n.id,
            message: `처리 '${n.label}'에서 나가는 화살표는 하나여야 합니다. (지금 ${outs.length}개)`,
          });
      } else {
        const labels = outs.map((e) => e.label).sort();
        if (outs.length !== 2 || labels[0] !== '아니오' || labels[1] !== '예')
          issues.push({
            nodeId: n.id,
            message: `판단 '${n.label}'에서는 '예'와 '아니오' 화살표가 하나씩 나가야 합니다. (화살표를 더블클릭하면 라벨이 바뀝니다)`,
          });
      }
    }
    if (issues.length) return issues;

    // 시작에서 도달할 수 없는 도형
    const seen = new Set<string>();
    const stack = starts.map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of this.out.get(id)!) stack.push(e.target);
    }
    for (const n of g.nodes)
      if (!seen.has(n.id)) issues.push({ nodeId: n.id, message: `'${n.label}'은(는) 시작에서 이어지지 않습니다.` });
    return issues;
  }

  /** 깊이 우선 탐색으로 되돌아가는 화살표를 찾아 반복의 머리(판단)를 정한다 */
  private findLoops(start: string) {
    const state = new Map<string, 1 | 2>();
    const visit = (id: string) => {
      state.set(id, 1);
      for (const e of this.out.get(id)!) {
        const s = state.get(e.target);
        if (s === 1) {
          if (this.nodes.get(e.target)!.kind !== 'decision')
            throw new StructureError('되돌아가는 화살표는 반복 조건(판단 도형)으로 들어가야 합니다.', e.target);
          this.heads.add(e.target);
        } else if (!s) {
          visit(e.target);
        }
      }
      state.set(id, 2);
    };
    visit(start);
  }

  private next(id: string): string {
    const t = this.out.get(id)![0].target;
    return this.ends.has(t) ? END : t;
  }

  private branch(id: string, label: '예' | '아니오'): string {
    const t = this.out.get(id)!.find((e) => e.label === label)!.target;
    return this.ends.has(t) ? END : t;
  }

  /** from에서 출발해 막힌 도형(blocked)을 지나지 않고 갈 수 있는 도형들 */
  private reach(from: string, blocked: Set<string>): Set<string> {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (id === END || blocked.has(id)) continue;
      for (const e of this.out.get(id)!) stack.push(this.ends.has(e.target) ? END : e.target);
    }
    return seen;
  }

  /** 차례대로 이어지는 문장들. 멈춤 도형(stops)이나 끝에 닿으면 멈춘다. */
  private seq(start: string, stops: Set<string>, loop: LoopCtx | null): { stmts: Stmt[]; end: string } {
    const stmts: Stmt[] = [];
    let cur = start;
    for (;;) {
      if (cur === END || stops.has(cur)) return { stmts, end: cur };
      if (this.done.has(cur))
        throw new StructureError(
          '이미 지나온 도형으로 화살표가 되돌아갑니다. 반복은 판단 도형을 거쳐서만 만들 수 있습니다.',
          cur,
        );
      const n = this.nodes.get(cur)!;
      if (n.kind === 'terminal' && this.returns.has(cur)) {
        this.done.add(cur);
        const value = n.label.trim().match(RETURN)![1]?.trim() ?? '';
        stmts.push({ type: 'return', value, line: n.line ?? 0 });
        return { stmts, end: JUMPED };
      }
      if (n.kind === 'terminal') throw new StructureError('순서도 중간에 터미널이 있습니다.', cur);
      if (this.heads.has(cur)) {
        const { stmt, exit } = this.whileLoop(n, stops);
        stmts.push(stmt);
        cur = exit;
      } else if (n.kind === 'decision') {
        const { stmt, next } = this.ifStmt(n, stops, loop);
        stmts.push(stmt);
        if (next === JUMPED) return { stmts, end: JUMPED };
        cur = next;
      } else {
        this.done.add(cur);
        stmts.push(labelToSimple(n.label, n.line));
        cur = this.next(cur);
      }
    }
  }

  private whileLoop(d: FlowNode, outer: Set<string>): { stmt: Stmt; exit: string } {
    this.done.add(d.id);
    const yes = this.branch(d.id, '예');
    const no = this.branch(d.id, '아니오');
    const blocked = new Set(outer);
    const yesLoops = this.reach(yes, blocked).has(d.id);
    const noLoops = this.reach(no, blocked).has(d.id);
    if (yesLoops === noLoops)
      throw new StructureError(
        yesLoops
          ? `반복 '${d.label}'의 예/아니오 갈래가 모두 다시 반복으로 돌아옵니다.`
          : `반복 '${d.label}'으로 되돌아오는 갈래를 찾을 수 없습니다.`,
        d.id,
      );
    const [bodyStart, exit, cond] = yesLoops ? [yes, no, d.label] : [no, yes, negate(d.label)];
    const stops = new Set([...outer, d.id, exit]);
    const { stmts, end } = this.seq(bodyStart, stops, { head: d.id, exit });
    if (end === exit) stmts.push({ type: 'break', line: d.line ?? 0 });
    else if (end !== d.id && end !== JUMPED)
      throw new StructureError('반복 안에서 바깥 반복으로 바로 빠져나갈 수 없습니다.', d.id);
    return { stmt: { type: 'while', cond, body: stmts, line: d.line ?? 0 }, exit };
  }

  private ifStmt(d: FlowNode, outer: Set<string>, loop: LoopCtx | null): { stmt: Stmt; next: string } {
    this.done.add(d.id);
    const yes = this.branch(d.id, '예');
    const no = this.branch(d.id, '아니오');

    // 두 갈래가 다시 만나는 첫 도형
    const ry = this.reach(yes, outer);
    const rn = this.reach(no, outer);
    const common = [...ry].filter((id) => rn.has(id));
    let merge = common.find((c) => common.every((o) => o === c || this.reach(c, outer).has(o))) ?? null;

    // 'if 조건: return …' 처럼 한쪽 갈래가 함수를 끝내면, 다른 갈래가 if 다음 문장이 된다
    if (!merge) {
      const flowsOn = (r: Set<string>) =>
        r.has(END) || [...r].some((x) => outer.has(x)) || (!!loop && (r.has(loop.head) || r.has(loop.exit)));
      if (!flowsOn(ry)) merge = no;
      else if (!flowsOn(rn)) merge = yes;
    }

    // 'if 조건: break' 처럼 한쪽 갈래만 반복을 빠져나가면, 다른 갈래가 if 다음 문장이 된다
    if (!merge && loop) {
      const jumps = (r: Set<string>, to: string) => r.has(to) && ![...r].some((x) => x !== to && rn.has(x) && ry.has(x));
      if (jumps(ry, loop.exit)) merge = no;
      else if (jumps(rn, loop.exit)) merge = yes;
      else if (jumps(ry, loop.head)) merge = no;
      else if (jumps(rn, loop.head)) merge = yes;
    }

    const stops = new Set(outer);
    if (merge && merge !== END) stops.add(merge);
    const finish = (part: { stmts: Stmt[]; end: string }): Stmt[] => {
      const { stmts, end } = part;
      if (end === merge || end === JUMPED) return stmts;
      if (loop && end === loop.head) return [...stmts, { type: 'continue', line: d.line ?? 0 }];
      if (loop && end === loop.exit) return [...stmts, { type: 'break', line: d.line ?? 0 }];
      if (end === END) throw new StructureError(`'${d.label}'의 한쪽 갈래만 끝으로 갑니다. 두 갈래가 다시 만나야 합니다.`, d.id);
      throw new StructureError(`'${d.label}'의 두 갈래가 다시 만나는 곳을 찾을 수 없습니다.`, d.id);
    };
    let yesBody = finish(this.seq(yes, stops, loop));
    let noBody = finish(this.seq(no, stops, loop));
    let cond = d.label;

    // 예 쪽이 비어 있으면 조건을 뒤집어 읽기 쉽게
    if (!yesBody.length && noBody.length) {
      [yesBody, noBody] = [noBody, yesBody];
      cond = negate(cond);
    }
    const stmt: IfStmt = {
      type: 'if',
      branches: [{ cond, body: yesBody.length ? yesBody : [{ type: 'pass', line: d.line ?? 0 }], line: d.line ?? 0 }],
      line: d.line ?? 0,
    };
    if (noBody.length === 1 && noBody[0].type === 'if') {
      stmt.branches.push(...noBody[0].branches);
      stmt.elseBody = noBody[0].elseBody;
    } else if (noBody.length) {
      stmt.elseBody = noBody;
    }
    return { stmt, next: merge ?? JUMPED };
  }
}

// ── for 문 되살리기 ─────────────────────────────────────

function assigns(stmts: Stmt[], v: string): boolean {
  return stmts.some((s) => {
    switch (s.type) {
      case 'simple': {
        if (s.role === 'input') return s.text.split(',').some((x) => x.trim() === v);
        const a = findAssignment(s.text);
        return !!a && s.text.slice(0, a.index).split(',').some((x) => x.trim() === v);
      }
      case 'if':
        return s.branches.some((b) => assigns(b.body, v)) || assigns(s.elseBody ?? [], v);
      case 'while':
      case 'forRange':
      case 'forEach':
        return (s.type !== 'while' && s.variable === v) || assigns(s.body, v);
      default:
        return false;
    }
  });
}

function mentions(stmts: Stmt[], v: string): boolean {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${v}([^\\p{L}\\p{N}_]|$)`, 'u');
  return stmts.some((s) => {
    switch (s.type) {
      case 'simple':
        return re.test(s.text);
      case 'if':
        return s.branches.some((b) => re.test(b.cond) || mentions(b.body, v)) || mentions(s.elseBody ?? [], v);
      case 'while':
        return re.test(s.cond) || mentions(s.body, v);
      case 'forRange':
        return re.test(`${s.start} ${s.stop} ${s.step}`) || mentions(s.body, v);
      case 'forEach':
        return re.test(s.iterable) || mentions(s.body, v);
      default:
        return false;
    }
  });
}

/** `i = a` + `while i <= b:` … `i = i + 1` → `for i in range(a, b + 1):` */
function toFor(init: Stmt, loop: Stmt): ForRangeStmt | null {
  if (init.type !== 'simple' || init.role !== 'process' || loop.type !== 'while') return null;
  const ia = findAssignment(init.text);
  if (!ia || ia.op !== '=') return null;
  const v = init.text.slice(0, ia.index).trim();
  const start = init.text.slice(ia.index + 1).trim();
  if (!IDENT.test(v)) return null;

  const c = loop.cond.match(/^(\S+)\s*(<=|<|>=|>)\s*(.+)$/s);
  if (!c || c[1] !== v) return null;
  const last = loop.body[loop.body.length - 1];
  if (!last || last.type !== 'simple' || last.role !== 'process') return null;
  const inc = last.text.match(/^(\S+)\s*=\s*(\S+)\s*([+-])\s*(.+)$/s);
  if (!inc || inc[1] !== v || inc[2] !== v) return null;
  const body = loop.body.slice(0, -1);
  if (assigns(body, v)) return null;

  const [, , op, bound] = c;
  const up = inc[3] === '+';
  const k = inc[4].trim();
  if (up !== (op === '<' || op === '<=')) return null;
  const num = /^-?\d+$/.test(bound.trim());
  let stop = bound.trim();
  if (op === '<=') stop = num ? String(Number(stop) + 1) : stop.match(/^(.*\S)\s*-\s*1$/)?.[1] ?? `${stop} + 1`;
  if (op === '>=') stop = num ? String(Number(stop) - 1) : stop.match(/^(.*\S)\s*\+\s*1$/)?.[1] ?? `${stop} - 1`;
  const step = up ? k : /^\d+$/.test(k) ? `-${k}` : `-(${k})`;
  return { type: 'forRange', variable: v, start, stop, step, body, line: loop.line };
}

/** 구조를 읽기 좋게: while을 for로, 순번 반복을 for x in 목록으로 */
export function prettify(stmts: Stmt[]): Stmt[] {
  const out: Stmt[] = [];
  for (let i = 0; i < stmts.length; i++) {
    let s = stmts[i];
    if (s.type === 'if')
      s = {
        ...s,
        branches: s.branches.map((b) => ({ ...b, body: prettify(b.body) })),
        elseBody: s.elseBody && prettify(s.elseBody),
      };
    else if (s.type === 'while' || s.type === 'def') s = { ...s, body: prettify(s.body) };

    const f = s.type === 'while' && out.length ? toFor(out[out.length - 1], s) : null;
    if (f) {
      out.pop();
      // k = 0 … k < len(목록) … x = 목록[k] → for x in 목록
      const first = f.body[0];
      const len = f.stop.match(/^len\((.+)\)$/s);
      if (len && f.start === '0' && f.step === '1' && first?.type === 'simple' && first.role === 'process') {
        const m = first.text.match(/^(.+?)\s*=\s*(.+)\[(.+)\]$/s);
        const list = len[1].trim();
        const listExpr = m?.[2].trim().replace(/^\((.*)\)$/s, '$1');
        if (m && listExpr === list && m[3].trim() === f.variable && !mentions(f.body.slice(1), f.variable)) {
          out.push({ type: 'forEach', variable: m[1].trim(), iterable: list, body: f.body.slice(1), line: f.line });
          continue;
        }
      }
      out.push(f);
      continue;
    }
    out.push(s);
  }
  return out;
}

export function graphToAst(g: FlowGraph): StructureResult {
  try {
    return { ok: true, body: prettify(new Structurer(g).run(g)) };
  } catch (e) {
    if (Array.isArray(e)) return { ok: false, issues: e as StructureIssue[] };
    if (e instanceof StructureError) return { ok: false, issues: [{ nodeId: e.nodeId, message: e.message }] };
    throw e;
  }
}

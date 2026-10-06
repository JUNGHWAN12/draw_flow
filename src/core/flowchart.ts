// AST → 순서도 (도형 + 화살표 + 좌표)
//
// 코드의 구조를 그대로 따라 배치하는 "구조적 배치"를 사용한다.
// - 순서대로 실행되는 문장은 가운데 세로줄(척추)에 위에서 아래로 쌓는다.
// - 판단의 '예'는 아래로, '아니오'는 오른쪽으로 나간다.
// - 반복의 되돌아가는 화살표는 왼쪽 통로로 올라가 판단의 왼쪽으로 들어간다.
// - 반복을 빠져나가는 화살표(아니오, break)는 오른쪽 통로로 내려간다.
//
// 각 구문은 '상자(Box)'로 만들어진다. 상자의 입구는 (0, 0)이고, 다음 문장으로 이어질
// 선(out)은 모두 상자의 바닥(y = height)까지 내려와 있다. break/continue 선은
// 빠져나가는 지점에 멈춰 있다가, 그 선이 속한 반복문이 도형을 피해 통로로 잇는다.

import type { ForEachStmt, ForRangeStmt, IfStmt, Stmt } from './ast';
import type { EdgeLabel, FlowEdge, FlowGraph, FlowNode, NodeKind, Point, Side } from './types';
import { nodeSize } from './shapes';
import { pickIndexVar, rangeCondition, rangeIncrement, toArrow } from './labels';

export interface BuildOptions {
  /** 대입을 '←'로 표시할지 (기본: 파이썬 그대로 '=') */
  arrowAssign?: boolean;
}

const GAP = 36; // 위아래 도형 사이 간격
const COL_GAP = 36; // 나란한 갈래 사이 간격
const LANE = 24; // 통로(우회하는 화살표)와 도형 사이 간격
const LABEL_ROOM = 56; // 판단 오른쪽 꼭짓점에서 첫 세로선까지 (아니오/예 라벨 자리)
const PAD = 24; // 그림 바깥 여백

interface End {
  id: string;
  side: Side;
  label?: EdgeLabel;
}

/** 그리는 중인 화살표. from이 null이면 '상자 입구'에서 시작한다. */
interface Wire {
  from: End | null;
  to?: { id: string; side: Side };
  pts: Point[];
}

interface Box {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** 상자 입구에서 안쪽 도형으로 들어가는 선 */
  ins: Wire[];
  /** 다음 문장으로 이어질 선 */
  out: Wire[];
  /** 아직 처리되지 않은 break / continue 선 */
  brk: Wire[];
  cont: Wire[];
  left: number;
  right: number;
  height: number;
  /** 도형이 하나도 없는 상자 (pass 등) */
  empty: boolean;
}

type Piece = Box | 'break' | 'continue' | null;

// ── 선 다루기 ──────────────────────────────────────────

const last = (w: Wire) => w.pts[w.pts.length - 1];

function push(w: Wire, p: Point) {
  const a = w.pts[w.pts.length - 2];
  const b = last(w);
  if (b && b.x === p.x && b.y === p.y) return;
  // 같은 방향으로 이어지면 중간 점을 없앤다
  if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) {
    w.pts[w.pts.length - 1] = { ...p };
    return;
  }
  w.pts.push({ ...p });
}

function down(w: Wire, y: number) {
  const p = last(w);
  if (y > p.y) push(w, { x: p.x, y });
}

function isHorizontal(w: Wire): boolean {
  if (w.pts.length < 2) return w.from?.side === 'r' || w.from?.side === 'l';
  const a = w.pts[w.pts.length - 2];
  return a.y === last(w).y;
}

/** 선을 목표 지점(아래쪽)까지 직각으로 잇는다 */
function routeTo(w: Wire, target: Point, mergeY: number) {
  const p = last(w);
  if (p.x === target.x) return push(w, target);
  if (isHorizontal(w)) {
    push(w, { x: target.x, y: p.y });
  } else {
    push(w, { x: p.x, y: mergeY });
    push(w, { x: target.x, y: mergeY });
  }
  push(w, target);
}

function join(w: Wire, c: Wire): Wire {
  const nw: Wire = { from: w.from, to: c.to, pts: w.pts.map((p) => ({ ...p })) };
  for (const p of c.pts) push(nw, p);
  return nw;
}

function shift(b: Box, dx: number, dy: number): Box {
  const mv = (w: Wire): Wire => ({ ...w, pts: w.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
  return {
    nodes: b.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    edges: b.edges.map((e) => ({ ...e, points: e.points?.map((p) => ({ x: p.x + dx, y: p.y + dy })) })),
    ins: b.ins.map(mv),
    out: b.out.map(mv),
    brk: b.brk.map(mv),
    cont: b.cont.map(mv),
    left: b.left + dx,
    right: b.right + dx,
    height: b.height,
    empty: b.empty,
  };
}

function emptyBox(): Box {
  return {
    nodes: [],
    edges: [],
    ins: [],
    out: [{ from: null, pts: [{ x: 0, y: 0 }] }],
    brk: [],
    cont: [],
    left: 0,
    right: 0,
    height: 0,
    empty: true,
  };
}

// ── 만들기 ─────────────────────────────────────────────

class Builder {
  private nodeSeq = 0;
  private edgeSeq = 0;
  private readonly opts: BuildOptions;

  constructor(opts: BuildOptions) {
    this.opts = opts;
  }

  private edge(w: Wire): FlowEdge {
    return {
      id: `e${++this.edgeSeq}`,
      source: w.from!.id,
      sourceHandle: w.from!.side,
      label: w.from!.label,
      target: w.to!.id,
      targetHandle: w.to!.side,
      points: w.pts.map((p) => ({ ...p })),
    };
  }

  /** 들어오는 선(incoming)을 자식 상자의 입구에 붙여 acc에 합친다 */
  private absorb(acc: Box, child: Box, incoming: Wire[]) {
    acc.nodes.push(...child.nodes);
    acc.edges.push(...child.edges);
    for (const key of ['ins', 'out', 'brk', 'cont'] as const) {
      for (const c of child[key]) {
        if (c.from) {
          acc[key].push(c);
          continue;
        }
        for (const w of incoming) {
          const j = join(w, c);
          if (key === 'ins') {
            if (j.from) acc.edges.push(this.edge(j));
            else acc.ins.push(j);
          } else {
            acc[key].push(j);
          }
        }
      }
    }
  }

  private newNode(kind: NodeKind, label: string, line?: number): FlowNode {
    const size = nodeSize(kind, label);
    return { id: `n${++this.nodeSeq}`, kind, label, line, x: -size.width / 2, y: 0, ...size };
  }

  leaf(kind: NodeKind, label: string, line?: number): Box {
    const n = this.newNode(kind, label, line);
    return {
      nodes: [n],
      edges: [],
      ins: [{ from: null, to: { id: n.id, side: 't' }, pts: [{ x: 0, y: 0 }] }],
      out: [{ from: { id: n.id, side: 'b' }, pts: [{ x: 0, y: n.height }] }],
      brk: [],
      cont: [],
      left: -n.width / 2,
      right: n.width / 2,
      height: n.height,
      empty: false,
    };
  }

  process(text: string, line?: number): Box {
    return this.leaf('process', this.opts.arrowAssign ? toArrow(text) : text, line);
  }

  /** 위에서 아래로 차례대로 쌓기 */
  sequence(pieces: Piece[]): Box {
    const acc = emptyBox();
    for (const piece of pieces) {
      if (piece === null) continue;
      if (piece === 'break' || piece === 'continue') {
        (piece === 'break' ? acc.brk : acc.cont).push(...acc.out);
        acc.out = [];
        continue;
      }
      if (piece.empty && !piece.brk.length && !piece.cont.length) continue; // pass만 있는 블록

      const occupied = !acc.empty || acc.brk.length > 0 || acc.cont.length > 0;
      const y = occupied ? acc.height + GAP : 0;
      const incoming = acc.out;
      for (const w of incoming) routeTo(w, { x: 0, y }, y - GAP / 2);
      acc.out = [];
      const child = shift(piece, 0, y);
      this.absorb(acc, child, incoming);
      acc.height = y + piece.height;
      acc.left = Math.min(acc.left, child.left);
      acc.right = Math.max(acc.right, child.right);
      acc.empty = acc.empty && piece.empty;
    }
    for (const w of acc.out) down(w, acc.height);
    return acc;
  }

  block(stmts: Stmt[]): Box {
    return this.sequence(stmts.map((s) => this.stmt(s)));
  }

  stmt(s: Stmt): Piece {
    switch (s.type) {
      case 'simple':
        if (s.role === 'input') return this.leaf('process', s.text ? `입력: ${s.text}` : '입력', s.line);
        if (s.role === 'output') return this.leaf('process', s.text ? `출력: ${s.text}` : '출력', s.line);
        return this.process(s.text, s.line);
      case 'pass':
        return null;
      case 'break':
      case 'continue':
        return s.type;
      case 'if':
        return this.ifBox(s.branches, s.elseBody);
      case 'while':
        return this.loop(null, this.newNode('decision', s.cond, s.line), this.block(s.body), null);
      case 'forRange':
        return this.forRange(s);
      case 'forEach':
        return this.forEach(s);
    }
  }

  /** if / elif / else — elif는 '아니오' 쪽에 이어지는 if로 그린다 */
  private ifBox(branches: IfStmt['branches'], elseBody?: Stmt[]): Box {
    const [first, ...rest] = branches;
    const d = this.newNode('decision', first.cond, first.line);
    const { width: w, height: h } = d;

    const box: Box = {
      nodes: [d],
      edges: [],
      ins: [{ from: null, to: { id: d.id, side: 't' }, pts: [{ x: 0, y: 0 }] }],
      out: [],
      brk: [],
      cont: [],
      left: -w / 2,
      right: w / 2,
      height: h,
      empty: false,
    };

    const yesW: Wire = { from: { id: d.id, side: 'b', label: '예' }, pts: [{ x: 0, y: h }] };
    const noW: Wire = { from: { id: d.id, side: 'r', label: '아니오' }, pts: [{ x: w / 2, y: h / 2 }] };

    const yes = this.block(first.body);
    let no: Box | null = rest.length ? this.ifBox(rest, elseBody) : elseBody ? this.block(elseBody) : null;
    if (no && no.empty && !no.brk.length && !no.cont.length) no = null; // else: pass

    // 'if 조건: … break' 처럼 예 쪽이 반복을 빠져나가기만 하면, 예를 오른쪽으로 내고 아니오를 아래로 잇는다
    if (!no && !yes.out.length) {
      const yesR: Wire = { from: { id: d.id, side: 'r', label: '예' }, pts: [{ x: w / 2, y: h / 2 }] };
      if (yes.empty) {
        this.absorb(box, shift(yes, w / 2, h / 2), [yesR]);
      } else {
        const nx = Math.max(w / 2 + COL_GAP - Math.min(0, yes.left), w / 2 + LABEL_ROOM);
        const yN = h / 2 + GAP;
        routeTo(yesR, { x: nx, y: yN }, yN);
        const placed = shift(yes, nx, yN);
        this.absorb(box, placed, [yesR]);
        box.right = placed.right;
        box.height = Math.max(h, yN + yes.height);
      }
      const noDown: Wire = { from: { id: d.id, side: 'b', label: '아니오' }, pts: [{ x: 0, y: h }] };
      down(noDown, box.height);
      box.out.push(noDown);
      return box;
    }

    const yY = h + GAP;
    routeTo(yesW, { x: 0, y: yY }, yY);
    this.absorb(box, shift(yes, 0, yY), [yesW]);
    box.left = Math.min(box.left, yes.left);
    box.height = yY + yes.height;

    const rightOfYes = Math.max(w / 2, yes.right);
    if (no) {
      const nx = Math.max(rightOfYes + COL_GAP - Math.min(0, no.left), w / 2 + LABEL_ROOM);
      const yN = h / 2 + GAP;
      routeTo(noW, { x: nx, y: yN }, yN);
      const placed = shift(no, nx, yN);
      this.absorb(box, placed, [noW]);
      box.right = placed.right;
      box.height = Math.max(box.height, yN + no.height);
    } else {
      const lane = Math.max(rightOfYes + LANE, w / 2 + LABEL_ROOM);
      push(noW, { x: lane, y: h / 2 });
      box.out.push(noW);
      box.right = lane;
    }
    for (const x of box.out) down(x, box.height);
    return box;
  }

  /**
   * 반복: [초기화] → 판단 → (예) 본문 → [증가] → 왼쪽 통로로 판단에 되돌아감
   *                   └ (아니오) 오른쪽 통로로 반복 밖
   */
  private loop(init: Box | null, d: FlowNode, body: Box, incr: Box | null): Box {
    const { width: w, height: h } = d;
    const box: Box = {
      nodes: [],
      edges: [],
      ins: [],
      out: [],
      brk: [],
      cont: [],
      left: 0,
      right: 0,
      height: 0,
      empty: false,
    };

    let yD = 0;
    if (init) {
      this.absorb(box, init, [{ from: null, pts: [{ x: 0, y: 0 }] }]);
      const initOut = box.out;
      box.out = [];
      yD = init.height + GAP;
      for (const wire of initOut) {
        routeTo(wire, { x: 0, y: yD }, yD);
        box.edges.push(this.edge({ ...wire, to: { id: d.id, side: 't' } }));
      }
    } else {
      box.ins.push({ from: null, to: { id: d.id, side: 't' }, pts: [{ x: 0, y: 0 }] });
    }
    const dn: FlowNode = { ...d, y: yD };
    box.nodes.push(dn);
    const midY = yD + h / 2;

    // 본문
    const yB = yD + h + GAP;
    const yesW: Wire = { from: { id: d.id, side: 'b', label: '예' }, pts: [{ x: 0, y: yD + h }] };
    routeTo(yesW, { x: 0, y: yB }, yB);
    const inner = emptyBox();
    inner.out = [];
    this.absorb(inner, shift(body, 0, yB), [yesW]);
    box.nodes.push(...inner.nodes);
    box.edges.push(...inner.edges);
    let bottom = yB + body.height;
    const yC = bottom + GAP;
    const incrBox = incr ? shift(incr, 0, yC) : null;

    // 통로 위치: 왼쪽 = 되돌아가는 선, 오른쪽 = continue 선, 그 바깥 = 반복을 빠져나가는 선
    const laneL = Math.min(-w / 2, body.left, incr?.left ?? 0, init?.left ?? 0) - LANE;
    const laneC = Math.max(Math.max(body.right, incr?.right ?? 0, init?.right ?? 0) + LANE, w / 2 + LABEL_ROOM);
    const laneR = laneC + (inner.cont.length ? LANE : 0);

    const obstacles = [...box.nodes, ...(incrBox?.nodes ?? [])];
    const escape = (wire: Wire, laneX: number) => this.escape(wire, laneX, obstacles);

    // continue 선
    for (const c of inner.cont) {
      escape(c, laneC);
      if (incr) down(c, yC - GAP / 2);
    }

    // 증가 (for 문)
    let back: Wire[];
    if (incrBox) {
      const incoming = [...inner.out, ...inner.cont];
      for (const x of incoming) routeTo(x, { x: 0, y: yC }, yC - GAP / 2);
      const after = emptyBox();
      after.out = [];
      this.absorb(after, incrBox, incoming);
      box.nodes.push(...after.nodes);
      box.edges.push(...after.edges);
      back = after.out;
      bottom = yC + incrBox.height;
    } else {
      back = [...inner.out, ...inner.cont];
    }

    const backY = bottom + GAP / 2;
    for (const b of back) {
      down(b, backY);
      push(b, { x: laneL, y: backY });
      push(b, { x: laneL, y: midY });
      push(b, { x: -w / 2, y: midY });
      box.edges.push(this.edge({ ...b, to: { id: d.id, side: 'l' } }));
    }

    const noW: Wire = { from: { id: d.id, side: 'r', label: '아니오' }, pts: [{ x: w / 2, y: midY }] };
    push(noW, { x: laneR, y: midY });
    box.out.push(noW);

    // break 선은 도형을 피해 오른쪽 바깥 통로로 나가 '아니오' 선과 합류한다
    for (const b of inner.brk) {
      escape(b, laneR);
      box.out.push(b);
    }

    box.height = backY + GAP / 2;
    box.left = laneL;
    box.right = laneR;
    for (const o of box.out) down(o, box.height);
    return box;
  }

  /** break/continue 선을 도형과 겹치지 않는 가로선으로 통로(laneX)까지 보낸다 */
  private escape(w: Wire, laneX: number, obstacles: FlowNode[]) {
    const M = 6;
    const clear = (x1: number, y1: number, x2: number, y2: number, ignore?: string) =>
      obstacles.every(
        (n) =>
          n.id === ignore ||
          Math.max(x1, x2) <= n.x - M ||
          Math.min(x1, x2) >= n.x + n.width + M ||
          Math.max(y1, y2) <= n.y - M ||
          Math.min(y1, y2) >= n.y + n.height + M,
      );
    const src = w.from ? obstacles.find((n) => n.id === w.from!.id) : undefined;
    let p = last(w);

    // 처리 도형 바로 뒤의 break → 도형의 오른쪽 옆에서 바로 나간다
    if (src && src.kind === 'process' && w.pts.length === 1 && w.from!.side === 'b') {
      const side = { x: src.x + src.width, y: src.y + src.height / 2 };
      if (clear(side.x, side.y, laneX, side.y, src.id)) {
        w.from = { ...w.from!, side: 'r' };
        w.pts = [side];
        push(w, { x: laneX, y: side.y });
        return;
      }
    }

    if (isHorizontal(w)) {
      if (clear(p.x, p.y, laneX, p.y, src?.id)) return push(w, { x: laneX, y: p.y });
      push(w, { x: p.x + 12, y: p.y });
      p = last(w);
    }

    const ys = [p.y + 12, ...obstacles.map((n) => n.y + n.height + 10).filter((y) => y > p.y + 12)].sort(
      (a, b) => a - b,
    );
    const y = ys.find((yy) => clear(p.x, p.y + 1, p.x, yy, src?.id) && clear(p.x, yy, laneX, yy)) ?? ys[ys.length - 1];
    down(w, y);
    push(w, { x: laneX, y });
  }

  private forRange(s: ForRangeStmt): Box {
    const v = s.variable;
    return this.loop(
      this.process(`${v} = ${s.start}`, s.line),
      this.newNode('decision', rangeCondition(v, s.stop, s.step), s.line),
      this.block(s.body),
      this.process(rangeIncrement(v, s.step), s.line),
    );
  }

  private forEach(s: ForEachStmt): Box {
    const k = pickIndexVar(s);
    const it = /^[\p{L}_][\p{L}\p{N}_.]*$|^[[("'].*[\])"']$/u.test(s.iterable) ? s.iterable : `(${s.iterable})`;
    const pick = this.process(`${s.variable} = ${it}[${k}]`, s.line);
    return this.loop(
      this.process(`${k} = 0`, s.line),
      this.newNode('decision', `${k} < len(${s.iterable})`, s.line),
      this.sequence([pick, ...s.body.map((x) => this.stmt(x))]),
      this.process(`${k} = ${k} + 1`, s.line),
    );
  }
}

/** 의사코드 AST로 좌표까지 계산된 순서도를 만든다 */
export function buildFlowchart(program: Stmt[], opts: BuildOptions = {}): FlowGraph {
  const b = new Builder(opts);
  const start = b.leaf('terminal', '시작');
  const body = program.map((s) => b.stmt(s));
  const end = b.leaf('terminal', '끝');
  const all = b.sequence([start, ...body, end]);

  // 그림 전체를 왼쪽 위 여백에 맞추고, 도형 번호를 위→아래, 왼쪽→오른쪽 읽는 순서로 다시 매긴다
  let minX = Infinity;
  for (const n of all.nodes) minX = Math.min(minX, n.x);
  for (const e of all.edges) for (const p of e.points ?? []) minX = Math.min(minX, p.x);
  const dx = PAD - minX;
  const nodes = [...all.nodes].sort((a, z) => a.y - z.y || a.x - z.x);
  const ids = new Map(nodes.map((n, i) => [n.id, `n${i + 1}`]));
  return {
    nodes: nodes.map((n) => ({ ...n, id: ids.get(n.id)!, x: n.x + dx, y: n.y + PAD })),
    edges: all.edges.map((e, i) => ({
      ...e,
      id: `e${i + 1}`,
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
      points: e.points?.map((p) => ({ x: p.x + dx, y: p.y + PAD })),
    })),
  };
}

import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { buildFlowchart } from '../src/core/flowchart';
import { rangeCondition, rangeIncrement, toArrow } from '../src/core/labels';
import type { FlowGraph, FlowNode, Point, Side } from '../src/core/types';
import { EXAMPLES } from '../src/examples';

function chart(src: string, arrowAssign = false): FlowGraph {
  const r = parse(src);
  expect(r.errors).toEqual([]);
  return buildFlowchart(r.body, { arrowAssign });
}

function handle(n: FlowNode, side: Side): Point {
  return {
    t: { x: n.x + n.width / 2, y: n.y },
    b: { x: n.x + n.width / 2, y: n.y + n.height },
    l: { x: n.x, y: n.y + n.height / 2 },
    r: { x: n.x + n.width, y: n.y + n.height / 2 },
  }[side];
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/** 그림이 올바른지: 도형 4종만, 겹침 없음, 화살표는 연결 지점에서 시작해 연결 지점에서 끝나는 직각선 */
function checkGeometry(g: FlowGraph) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  for (const n of g.nodes) expect(['terminal', 'process', 'decision']).toContain(n.kind);
  for (let i = 0; i < g.nodes.length; i++) {
    for (let j = i + 1; j < g.nodes.length; j++) {
      const a = g.nodes[i];
      const b = g.nodes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${a.label} / ${b.label} 겹침`).toBe(false);
    }
  }
  for (const e of g.edges) {
    const pts = e.points!;
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(near(pts[0], handle(byId.get(e.source)!, e.sourceHandle)), `${e.id} 시작점`).toBe(true);
    expect(near(pts[pts.length - 1], handle(byId.get(e.target)!, e.targetHandle)), `${e.id} 끝점`).toBe(true);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y, `${e.id} 직각선`).toBe(true);
    }
  }
}

/** 흐름이 올바른지: 판단은 예/아니오 2갈래, 시작에서 끝까지 도달 가능 */
function checkFlow(g: FlowGraph) {
  const out = (id: string) => g.edges.filter((e) => e.source === id);
  const isEnd = (n: FlowNode) => n.kind === 'terminal' && (n.label === '끝' || n.label.startsWith('반환'));
  for (const n of g.nodes) {
    if (n.kind === 'decision') expect(out(n.id).map((e) => e.label).sort()).toEqual(['아니오', '예']);
    else if (isEnd(n)) expect(out(n.id)).toHaveLength(0);
    else expect(out(n.id)).toHaveLength(1);
  }
  const starts = g.nodes.filter((n) => n.kind === 'terminal' && !g.edges.some((e) => e.target === n.id));
  const end = g.nodes.find((n) => n.label === '끝')!;
  const seen = new Set(starts.map((n) => n.id));
  const stack = starts.map((n) => n.id);
  while (stack.length) for (const e of out(stack.pop()!)) if (!seen.has(e.target)) seen.add(e.target), stack.push(e.target);
  expect(seen.has(end.id)).toBe(true);
  expect(seen.size).toBe(g.nodes.length);
}

describe('buildFlowchart', () => {
  it.each(EXAMPLES.map((e) => [e.title, e.code]))('예제 "%s" — 그림과 흐름이 올바르다', (_, code) => {
    const g = chart(code);
    checkGeometry(g);
    checkFlow(g);
  });

  it('1~n 합계 예제의 도형 순서와 글자', () => {
    const g = chart(EXAMPLES.find((e) => e.id === 'sum')!.code);
    expect(g.nodes.map((n) => `${n.kind}:${n.label}`)).toEqual([
      'terminal:시작',
      'process:입력: n',
      'process:합 = 0',
      'process:i = 1',
      'decision:i <= n',
      'process:합 = 합 + i',
      'process:i = i + 1',
      'decision:합 > 100',
      'decision:합 == 100',
      'process:출력: "크다"',
      'process:출력: "작다"',
      'process:출력: "같다"',
      'process:출력: 합',
      'terminal:끝',
    ]);
  });

  it('반복의 되돌아가는 화살표는 판단의 왼쪽으로 들어간다', () => {
    const g = chart('while n > 0:\n    n = n - 1');
    const d = g.nodes.find((n) => n.kind === 'decision')!;
    const back = g.edges.filter((e) => e.target === d.id && e.targetHandle === 'l');
    expect(back).toHaveLength(1);
    expect(g.nodes.find((n) => n.id === back[0].source)!.label).toBe('n = n - 1');
  });

  it('break는 반복 다음 도형으로, continue는 증가 도형으로 이어진다', () => {
    const g = chart('for i in range(10):\n    if i == 3:\n        continue\n    if i == 7:\n        break\n    print(i)\nprint("끝남")');
    checkGeometry(g);
    checkFlow(g);
    const id = (label: string) => g.nodes.find((n) => n.label === label)!.id;
    const target = (src: string) => g.edges.find((e) => e.source === id(src) && e.label === '예')!.target;
    expect(target('i == 3')).toBe(id('i = i + 1'));
    expect(target('i == 7')).toBe(id('출력: "끝남"'));
  });

  it('for x in 목록 은 순번 변수로 풀어 쓴다', () => {
    const g = chart('for x in 점수:\n    print(x)');
    expect(g.nodes.map((n) => n.label)).toEqual(['시작', 'k = 0', 'k < len(점수)', 'x = 점수[k]', '출력: x', 'k = k + 1', '끝']);
  });

  it('대입을 ← 로 표시할 수 있다', () => {
    const g = chart('합 = 합 + i\nif a == b:\n    pass', true);
    expect(g.nodes.map((n) => n.label)).toContain('합 ← 합 + i');
    expect(g.nodes.map((n) => n.label)).toContain('a == b');
  });

  it('빈 프로그램은 시작 → 끝', () => {
    const g = chart('');
    expect(g.nodes.map((n) => n.label)).toEqual(['시작', '끝']);
    expect(g.edges).toHaveLength(1);
  });
});

describe('함수', () => {
  const SRC = 'def 두배(x):\n    return x * 2\n\ndef 부호(n):\n    if n < 0:\n        return "음수"\n    print(n)\n\nprint(두배(3))\n';

  it('함수마다 따로 된 순서도를 본 순서도 오른쪽에 그린다', () => {
    const g = chart(SRC);
    checkGeometry(g);
    checkFlow(g);
    const labels = g.nodes.filter((n) => n.kind === 'terminal').map((n) => n.label);
    expect(labels).toEqual(expect.arrayContaining(['시작', '끝', '두배(x)', '반환 x * 2', '부호(n)', '반환 "음수"', '반환']));
    const main = g.nodes.find((n) => n.label === '시작')!;
    const f = g.nodes.find((n) => n.label === '두배(x)')!;
    expect(f.x).toBeGreaterThan(main.x + main.width);
  });

  it('반환 터미널에서는 화살표가 나가지 않는다', () => {
    const g = chart(SRC);
    const ret = g.nodes.find((n) => n.label === '반환 "음수"')!;
    expect(g.edges.filter((e) => e.source === ret.id)).toHaveLength(0);
  });
});

describe('labels', () => {
  it('range 조건', () => {
    expect(rangeCondition('i', 'n + 1', '1')).toBe('i <= n');
    expect(rangeCondition('i', '10', '1')).toBe('i <= 9');
    expect(rangeCondition('i', 'n', '1')).toBe('i < n');
    expect(rangeCondition('i', '0', '-1')).toBe('i >= 1');
    expect(rangeCondition('i', 'n - 1', '-1')).toBe('i >= n');
    expect(rangeCondition('i', 'n', '-2')).toBe('i > n');
  });

  it('range 증가', () => {
    expect(rangeIncrement('i', '1')).toBe('i = i + 1');
    expect(rangeIncrement('i', '-2')).toBe('i = i - 2');
  });

  it('← 변환은 비교식을 건드리지 않는다', () => {
    expect(toArrow('x = y == z')).toBe('x ← y == z');
    expect(toArrow('a <= b')).toBe('a <= b');
  });
});

describe('긴 글자', () => {
  it('긴 처리·판단 글자는 도형을 여러 줄 높이로 키운다', () => {
    const g = chart(`x = "${'가'.repeat(40)}"\nif ${'a > 0 and '.repeat(6)}b > 0:\n    pass`);
    const p = g.nodes.find((n) => n.kind === 'process')!;
    const d = g.nodes.find((n) => n.kind === 'decision')!;
    expect(p.height).toBeGreaterThan(44);
    expect(p.width).toBeLessThanOrEqual(340);
    expect(d.height).toBeGreaterThan(72);
    checkGeometry(g);
  });

  it('판단 오른쪽 라벨 자리에 다른 세로선이 지나가지 않는다', () => {
    for (const ex of EXAMPLES) {
      const g = chart(ex.code);
      for (const d of g.nodes.filter((n) => n.kind === 'decision')) {
        const tipX = d.x + d.width;
        const y = d.y + d.height / 2;
        for (const e of g.edges) {
          const pts = e.points!;
          for (let i = 1; i < pts.length; i++) {
            const [a, b] = [pts[i - 1], pts[i]];
            const vertical = a.x === b.x && Math.min(a.y, b.y) < y - 1 && Math.max(a.y, b.y) > y - 24;
            if (vertical) expect(a.x <= tipX || a.x >= tipX + 50, `${ex.title}: ${d.label}`).toBe(true);
          }
        }
      }
    }
  });
});

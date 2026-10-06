import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { buildFlowchart } from '../src/core/flowchart';
import { graphToAst, negate } from '../src/core/structure';
import { toPseudocode } from '../src/core/codegen';
import type { FlowGraph } from '../src/core/types';
import { EXAMPLES } from '../src/examples';

function roundTrip(src: string): string {
  const g = buildFlowchart(parse(src).body);
  const r = graphToAst(g);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return toPseudocode(r.body);
}

/** input("…")·int(…) 처럼 순서도에 남지 않는 부분을 지운 기대값 */
function normalize(src: string): string {
  return toPseudocode(parse(src).body);
}

describe('순서도 → 의사코드 (왕복 변환)', () => {
  it.each(EXAMPLES.map((e) => [e.title, e.code]))('예제 "%s"', (_, code) => {
    expect(roundTrip(code)).toBe(normalize(code));
  });

  it.each([
    ['for + break', 'for i in range(1, 11):\n    if i > 5:\n        break\n    print(i)\nprint("끝")\n'],
    ['역순 range', 'for i in range(10, 0, -2):\n    print(i)\n'],
    ['중첩 if', 'if a > 0:\n    if b > 0:\n        print(1)\n    else:\n        print(2)\nelse:\n    print(3)\n'],
  ])('%s', (_, code) => {
    expect(roundTrip(code)).toBe(normalize(code));
  });

  // 순서도로는 구별되지 않는 같은 프로그램 — 더 단순한 쪽으로 되돌린다
  it.each([
    [
      'while + continue → if not',
      'n = 0\nwhile n < 10:\n    n += 1\n    if n % 2 == 0:\n        continue\n    print(n)\n',
      'n = 0\nwhile n < 10:\n    n = n + 1\n    if n % 2 != 0:\n        print(n)\n',
    ],
    [
      'break 뒤 else 생략',
      'while True:\n    x = input()\n    if x == "q":\n        print("bye")\n        break\n    else:\n        print(x)\n',
      'while True:\n    x = input()\n    if x == "q":\n        print("bye")\n        break\n    print(x)\n',
    ],
  ])('%s', (_, code, expected) => {
    expect(roundTrip(code)).toBe(expected);
  });

  it('입력은 input()으로, ← 표기는 = 로 되돌린다', () => {
    const g = buildFlowchart(parse('n = int(input())\n합 = 0').body, { arrowAssign: true });
    const r = graphToAst(g);
    expect(r.ok && toPseudocode(r.body)).toBe('n = input()\n합 = 0\n');
  });
});

describe('구조 오류 안내', () => {
  const base = (): FlowGraph => ({
    nodes: [
      { id: 's', kind: 'terminal', label: '시작', x: 0, y: 0, width: 96, height: 40 },
      { id: 'd', kind: 'decision', label: 'x > 0', x: 0, y: 0, width: 130, height: 72 },
      { id: 'p', kind: 'process', label: 'x = 1', x: 0, y: 0, width: 110, height: 44 },
      { id: 'e', kind: 'terminal', label: '끝', x: 0, y: 0, width: 96, height: 40 },
    ],
    edges: [
      { id: '1', source: 's', target: 'd', sourceHandle: 'b', targetHandle: 't' },
      { id: '2', source: 'd', target: 'p', sourceHandle: 'b', targetHandle: 't', label: '예' },
      { id: '3', source: 'd', target: 'e', sourceHandle: 'r', targetHandle: 't', label: '아니오' },
      { id: '4', source: 'p', target: 'e', sourceHandle: 'b', targetHandle: 't' },
    ],
  });

  it('올바른 그림은 변환된다', () => {
    const r = graphToAst(base());
    expect(r.ok && toPseudocode(r.body)).toBe('if x > 0:\n    x = 1\n');
  });

  it('판단에 예/아니오가 없으면', () => {
    const g = base();
    delete g.edges[1].label;
    const r = graphToAst(g);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]).toMatchObject({ nodeId: 'd', message: expect.stringContaining("'예'와 '아니오'") });
  });

  it('처리에서 화살표가 두 개 나가면', () => {
    const g = base();
    g.edges.push({ id: '5', source: 'p', target: 'd', sourceHandle: 'l', targetHandle: 'l' });
    const r = graphToAst(g);
    expect(!r.ok && r.issues[0]).toMatchObject({ nodeId: 'p', message: expect.stringContaining('하나여야') });
  });

  it('처리 도형으로 되돌아가는 반복', () => {
    const g = base();
    g.nodes.push({ id: 'q', kind: 'process', label: 'y = 2', x: 0, y: 0, width: 110, height: 44 });
    g.edges[3] = { id: '4', source: 'p', target: 'q', sourceHandle: 'b', targetHandle: 't' };
    g.edges.push({ id: '5', source: 'q', target: 'p', sourceHandle: 'l', targetHandle: 'l' });
    const r = graphToAst(g);
    expect(!r.ok && r.issues[0].message).toContain('판단 도형');
  });

  it('시작에서 이어지지 않는 도형', () => {
    const g = base();
    g.nodes.push({ id: 'z', kind: 'process', label: '외톨이', x: 0, y: 0, width: 110, height: 44 });
    g.edges.push({ id: '5', source: 'z', target: 'e', sourceHandle: 'b', targetHandle: 't' });
    const r = graphToAst(g);
    expect(!r.ok && r.issues[0]).toMatchObject({ nodeId: 'z' });
  });
});

describe('negate', () => {
  it('비교식을 뒤집는다', () => {
    expect(negate('a == b')).toBe('a != b');
    expect(negate('i <= n')).toBe('i > n');
    expect(negate('x > 0 and y > 0')).toBe('not (x > 0 and y > 0)');
    expect(negate('not (ok)')).toBe('ok');
  });
});

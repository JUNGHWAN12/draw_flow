import { describe, expect, it } from 'vitest';
import {
  MAX_PAYLOAD_BYTES,
  decodeBoardLink,
  decodePayload,
  decodeProblem,
  encodeBoardLink,
  encodePayload,
  parseBoardLink,
  type BoardLink,
} from '../src/io/share';
import { boardShareUrl, isBoardId, normalizeBase, readIncoming } from '../src/io/board';
import type { FlowDocument } from '../src/core/types';

// 이 변경 전 코드로 만든 문제 링크. 예전에 나눠 준 링크가 계속 열려야 한다.
const LEGACY_PROBLEM =
  'zFcoxCsIwFAbgq4R_auAtVVwCniTNIE2EQH0pTbRDETrUzdUbCKKTk-CVbHsH6fjB1-EElROST5WDQj5--nl4C_59r9OjF_PtCYJ1sYTCNNzH1wWEQ7BLLoN1q30VWhB2HFvXQIHFVnhOmef6mDIpC66bxSwLBiG5mCKU1ljDkMYGxpz_';

const doc: FlowDocument = {
  app: 'draw_flow',
  version: 1,
  title: '합 구하기',
  pseudocode: 'n = int(input())\nprint(n)\n',
  nodes: [
    { id: 'n1', kind: 'terminal', label: '시작', x: 0, y: 0, width: 120, height: 40 },
    { id: 'n2', kind: 'process', label: '입력: n', line: 1, x: 0, y: 80, width: 160, height: 48 },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'b', targetHandle: 't', points: [{ x: 60, y: 40 }, { x: 60, y: 80 }] }],
};

describe('예전 문제 링크', () => {
  it('변경 전에 만든 링크가 그대로 열린다', async () => {
    const p = await decodeProblem(LEGACY_PROBLEM);
    expect(p.title).toBe('1부터 n까지 합');
    expect(p.mode).toBe('code2flow');
    expect(p.tests).toEqual([['3'], ['5']]);
  });
});

describe('공통 압축 형식', () => {
  it('압축 ↔ 풀기 왕복', async () => {
    const v = { a: '한글', b: [1, 2, 3] };
    expect(await decodePayload(await encodePayload(v))).toEqual(v);
  });

  it('압축 없는 j 형식도 읽는다', async () => {
    const s = 'j' + btoa(JSON.stringify({ x: 1 })).replace(/=+$/, '');
    expect(await decodePayload(s)).toEqual({ x: 1 });
  });

  it('풀었을 때 너무 큰 내용은 거절한다 (압축 폭탄 방지)', async () => {
    const big = await encodePayload({ s: 'a'.repeat(MAX_PAYLOAD_BYTES * 4) });
    expect(big.length).toBeLessThan(5000); // 압축하면 작지만
    await expect(decodePayload(big)).rejects.toThrow();
  });

  it('알 수 없는 형식 글자는 거절한다', async () => {
    await expect(decodePayload('xabc')).rejects.toThrow();
  });
});

describe('게시판 링크', () => {
  const links: BoardLink[] = [
    { v: 1, app: 'class_board', title: '반복문 연습', kind: 'pseudocode', code: 'for i in range(3):\n    print(i)\n' },
    { v: 1, app: 'draw_flow', title: '내 순서도', kind: 'flow', doc },
    {
      v: 1,
      app: 'draw_flow',
      title: '과제 1',
      kind: 'submission',
      problem: { id: 'abc123', title: '1부터 n까지 합', mode: 'code2flow' },
      doc,
      grade: { verdict: 'correct', items: [{ ok: true, text: '짜임새가 같습니다' }] },
    },
  ];

  it.each(links)('$kind 왕복', async (link) => {
    expect(await decodeBoardLink(await encodeBoardLink(link))).toEqual(link);
  });

  it('약속에 없는 필드(예: 정답)는 버린다', async () => {
    const s = await encodePayload({ ...links[2], answer: '정답 코드', problem: { ...(links[2] as { problem: object }).problem, answer: 'x' } });
    const got = await decodeBoardLink(s);
    expect(JSON.stringify(got)).not.toContain('정답 코드');
    expect(got).toEqual(links[2]);
  });

  it('제출에 학생 답(code/doc)이 하나도 없으면 거절', () => {
    const { doc: _doc, ...noAnswer } = links[2] as Extract<BoardLink, { kind: 'submission' }>;
    expect(() => parseBoardLink(noAnswer)).toThrow();
  });

  it('도형 종류·좌표가 이상하면 거절', () => {
    const bad = { ...doc, nodes: [{ ...doc.nodes[0], kind: 'script' }] };
    expect(() => parseBoardLink({ v: 1, app: 'draw_flow', title: '', kind: 'flow', doc: bad })).toThrow();
    const nan = { ...doc, nodes: [{ ...doc.nodes[0], x: 'a' }] };
    expect(() => parseBoardLink({ v: 1, app: 'draw_flow', title: '', kind: 'flow', doc: nan })).toThrow();
  });

  it('버전·출처·종류가 다르면 거절', () => {
    expect(() => parseBoardLink({ ...links[0], v: 2 })).toThrow();
    expect(() => parseBoardLink({ ...links[0], app: 'evil' })).toThrow();
    expect(() => parseBoardLink({ ...links[0], kind: 'other' })).toThrow();
  });

  it('잘린 링크는 한국어 오류', async () => {
    const s = await encodeBoardLink(links[0]);
    await expect(decodeBoardLink(s.slice(0, 10))).rejects.toThrow('게시판 링크가 올바르지 않습니다');
  });

  it('제목은 100자로 자른다', () => {
    expect(parseBoardLink({ ...links[0], title: '가'.repeat(300) }).title).toHaveLength(100);
  });
});

describe('게시판 주소', () => {
  it('게시판 주소 정리', () => {
    expect(normalizeBase('https://board.example.com/')).toBe('https://board.example.com');
    expect(normalizeBase('javascript:alert(1)')).toBe('');
    expect(normalizeBase('')).toBe('');
  });

  it('draw_flow → 게시판 주소는 # 뒤에 내용을 담는다', () => {
    expect(boardShareUrl('zAbc', 'b-1', 'https://b.kr')).toBe('https://b.kr/share#d=zAbc&board=b-1');
    expect(boardShareUrl('zAbc', '../x', 'https://b.kr')).toBe('https://b.kr/share#d=zAbc');
  });

  it('게시판 → draw_flow 주소 읽기', () => {
    expect(readIncoming('#/convert?src=zAb-_&board=abc')).toEqual({ src: 'zAb-_', board: 'abc' });
    expect(readIncoming('#/editor?src=<script>&board=a/b')).toEqual({ src: null, board: null });
    expect(readIncoming('#/convert')).toEqual({ src: null, board: null });
  });

  it('게시판 아이디 검사', () => {
    expect(isBoardId('3f2a-9b_x')).toBe(true);
    expect(isBoardId('a'.repeat(65))).toBe(false);
    expect(isBoardId(null)).toBe(false);
  });
});

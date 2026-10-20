import { describe, expect, it } from 'vitest';
import { boardLinkUrl } from '../src/io/board';
import { decodeBoardLink, type BoardLink } from '../src/io/share';

// node 시험 환경에는 sessionStorage 가 없어 기억한 게시판 아이디는 붙지 않는다
describe('boardLinkUrl (draw_flow → 게시판)', () => {
  it('게시판 /share 주소에 내용을 담고, 다시 풀면 같은 내용이다', async () => {
    const link: BoardLink = { v: 1, app: 'draw_flow', kind: 'pseudocode', title: '합 구하기', code: 'print(1)\n' };
    const url = await boardLinkUrl(link, 'https://b.kr');
    expect(url.startsWith('https://b.kr/share#d=')).toBe(true);
    const d = url.split('#d=')[1];
    expect(await decodeBoardLink(d)).toEqual(link);
  });

  it('제출에는 약속한 필드만 담긴다 (정답 같은 다른 필드는 버림)', async () => {
    const link = {
      v: 1,
      app: 'draw_flow',
      kind: 'submission',
      title: '과제',
      problem: { id: 'abc', title: '과제', mode: 'flow2code', answer: 'print(42)' },
      code: 'print(1)',
      grade: { verdict: 'wrong', items: [{ ok: false, text: '출력이 다릅니다' }] },
    } as unknown as BoardLink;
    const url = await boardLinkUrl(link, 'https://b.kr');
    const back = await decodeBoardLink(url.split('#d=')[1]);
    expect(JSON.stringify(back)).not.toContain('print(42)');
  });

  it('게시판이 받는 한도(50KB)를 넘으면 보내지 않는다', async () => {
    const link: BoardLink = { v: 1, app: 'draw_flow', kind: 'pseudocode', title: '', code: 'x = 1\n'.repeat(10_000) };
    await expect(boardLinkUrl(link, 'https://b.kr')).rejects.toThrow('너무 길어');
  });
});

import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { grade, signature } from '../src/core/grade';
import { decodeProblem, encodeProblem, problemId, type Problem } from '../src/io/share';

const ast = (src: string) => parse(src).body;
const SUM = 'n = int(input())\n합 = 0\nfor i in range(1, n + 1):\n    합 += i\nprint(합)\n';

describe('채점', () => {
  it('같은 코드는 정답', () => {
    const r = grade(ast(SUM), ast(SUM), [['5'], ['10']]);
    expect(r.verdict).toBe('correct');
    expect(r.items.every((i) => i.ok)).toBe(true);
  });

  it('변수 이름·반복 방식이 달라도 구조와 동작이 같으면 정답', () => {
    const student = 'n = int(input())\ns = 0\ni = 1\nwhile i <= n:\n    s = s + i\n    i = i + 1\nprint(s)\n';
    expect(grade(ast(SUM), ast(student), [['5']]).verdict).toBe('correct');
  });

  it('동작은 같지만 구조가 다르면 부분 정답', () => {
    const student = 'n = int(input())\nprint(n * (n + 1) // 2)\n';
    const r = grade(ast(SUM), ast(student), [['5'], ['10']]);
    expect(r.verdict).toBe('partial');
    expect(r.items.find((i) => i.text.startsWith('반복'))).toMatchObject({ ok: false, text: '반복 0개 (정답 1개)' });
  });

  it('출력이 다르면 오답이고 어떤 테스트가 틀렸는지 알려 준다', () => {
    const student = SUM.replace('n + 1', 'n');
    const r = grade(ast(SUM), ast(student), [['5']]);
    expect(r.verdict).toBe('wrong');
    expect(r.items.find((i) => !i.ok)!.text).toBe('테스트 1 (입력: 5): 출력이 다릅니다 — 정답 15, 내 답 10');
  });

  it('학생 답이 실행 중 오류를 내면 오답', () => {
    const r = grade(ast(SUM), ast('print(합)'), [['5']]);
    expect(r.verdict).toBe('wrong');
    expect(r.items.some((i) => i.text.includes('실행 중 오류'))).toBe(true);
  });

  it('구조 요약', () => {
    expect(signature(ast('x = input()\nif x:\n    print(1)\nelse:\n    print(2)\nwhile x:\n    break'))).toBe(
      'I C1[O|O] L[B]',
    );
  });
});

describe('문제 링크', () => {
  it('압축해서 담고 그대로 되살린다', async () => {
    const p: Problem = { v: 1, title: '합계', desc: '1부터 n까지 더하기', mode: 'code2flow', answer: SUM, tests: [['5'], ['10']] };
    const s = await encodeProblem(p);
    expect(s.startsWith('z')).toBe(true);
    expect(await decodeProblem(s)).toEqual(p);
    expect(problemId(s)).toMatch(/^[0-9a-z]+$/);
  });

  it('잘린 링크는 안내한다', async () => {
    await expect(decodeProblem('zabc')).rejects.toThrow('문제 링크가 올바르지 않습니다');
  });
});

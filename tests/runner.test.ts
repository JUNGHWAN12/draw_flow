import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { buildFlowchart } from '../src/core/flowchart';
import { runGraph } from '../src/core/interp/runner';
import { evaluate, parseExpr, PyFloat, repr, str, type Env } from '../src/core/interp/pyexpr';
import { EXAMPLES } from '../src/examples';

function run(src: string, inputs: string[] = []) {
  return runGraph(buildFlowchart(parse(src).body), inputs);
}

function ev(src: string, vars: Record<string, unknown> = {}) {
  const env: Env = { vars: new Map(Object.entries(vars) as never), readInput: () => '' };
  return repr(evaluate(parseExpr(src), env));
}

describe('식 계산', () => {
  it.each([
    ['1 + 2 * 3', '7'],
    ['7 / 2', '3.5'],
    ['6 / 2', '3.0'],
    ['7 // 2', '3'],
    ['-7 // 2', '-4'],
    ['-7 % 3', '2'],
    ['2 ** 10', '1024'],
    ['0.1 + 0.2', '0.30000000000000004'],
    ['"ab" * 3', "'ababab'"],
    ['[1, 2] + [3]', '[1, 2, 3]'],
    ['1 < 2 < 3', 'True'],
    ['3 in [1, 2, 3]', 'True'],
    ['"가" not in "나다"', 'True'],
    ['not 0 and 5', '5'],
    ['len("한글")', '2'],
    ['int("42") + 1', '43'],
    ['max(3, 9, 4)', '9'],
    ['sum([1, 2, 3])', '6'],
    ['round(2.5)', '2'],
    ['"a,b,c".split(",")', "['a', 'b', 'c']"],
    ['[5, 3, 8][-1]', '8'],
    ['"hello"[1:4]', "'ell'"],
    ['[1, 2, 3, 4][::-1]', '[4, 3, 2, 1]'],
    ['f"합계: {1 + 2}점"', "'합계: 3점'"],
    ['"짝" if 4 % 2 == 0 else "홀"', "'짝'"],
    ['(1, 2)', '(1, 2)'],
  ])('%s → %s', (src, expected) => {
    expect(ev(src)).toBe(expected);
  });

  it('출력 모양', () => {
    expect(str(new PyFloat(3))).toBe('3.0');
    expect(str('안녕')).toBe('안녕');
    expect(str(true)).toBe('True');
  });

  it.each([
    ['x + 1', "변수 'x'에 아직 값이 없습니다."],
    ['1 / 0', '0으로 나눌 수 없습니다.'],
    ['"a" + 1', '문자열과 숫자는 더할 수 없습니다'],
    ['[1, 2][5]', '범위를 벗어났습니다'],
    ['int("abc")', '정수로 바꿀 수 없습니다'],
  ])('%s → 오류', (src, msg) => {
    expect(() => ev(src)).toThrow(msg);
  });
});

describe('순서도 실행', () => {
  it('1부터 n까지의 합', () => {
    const t = run(EXAMPLES.find((e) => e.id === 'sum')!.code, ['10']);
    expect(t.finished).toBe(true);
    expect(t.output).toEqual(['작다', '55']);
    const last = t.steps[t.steps.length - 1];
    expect(Object.fromEntries(last.vars)).toEqual({ n: '10', 합: '55', i: '11' });
  });

  it('판단 단계에는 예/아니오가 기록된다', () => {
    const t = run('x = 5\nif x > 3:\n    print("크다")');
    const d = t.steps.find((s) => s.branch)!;
    expect(d.branch).toBe('예');
    expect(d.note).toBe('x > 3 → 참 (예)');
    expect(t.steps[1].note).toBe('x = 5  →  x = 5');
  });

  it('바뀐 변수를 표시한다', () => {
    const t = run('a = 1\nb = 2\na = a + b');
    expect(t.steps.map((s) => s.changed)).toEqual([[], ['a'], ['b'], ['a'], []]);
  });

  it('버블 정렬 (리스트 칸 바꾸기, 여러 변수 대입)', () => {
    const t = run(EXAMPLES.find((e) => e.id === 'bubble')!.code);
    expect(t.output).toEqual(['[1, 3, 4, 5, 8]']);
  });

  it.each(EXAMPLES.map((e) => [e.title, e.code]))('예제 "%s"는 오류 없이 끝난다', (_, code) => {
    const t = run(code, ['7', '3', '5', '7']);
    expect(t.steps.find((s) => s.error)?.error).toBeUndefined();
    expect(t.finished).toBe(true);
  });

  it('입력값이 부족하면 알려 준다', () => {
    const t = run('a = int(input())\nb = int(input())', ['1']);
    expect(t.steps[t.steps.length - 1].error).toContain('2번째 값');
    expect(t.finished).toBe(false);
  });

  it('입력값은 숫자처럼 보이면 숫자로 읽는다', () => {
    const t = run('n = input()\nname = input()\nprint(n + 1, name)', ['41', '민수']);
    expect(t.output).toEqual(['42 민수']);
  });

  it('끝나지 않는 반복은 단계 수 제한에서 멈춘다', () => {
    const t = runGraph(buildFlowchart(parse('while True:\n    pass').body), [], 50);
    expect(t.steps[t.steps.length - 1].error).toContain('끝나지 않는 반복');
  });

  it('실행할 수 없는 글자는 안내한다', () => {
    const t = run('합을 구한다');
    expect(t.steps[1].error).toContain('실행할 수 있는 문장이 아닙니다');
  });
});

describe('함수 실행', () => {
  it('함수를 부르면 함수 순서도로 들어가 값을 돌려받는다', () => {
    const t = run('def 두배(x):\n    y = x * 2\n    return y\n\na = 두배(4)\nprint(a)');
    expect(t.finished).toBe(true);
    expect(t.output).toEqual(['8']);
    const notes = t.steps.map((s) => s.note);
    expect(notes).toContain('두배(4) 호출 → x = 4');
    expect(notes).toContain('반환 → 8');
    const inside = t.steps.find((s) => s.note.startsWith('y = x * 2'))!;
    expect(inside.changed).toEqual(['두배:y']);
    expect(Object.fromEntries(inside.vars)).toEqual({ '두배:x': '4', '두배:y': '8' });
  });

  it('재귀 함수', () => {
    const t = run('def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\n\nprint(f(5))');
    expect(t.output).toEqual(['120']);
  });

  it('끝나지 않는 재귀는 멈춘다', () => {
    const t = run('def f(n):\n    return f(n + 1)\n\nprint(f(1))');
    expect(t.steps[t.steps.length - 1].error).toContain('너무 깊이');
  });

  it('인자 개수가 다르면 알려 준다', () => {
    const t = run('def f(a, b):\n    return a + b\n\nprint(f(1))');
    expect(t.steps[t.steps.length - 1].error).toContain('값 2개');
  });

  it('함수 안에서 바깥 변수를 읽을 수 있다', () => {
    const t = run('def f():\n    return k + 1\n\nk = 10\nprint(f())');
    expect(t.output).toEqual(['11']);
  });
});

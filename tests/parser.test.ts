import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { EXAMPLES } from '../src/examples';

function firstError(src: string) {
  const r = parse(src);
  expect(r.errors.length).toBeGreaterThan(0);
  return r.errors[0];
}

describe('parse — 정상 코드', () => {
  it.each(EXAMPLES.map((e) => [e.title, e.code]))('예제 "%s"는 오류가 없다', (_, code) => {
    expect(parse(code).errors).toEqual([]);
  });

  it('입력·출력·대입을 구분한다', () => {
    const { body } = parse('n = int(input("수: "))\na, b = map(int, input().split())\nprint(n, end="")\n합 = 0');
    expect(body).toEqual([
      { type: 'simple', role: 'input', text: 'n', line: 1 },
      { type: 'simple', role: 'input', text: 'a, b', line: 2 },
      { type: 'simple', role: 'output', text: 'n', line: 3 },
      { type: 'simple', role: 'process', text: '합 = 0', line: 4 },
    ]);
  });

  it('복합 대입을 풀어 쓴다', () => {
    const { body } = parse('합 += i\nx *= a + b\nn //= 10');
    expect(body.map((s) => (s.type === 'simple' ? s.text : ''))).toEqual([
      '합 = 합 + i',
      'x = x * (a + b)',
      'n = n // 10',
    ]);
  });

  it('if / elif / else 를 하나로 묶는다', () => {
    const { body, errors } = parse('if a > 0:\n    print(1)\nelif a == 0:\n    print(0)\nelse:\n    print(-1)');
    expect(errors).toEqual([]);
    expect(body).toHaveLength(1);
    const s = body[0];
    expect(s.type).toBe('if');
    if (s.type !== 'if') return;
    expect(s.branches.map((b) => b.cond)).toEqual(['a > 0', 'a == 0']);
    expect(s.elseBody).toHaveLength(1);
  });

  it('range 인자를 해석한다', () => {
    const { body } = parse('for i in range(5):\n    pass\nfor j in range(10, 0, -2):\n    pass');
    expect(body[0]).toMatchObject({ type: 'forRange', variable: 'i', start: '0', stop: '5', step: '1' });
    expect(body[1]).toMatchObject({ type: 'forRange', variable: 'j', start: '10', stop: '0', step: '-2' });
  });

  it('주석, 빈 줄, 시작/끝 줄은 무시한다', () => {
    const { body, errors } = parse('시작\n# 설명\n\nx = 1  # 대입\n끝');
    expect(errors).toEqual([]);
    expect(body).toEqual([{ type: 'simple', role: 'process', text: 'x = 1', line: 4 }]);
  });

  it('문자열 안의 #과 :는 주석/블록으로 보지 않는다', () => {
    const { body, errors } = parse('print("#1: 결과")');
    expect(errors).toEqual([]);
    expect(body[0]).toMatchObject({ role: 'output', text: '"#1: 결과"' });
  });
});

describe('parse — 오류 메시지', () => {
  it('콜론 누락', () => {
    expect(firstError('if x > 1\n    print(x)')).toEqual({ line: 1, message: 'if 문 끝에 콜론(:)이 필요합니다.' });
  });

  it('들여쓰기 누락', () => {
    expect(firstError('while x > 0:\nx = x - 1').message).toContain('들여쓰기가 필요합니다');
  });

  it('예상하지 못한 들여쓰기', () => {
    expect(firstError('x = 1\n    y = 2')).toMatchObject({ line: 2, message: expect.stringContaining('들여쓰기가 맞지 않습니다') });
  });

  it('else if', () => {
    expect(firstError('if a:\n    pass\nelse if b:\n    pass').message).toContain("'elif'");
  });

  it('조건에 = 사용', () => {
    expect(firstError('if a = 3:\n    pass').message).toContain("'=='");
  });

  it('짝 없는 else', () => {
    expect(firstError('x = 1\nelse:\n    pass')).toMatchObject({ line: 2, message: expect.stringContaining('if가 없습니다') });
  });

  it('괄호 불일치', () => {
    expect(firstError('print((1 + 2)').message).toContain("'('");
  });

  it('미지원 구문', () => {
    expect(firstError('def f():\n    pass').message).toContain('아직 지원하지 않습니다');
  });

  it('반복문 밖의 break', () => {
    expect(firstError('break').message).toContain('반복문');
  });

  it('한 줄에 몰아 쓴 if', () => {
    expect(firstError('if x: print(x)').message).toContain('줄을 바꾸고');
  });

  it('탭과 공백 혼용', () => {
    expect(firstError('if a:\n    x = 1\nif b:\n\tx = 2').message).toContain('탭과 공백');
  });

  it('range 인자 개수', () => {
    expect(firstError('for i in range():\n    pass').message).toContain('range()');
  });

  it('오류가 여러 개면 모두 알려 준다', () => {
    const r = parse('if a\n    pass\nx = (1\nelse:\n    pass');
    expect(r.errors.map((e) => e.line)).toEqual([1, 3, 4]);
  });
});

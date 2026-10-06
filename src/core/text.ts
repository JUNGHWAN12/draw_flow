// 문자열/괄호를 고려한 텍스트 도우미

const OPEN = '([{';
const CLOSE = ')]}';

/** 문자열 밖에 있는 첫 '#' 위치 (없으면 -1) */
export function findComment(src: string): number {
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#') {
      return i;
    }
  }
  return -1;
}

export function stripComment(src: string): string {
  const i = findComment(src);
  return (i < 0 ? src : src.slice(0, i)).trimEnd();
}

/** 괄호·따옴표 짝 검사. 문제가 있으면 한국어 메시지, 없으면 null */
export function checkBrackets(src: string): string | null {
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (OPEN.includes(c)) stack.push(c);
    else if (CLOSE.includes(c)) {
      const open = OPEN[CLOSE.indexOf(c)];
      if (stack.pop() !== open) return `닫는 괄호 '${c}'의 짝이 되는 여는 괄호가 없습니다.`;
    }
  }
  if (quote) return `따옴표(${quote})가 닫히지 않았습니다.`;
  if (stack.length) return `여는 괄호 '${stack[stack.length - 1]}'가 닫히지 않았습니다.`;
  return null;
}

/** 괄호/문자열 밖의 쉼표로 나누기 */
export function splitTopLevel(src: string, sep = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      cur += c;
      if (c === '\\' && i + 1 < src.length) cur += src[++i];
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth--;
    if (c === sep && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() || parts.length) parts.push(cur.trim());
  return parts;
}

/**
 * 괄호/문자열 밖에 있는 대입 연산자(=, +=, -= …)를 찾는다.
 * ==, !=, <=, >= 는 대입이 아니다.
 */
export function findAssignment(src: string): { index: number; op: string } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c)) depth--;
    else if (c === '=' && depth === 0) {
      const next = src[i + 1];
      const prev = src[i - 1];
      if (next === '=') {
        i++;
        continue;
      }
      if (prev === '=' || prev === '!' || prev === '<' || prev === '>') {
        // '<<=' '>>=' 는 대입, '<=' '>=' 는 비교
        if ((prev === '<' || prev === '>') && src[i - 2] === prev) {
          return { index: i - 2, op: prev + prev + '=' };
        }
        continue;
      }
      const ops = ['**', '//', '+', '-', '*', '/', '%', '&', '|', '^'];
      for (const o of ops) {
        if (src.slice(i - o.length, i) === o) return { index: i - o.length, op: o + '=' };
      }
      return { index: i, op: '=' };
    }
  }
  return null;
}

/** 괄호로 감싸야 할 만큼 복잡한 식인지 (공백·연산자 포함) */
export function needsParens(expr: string): boolean {
  return /[\s+\-*/%<>=!&|^]/.test(expr.trim()) && !/^\(.*\)$/.test(expr.trim());
}

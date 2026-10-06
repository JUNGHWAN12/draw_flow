// 작은 파이썬 식(expression) 해석기 — 순서도 단계별 실행용
//
// 도형 글자에 쓰인 파이썬 식을 계산한다. 정수/실수/문자열/참거짓/None/리스트/튜플,
// 산술·비교·논리 연산, 인덱스·슬라이스, f-문자열, 자주 쓰는 내장 함수와 메서드를 지원한다.

// ── 값 ─────────────────────────────────────────────────

/** 파이썬 실수 (정수와 구별해서 3.0 처럼 출력하기 위해 감싼다) */
export class PyFloat {
  readonly v: number;
  constructor(v: number) {
    this.v = v;
  }
}

export class PyTuple {
  readonly items: PyValue[];
  constructor(items: PyValue[]) {
    this.items = items;
  }
}

export type PyValue = number | PyFloat | string | boolean | null | PyValue[] | PyTuple;

/** 실행 중 오류 (한국어 메시지) */
export class PyError extends Error {}

const isInt = (v: PyValue): v is number => typeof v === 'number';
const isNum = (v: PyValue): v is number | PyFloat | boolean => typeof v === 'number' || v instanceof PyFloat || typeof v === 'boolean';
const num = (v: PyValue): number => (v instanceof PyFloat ? v.v : Number(v));
const mk = (x: number, float: boolean): PyValue => (float ? new PyFloat(x) : x);

export function typeName(v: PyValue): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  if (v instanceof PyFloat) return 'float';
  if (typeof v === 'string') return 'str';
  if (v instanceof PyTuple) return 'tuple';
  return 'list';
}

function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return `${x}.0`;
  return String(x);
}

function strRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

/** repr(): 변수 표에 보여 줄 모양 ('문자열'은 따옴표 포함) */
export function repr(v: PyValue): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  if (v instanceof PyFloat) return floatRepr(v.v);
  if (typeof v === 'string') return strRepr(v);
  if (v instanceof PyTuple) return v.items.length === 1 ? `(${repr(v.items[0])},)` : `(${v.items.map(repr).join(', ')})`;
  return `[${v.map(repr).join(', ')}]`;
}

/** str(): print로 출력할 모양 */
export function str(v: PyValue): string {
  return typeof v === 'string' ? v : repr(v);
}

export function truthy(v: PyValue): boolean {
  if (v === null || v === false) return false;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof PyFloat) return v.v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v instanceof PyTuple) return v.items.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function eq(a: PyValue, b: PyValue): boolean {
  if (isNum(a) && isNum(b)) return num(a) === num(b);
  if (typeof a === 'string' || typeof b === 'string' || a === null || b === null) return a === b;
  const xa = a instanceof PyTuple ? a.items : a;
  const xb = b instanceof PyTuple ? b.items : b;
  if (Array.isArray(xa) && Array.isArray(xb) && a instanceof PyTuple === b instanceof PyTuple)
    return xa.length === xb.length && xa.every((x, i) => eq(x, xb[i]));
  return false;
}

function cmp(a: PyValue, b: PyValue, op: string): boolean {
  if (op === '==') return eq(a, b);
  if (op === '!=') return !eq(a, b);
  if (op === 'in' || op === 'not in') {
    let r: boolean;
    if (typeof b === 'string') {
      if (typeof a !== 'string') throw new PyError(`문자열 안에서는 문자열만 찾을 수 있습니다.`);
      r = b.includes(a);
    } else if (Array.isArray(b) || b instanceof PyTuple) {
      r = (Array.isArray(b) ? b : b.items).some((x) => eq(x, a));
    } else throw new PyError(`${typeName(b)} 값에는 in을 쓸 수 없습니다.`);
    return op === 'in' ? r : !r;
  }
  if (op === 'is') return a === b;
  if (op === 'is not') return a !== b;
  let c: number;
  if (isNum(a) && isNum(b)) c = num(a) - num(b);
  else if (typeof a === 'string' && typeof b === 'string') c = a < b ? -1 : a > b ? 1 : 0;
  else if (Array.isArray(a) && Array.isArray(b)) {
    c = 0;
    for (let i = 0; i < Math.min(a.length, b.length) && c === 0; i++) c = cmp(a[i], b[i], '<') ? -1 : cmp(a[i], b[i], '>') ? 1 : 0;
    if (c === 0) c = a.length - b.length;
  } else throw new PyError(`${typeName(a)} 값과 ${typeName(b)} 값은 크기를 비교할 수 없습니다.`);
  return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0;
}

function seqItems(v: PyValue, what = '반복'): PyValue[] {
  if (Array.isArray(v)) return v;
  if (v instanceof PyTuple) return v.items;
  if (typeof v === 'string') return [...v];
  throw new PyError(`${typeName(v)} 값은 ${what}할 수 없습니다.`);
}

function binop(op: string, a: PyValue, b: PyValue): PyValue {
  if (isNum(a) && isNum(b)) {
    const float = a instanceof PyFloat || b instanceof PyFloat;
    const x = num(a);
    const y = num(b);
    switch (op) {
      case '+':
        return mk(x + y, float);
      case '-':
        return mk(x - y, float);
      case '*':
        return mk(x * y, float);
      case '/':
        if (y === 0) throw new PyError('0으로 나눌 수 없습니다.');
        return new PyFloat(x / y);
      case '//':
        if (y === 0) throw new PyError('0으로 나눌 수 없습니다.');
        return mk(Math.floor(x / y), float);
      case '%':
        if (y === 0) throw new PyError('0으로 나눌 수 없습니다.');
        return mk(x - y * Math.floor(x / y), float);
      case '**':
        return mk(x ** y, float || y < 0);
    }
  }
  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
    if (typeof a === 'string' || typeof b === 'string')
      throw new PyError('문자열과 숫자는 더할 수 없습니다. str()로 바꾸거나 쉼표로 이어 출력하세요.');
  }
  if (op === '*') {
    const [s, n] = isInt(b) ? [a, b] : [b, a];
    if (isInt(n)) {
      if (typeof s === 'string') return s.repeat(Math.max(0, n));
      if (Array.isArray(s)) return Array.from({ length: Math.max(0, n) }, () => s).flat();
    }
  }
  if (op === '%' && typeof a === 'string') return a.replace(/%[sd]/, str(b));
  throw new PyError(`${typeName(a)} 값과 ${typeName(b)} 값에는 '${op}' 연산을 쓸 수 없습니다.`);
}

function index(container: PyValue, i: PyValue): PyValue {
  const items = typeof container === 'string' ? [...container] : seqItems(container, '인덱스로 꺼낼 수');
  if (!isInt(i) && typeof i !== 'boolean') throw new PyError('인덱스는 정수여야 합니다.');
  let k = Number(i);
  if (k < 0) k += items.length;
  if (k < 0 || k >= items.length) throw new PyError(`인덱스 ${i}가 범위를 벗어났습니다. (길이 ${items.length})`);
  return items[k];
}

function slice(container: PyValue, lo: PyValue, hi: PyValue, step: PyValue): PyValue {
  const items = typeof container === 'string' ? [...container] : seqItems(container, '자를 수');
  const n = items.length;
  const st = step === null ? 1 : Number(step);
  if (st === 0) throw new PyError('슬라이스 간격은 0이 될 수 없습니다.');
  const norm = (v: PyValue, d: number) => {
    if (v === null) return d;
    let k = Number(v);
    if (k < 0) k += n;
    return st > 0 ? Math.min(Math.max(k, 0), n) : Math.min(Math.max(k, -1), n - 1);
  };
  const out: PyValue[] = [];
  if (st > 0) for (let k = norm(lo, 0); k < norm(hi, n); k += st) out.push(items[k]);
  else for (let k = norm(lo, n - 1); k > norm(hi, -1); k += st) out.push(items[k]);
  if (typeof container === 'string') return out.join('');
  return container instanceof PyTuple ? new PyTuple(out) : out;
}

// ── 토큰 ───────────────────────────────────────────────

type Tok =
  | { t: 'num'; v: number; float: boolean }
  | { t: 'str'; v: string }
  | { t: 'fstr'; v: string }
  | { t: 'name'; v: string }
  | { t: 'op'; v: string }
  | { t: 'end' };

const OPS = ['**', '//', '==', '!=', '<=', '>=', '<', '>', '+', '-', '*', '/', '%', '(', ')', '[', ']', ',', '.', ':', '='];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const numM = src.slice(i).match(/^(\d+\.\d*|\.\d+|\d+)(e[+-]?\d+)?/i);
    if (numM && /[\d.]/.test(c) && !(c === '.' && !/\d/.test(src[i + 1] ?? ''))) {
      const s = numM[0];
      toks.push({ t: 'num', v: Number(s), float: /[.e]/i.test(s) });
      i += s.length;
      continue;
    }
    const strM = src.slice(i).match(/^([fFrR]?)("|')/);
    if (strM) {
      const q = strM[2];
      let j = i + strM[0].length;
      let v = '';
      const raw = strM[1].toLowerCase() === 'r';
      while (j < src.length && src[j] !== q) {
        if (src[j] === '\\' && !raw && j + 1 < src.length) {
          const e = src[j + 1];
          v += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          j += 2;
        } else v += src[j++];
      }
      if (j >= src.length) throw new PyError('따옴표가 닫히지 않았습니다.');
      toks.push({ t: strM[1].toLowerCase() === 'f' ? 'fstr' : 'str', v });
      i = j + 1;
      continue;
    }
    const nameM = src.slice(i).match(/^[\p{L}_][\p{L}\p{N}_]*/u);
    if (nameM) {
      toks.push({ t: 'name', v: nameM[0] });
      i += nameM[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new PyError(`알 수 없는 기호 '${c}'가 있습니다.`);
    toks.push({ t: 'op', v: op });
    i += op.length;
  }
  toks.push({ t: 'end' });
  return toks;
}

// ── 구문 분석 ──────────────────────────────────────────

export type Expr =
  | { k: 'lit'; v: PyValue }
  | { k: 'fstr'; parts: (string | Expr)[] }
  | { k: 'name'; id: string }
  | { k: 'list'; items: Expr[] }
  | { k: 'tuple'; items: Expr[] }
  | { k: 'un'; op: string; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'and' | 'or'; l: Expr; r: Expr }
  | { k: 'not'; e: Expr }
  | { k: 'cmp'; first: Expr; rest: [string, Expr][] }
  | { k: 'cond'; a: Expr; c: Expr; b: Expr }
  | { k: 'call'; f: Expr; args: Expr[] }
  | { k: 'index'; e: Expr; i: Expr }
  | { k: 'slice'; e: Expr; lo: Expr | null; hi: Expr | null; step: Expr | null }
  | { k: 'attr'; e: Expr; name: string };

const KEYWORDS = new Set(['and', 'or', 'not', 'in', 'is', 'if', 'else', 'True', 'False', 'None']);

class ExprParser {
  private p = 0;
  private readonly toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok {
    return this.toks[this.p];
  }
  private isOp(v: string) {
    const t = this.peek();
    return t.t === 'op' && t.v === v;
  }
  private isName(v: string) {
    const t = this.peek();
    return t.t === 'name' && t.v === v;
  }
  private expectOp(v: string) {
    if (!this.isOp(v)) throw new PyError(`'${v}'가 필요합니다.`);
    this.p++;
  }

  /** 쉼표로 이어진 식 → 튜플 */
  exprList(): Expr {
    const first = this.expr();
    if (!this.isOp(',')) return first;
    const items = [first];
    while (this.isOp(',')) {
      this.p++;
      if (this.atEnd()) break;
      items.push(this.expr());
    }
    return { k: 'tuple', items };
  }

  atEnd() {
    const t = this.peek();
    return t.t === 'end' || (t.t === 'op' && [')', ']', '='].includes(t.v));
  }

  done() {
    if (this.peek().t !== 'end') throw new PyError('식을 끝까지 이해하지 못했습니다. 문법을 확인해 주세요.');
  }

  expr(): Expr {
    const a = this.orTest();
    if (this.isName('if')) {
      this.p++;
      const c = this.orTest();
      if (!this.isName('else')) throw new PyError("'… if 조건 else …'에서 else가 필요합니다.");
      this.p++;
      return { k: 'cond', a, c, b: this.expr() };
    }
    return a;
  }

  private orTest(): Expr {
    let l = this.andTest();
    while (this.isName('or')) {
      this.p++;
      l = { k: 'or', l, r: this.andTest() };
    }
    return l;
  }

  private andTest(): Expr {
    let l = this.notTest();
    while (this.isName('and')) {
      this.p++;
      l = { k: 'and', l, r: this.notTest() };
    }
    return l;
  }

  private notTest(): Expr {
    if (this.isName('not')) {
      this.p++;
      return { k: 'not', e: this.notTest() };
    }
    return this.comparison();
  }

  private comparison(): Expr {
    const first = this.arith();
    const rest: [string, Expr][] = [];
    for (;;) {
      const t = this.peek();
      let op: string | null = null;
      if (t.t === 'op' && ['<', '>', '==', '!=', '<=', '>='].includes(t.v)) {
        op = t.v;
        this.p++;
      } else if (this.isName('in')) {
        op = 'in';
        this.p++;
      } else if (this.isName('not') && this.toks[this.p + 1]?.t === 'name' && (this.toks[this.p + 1] as { v: string }).v === 'in') {
        op = 'not in';
        this.p += 2;
      } else if (this.isName('is')) {
        this.p++;
        op = 'is';
        if (this.isName('not')) {
          this.p++;
          op = 'is not';
        }
      }
      if (!op) break;
      rest.push([op, this.arith()]);
    }
    return rest.length ? { k: 'cmp', first, rest } : first;
  }

  private arith(): Expr {
    let l = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: this.term() };
    }
    return l;
  }

  private term(): Expr {
    let l = this.factor();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      const op = (this.toks[this.p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: this.factor() };
    }
    return l;
  }

  private factor(): Expr {
    if (this.isOp('-') || this.isOp('+')) {
      const op = (this.toks[this.p++] as { v: string }).v;
      return { k: 'un', op, e: this.factor() };
    }
    return this.power();
  }

  private power(): Expr {
    const base = this.primary();
    if (this.isOp('**')) {
      this.p++;
      return { k: 'bin', op: '**', l: base, r: this.factor() };
    }
    return base;
  }

  private primary(): Expr {
    let e = this.atom();
    for (;;) {
      if (this.isOp('(')) {
        this.p++;
        const args: Expr[] = [];
        while (!this.isOp(')')) {
          const t = this.peek();
          if (t.t === 'name' && this.toks[this.p + 1]?.t === 'op' && (this.toks[this.p + 1] as { v: string }).v === '=')
            throw new PyError(`함수의 이름 붙인 인자(${t.v}=…)는 지원하지 않습니다.`);
          args.push(this.expr());
          if (!this.isOp(',')) break;
          this.p++;
        }
        this.expectOp(')');
        e = { k: 'call', f: e, args };
      } else if (this.isOp('[')) {
        this.p++;
        let lo: Expr | null = null;
        if (!this.isOp(':')) lo = this.expr();
        if (this.isOp(':')) {
          this.p++;
          const hi = this.isOp(':') || this.isOp(']') ? null : this.expr();
          let step: Expr | null = null;
          if (this.isOp(':')) {
            this.p++;
            if (!this.isOp(']')) step = this.expr();
          }
          this.expectOp(']');
          e = { k: 'slice', e, lo, hi, step };
        } else {
          this.expectOp(']');
          e = { k: 'index', e, i: lo! };
        }
      } else if (this.isOp('.')) {
        this.p++;
        const t = this.peek();
        if (t.t !== 'name') throw new PyError("'.' 뒤에는 메서드 이름이 와야 합니다.");
        this.p++;
        e = { k: 'attr', e, name: t.v };
      } else return e;
    }
  }

  private atom(): Expr {
    const t = this.toks[this.p++];
    switch (t.t) {
      case 'num':
        return { k: 'lit', v: mk(t.v, t.float) };
      case 'str': {
        let v = t.v;
        while (this.peek().t === 'str') v += (this.toks[this.p++] as { v: string }).v;
        return { k: 'lit', v };
      }
      case 'fstr':
        return { k: 'fstr', parts: parseFString(t.v) };
      case 'name':
        if (t.v === 'True') return { k: 'lit', v: true };
        if (t.v === 'False') return { k: 'lit', v: false };
        if (t.v === 'None') return { k: 'lit', v: null };
        if (KEYWORDS.has(t.v)) throw new PyError(`'${t.v}'의 위치가 올바르지 않습니다.`);
        return { k: 'name', id: t.v };
      case 'op':
        if (t.v === '(') {
          if (this.isOp(')')) {
            this.p++;
            return { k: 'tuple', items: [] };
          }
          const e = this.exprList();
          this.expectOp(')');
          return e;
        }
        if (t.v === '[') {
          const items: Expr[] = [];
          while (!this.isOp(']')) {
            items.push(this.expr());
            if (this.isName('for')) throw new PyError('리스트 컴프리헨션은 지원하지 않습니다.');
            if (!this.isOp(',')) break;
            this.p++;
          }
          this.expectOp(']');
          return { k: 'list', items };
        }
        throw new PyError(`'${t.v}'의 위치가 올바르지 않습니다.`);
      default:
        throw new PyError('식이 끝나지 않았습니다.');
    }
  }
}

function parseFString(s: string): (string | Expr)[] {
  const parts: (string | Expr)[] = [];
  let lit = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i + 1] === '{') {
      lit += '{';
      i++;
    } else if (s[i] === '}' && s[i + 1] === '}') {
      lit += '}';
      i++;
    } else if (s[i] === '{') {
      const j = s.indexOf('}', i);
      if (j < 0) throw new PyError("f-문자열의 '{'가 닫히지 않았습니다.");
      if (lit) parts.push(lit);
      lit = '';
      parts.push(parseExpr(s.slice(i + 1, j).replace(/:[^:]*$/, '')));
      i = j;
    } else lit += s[i];
  }
  if (lit) parts.push(lit);
  return parts;
}

export function parseExpr(src: string): Expr {
  const p = new ExprParser(tokenize(src));
  const e = p.exprList();
  p.done();
  return e;
}

// ── 계산 ───────────────────────────────────────────────

export interface Env {
  vars: Map<string, PyValue>;
  /** 함수 안에서 읽을 수 있는 바깥(전역) 변수 */
  globals?: Map<string, PyValue>;
  /** input()이 불릴 때 다음 입력값을 돌려준다 */
  readInput: () => string;
  /** 순서도로 그린 사용자 함수 부르기 (없으면 undefined를 돌려준다) */
  callUser?: (name: string, args: PyValue[]) => PyValue | undefined;
}

type Builtin = (args: PyValue[], env: Env) => PyValue;

function toInt(v: PyValue): number {
  if (typeof v === 'string') {
    const t = v.trim();
    if (!/^[+-]?\d+$/.test(t)) throw new PyError(`'${v}'은(는) 정수로 바꿀 수 없습니다.`);
    return parseInt(t, 10);
  }
  if (isNum(v)) return Math.trunc(num(v));
  throw new PyError(`${typeName(v)} 값은 정수로 바꿀 수 없습니다.`);
}

function minmax(args: PyValue[], dir: 1 | -1, name: string): PyValue {
  const items = args.length === 1 ? seqItems(args[0]) : args;
  if (!items.length) throw new PyError(`${name}()에 빈 목록을 넣을 수 없습니다.`);
  return items.reduce((a, b) => (cmp(b, a, dir > 0 ? '>' : '<') ? b : a));
}

const BUILTINS: Record<string, Builtin> = {
  len: ([v]) => (typeof v === 'string' ? [...v].length : seqItems(v, '길이를 잴 수').length),
  int: ([v]) => toInt(v ?? 0),
  float: ([v]) => {
    const x = typeof v === 'string' ? Number(v.trim()) : num(v ?? 0);
    if (Number.isNaN(x)) throw new PyError(`'${v}'은(는) 실수로 바꿀 수 없습니다.`);
    return new PyFloat(x);
  },
  str: ([v]) => (v === undefined ? '' : str(v)),
  bool: ([v]) => (v === undefined ? false : truthy(v)),
  abs: ([v]) => mk(Math.abs(num(v)), v instanceof PyFloat),
  max: (a) => minmax(a, 1, 'max'),
  min: (a) => minmax(a, -1, 'min'),
  sum: ([v]) => seqItems(v).reduce((a, b) => binop('+', a, b), 0 as PyValue),
  round: ([v, n]) => {
    const d = n === undefined || n === null ? 0 : Number(n);
    const f = 10 ** d;
    // 파이썬처럼 .5는 짝수 쪽으로 반올림
    const x = num(v) * f;
    const r = Math.abs(x % 1) === 0.5 ? 2 * Math.round(x / 2) : Math.round(x);
    return n === undefined ? r / f : new PyFloat(r / f);
  },
  range: (a) => {
    const [start, stop, step] = a.length === 1 ? [0, toInt(a[0]), 1] : [toInt(a[0]), toInt(a[1]), a[2] === undefined ? 1 : toInt(a[2])];
    if (step === 0) throw new PyError('range()의 증가값은 0이 될 수 없습니다.');
    const out: number[] = [];
    for (let i = start; step > 0 ? i < stop : i > stop; i += step) {
      out.push(i);
      if (out.length > 100000) throw new PyError('range()가 너무 깁니다.');
    }
    return out;
  },
  list: ([v]) => (v === undefined ? [] : [...seqItems(v)]),
  tuple: ([v]) => new PyTuple(v === undefined ? [] : [...seqItems(v)]),
  sorted: ([v]) => [...seqItems(v)].sort((a, b) => (cmp(a, b, '<') ? -1 : cmp(a, b, '>') ? 1 : 0)),
  reversed: ([v]) => [...seqItems(v)].reverse(),
  type: ([v]) => `<class '${typeName(v)}'>`,
  input: (_a, env) => env.readInput(),
  chr: ([v]) => String.fromCodePoint(toInt(v)),
  ord: ([v]) => (typeof v === 'string' && [...v].length === 1 ? v.codePointAt(0)! : (() => { throw new PyError('ord()에는 글자 하나를 넣어야 합니다.'); })()),
};

function callMethod(obj: PyValue, name: string, args: PyValue[]): PyValue {
  if (Array.isArray(obj)) {
    switch (name) {
      case 'append':
        obj.push(args[0]);
        return null;
      case 'pop': {
        if (!obj.length) throw new PyError('빈 리스트에서는 pop()을 할 수 없습니다.');
        let k = args.length ? toInt(args[0]) : obj.length - 1;
        if (k < 0) k += obj.length;
        if (k < 0 || k >= obj.length) throw new PyError('pop() 인덱스가 범위를 벗어났습니다.');
        return obj.splice(k, 1)[0];
      }
      case 'insert':
        obj.splice(toInt(args[0]), 0, args[1]);
        return null;
      case 'remove': {
        const k = obj.findIndex((x) => eq(x, args[0]));
        if (k < 0) throw new PyError(`리스트에 ${repr(args[0])}이(가) 없습니다.`);
        obj.splice(k, 1);
        return null;
      }
      case 'index': {
        const k = obj.findIndex((x) => eq(x, args[0]));
        if (k < 0) throw new PyError(`리스트에 ${repr(args[0])}이(가) 없습니다.`);
        return k;
      }
      case 'count':
        return obj.filter((x) => eq(x, args[0])).length;
      case 'reverse':
        obj.reverse();
        return null;
      case 'sort':
        obj.sort((a, b) => (cmp(a, b, '<') ? -1 : cmp(a, b, '>') ? 1 : 0));
        return null;
      case 'clear':
        obj.length = 0;
        return null;
    }
  }
  if (typeof obj === 'string') {
    switch (name) {
      case 'upper':
        return obj.toUpperCase();
      case 'lower':
        return obj.toLowerCase();
      case 'strip':
        return obj.trim();
      case 'split':
        return args.length && args[0] !== null ? obj.split(str(args[0])) : obj.trim().split(/\s+/).filter(Boolean);
      case 'replace':
        return obj.split(str(args[0])).join(str(args[1]));
      case 'count':
        return obj.split(str(args[0])).length - 1;
      case 'find':
        return obj.indexOf(str(args[0]));
      case 'startswith':
        return obj.startsWith(str(args[0]));
      case 'endswith':
        return obj.endsWith(str(args[0]));
      case 'isdigit':
        return /^\d+$/.test(obj);
      case 'isalpha':
        return /^\p{L}+$/u.test(obj);
      case 'join':
        return seqItems(args[0]).map((x) => {
          if (typeof x !== 'string') throw new PyError('join()에는 문자열 목록이 필요합니다.');
          return x;
        }).join(obj);
    }
  }
  throw new PyError(`${typeName(obj)} 값에는 ${name}() 메서드가 없습니다.`);
}

export function evaluate(e: Expr, env: Env): PyValue {
  switch (e.k) {
    case 'lit':
      return e.v;
    case 'fstr':
      return e.parts.map((p) => (typeof p === 'string' ? p : str(evaluate(p, env)))).join('');
    case 'name': {
      if (env.vars.has(e.id)) return env.vars.get(e.id)!;
      if (env.globals?.has(e.id)) return env.globals.get(e.id)!;
      if (e.id in BUILTINS) throw new PyError(`${e.id}은(는) 함수입니다. ${e.id}( … ) 처럼 괄호와 함께 쓰세요.`);
      throw new PyError(`변수 '${e.id}'에 아직 값이 없습니다.`);
    }
    case 'list':
      return e.items.map((x) => evaluate(x, env));
    case 'tuple':
      return new PyTuple(e.items.map((x) => evaluate(x, env)));
    case 'un': {
      const v = evaluate(e.e, env);
      if (!isNum(v)) throw new PyError(`${typeName(v)} 값 앞에는 '${e.op}'를 쓸 수 없습니다.`);
      return e.op === '-' ? mk(-num(v), v instanceof PyFloat) : mk(num(v), v instanceof PyFloat);
    }
    case 'bin':
      return binop(e.op, evaluate(e.l, env), evaluate(e.r, env));
    case 'and': {
      const l = evaluate(e.l, env);
      return truthy(l) ? evaluate(e.r, env) : l;
    }
    case 'or': {
      const l = evaluate(e.l, env);
      return truthy(l) ? l : evaluate(e.r, env);
    }
    case 'not':
      return !truthy(evaluate(e.e, env));
    case 'cmp': {
      let left = evaluate(e.first, env);
      for (const [op, rx] of e.rest) {
        const right = evaluate(rx, env);
        if (!cmp(left, right, op)) return false;
        left = right;
      }
      return true;
    }
    case 'cond':
      return truthy(evaluate(e.c, env)) ? evaluate(e.a, env) : evaluate(e.b, env);
    case 'call': {
      const args = e.args.map((x) => evaluate(x, env));
      if (e.f.k === 'name') {
        const user = env.callUser?.(e.f.id, args);
        if (user !== undefined) return user;
        if (e.f.id === 'print') throw new PyError("print는 '출력:' 도형으로 표현하세요.");
        const fn = BUILTINS[e.f.id];
        if (!fn || env.vars.has(e.f.id)) throw new PyError(`'${e.f.id}' 함수는 지원하지 않습니다.`);
        return fn(args, env);
      }
      if (e.f.k === 'attr') return callMethod(evaluate(e.f.e, env), e.f.name, args);
      throw new PyError('함수처럼 부를 수 없는 값입니다.');
    }
    case 'index':
      return index(evaluate(e.e, env), evaluate(e.i, env));
    case 'slice':
      return slice(
        evaluate(e.e, env),
        e.lo && evaluate(e.lo, env),
        e.hi && evaluate(e.hi, env),
        e.step && evaluate(e.step, env),
      );
    case 'attr':
      throw new PyError(`'.${e.name}' 뒤에 괄호가 필요합니다.`);
  }
}

/** 대입문의 왼쪽(변수, 리스트 칸, 여러 변수)에 값 넣기 */
export function assign(target: Expr, value: PyValue, env: Env) {
  switch (target.k) {
    case 'name':
      if (KEYWORDS.has(target.id)) throw new PyError(`'${target.id}'에는 값을 넣을 수 없습니다.`);
      env.vars.set(target.id, value);
      return;
    case 'index': {
      const c = evaluate(target.e, env);
      if (!Array.isArray(c)) throw new PyError(`${typeName(c)} 값의 칸은 바꿀 수 없습니다.`);
      let k = toInt(evaluate(target.i, env));
      if (k < 0) k += c.length;
      if (k < 0 || k >= c.length) throw new PyError(`인덱스가 범위를 벗어났습니다. (길이 ${c.length})`);
      c[k] = value;
      return;
    }
    case 'tuple':
    case 'list': {
      const items = seqItems(value, '여러 변수에 나눠 담을 수');
      if (items.length !== target.items.length)
        throw new PyError(`값 ${items.length}개를 변수 ${target.items.length}개에 나눠 담을 수 없습니다.`);
      // 오른쪽을 먼저 모두 계산했으므로(a, b = b, a) 차례로 넣어도 안전하다
      target.items.forEach((t, i) => assign(t, items[i], env));
      return;
    }
    default:
      throw new PyError('= 왼쪽에는 변수 이름을 써야 합니다.');
  }
}

/** 리스트는 참조로 공유되므로, 단계별 기록을 남길 때 복사한다 */
export function cloneValue(v: PyValue): PyValue {
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v instanceof PyTuple) return new PyTuple(v.items.map(cloneValue));
  return v;
}

/** 입력값 글자를 알맞은 값으로: 숫자처럼 보이면 숫자, 아니면 문자열 */
export function guessInput(s: string): PyValue {
  const t = s.trim();
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  if (/^[+-]?(\d+\.\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return new PyFloat(Number(t));
  return s;
}

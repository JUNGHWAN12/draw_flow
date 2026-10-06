// 파이썬식 의사코드 → AST
// 실제 파이썬 인터프리터 없이, 줄 단위 패턴 + 들여쓰기로 구조를 분석한다.

import type { ParseError, ParseResult, Stmt } from './ast';
import { checkBrackets, findAssignment, needsParens, splitTopLevel, stripComment } from './text';

interface Line {
  line: number; // 1부터 시작하는 줄 번호
  indent: number;
  text: string;
}

const UNSUPPORTED: Record<string, string> = {
  class: 'class',
  try: 'try',
  except: 'except',
  finally: 'finally',
  with: 'with',
  import: 'import',
  from: 'from … import',
  lambda: 'lambda',
  yield: 'yield',
  global: 'global',
  nonlocal: 'nonlocal',
  match: 'match',
  case: 'case',
  async: 'async',
  await: 'await',
  del: 'del',
  assert: 'assert',
  raise: 'raise',
};

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const TARGET = /^[\p{L}_][\p{L}\p{N}_]*(\s*,\s*[\p{L}_][\p{L}\p{N}_]*)*$/u;

/** 의사코드에서 '시작', '끝'은 자동으로 추가되므로 학생이 써도 무시한다. */
const IGNORED_LINES = new Set(['시작', '끝', 'start', 'end', 'START', 'END']);

export function tokenizeLines(source: string, errors: ParseError[]): Line[] {
  const out: Line[] = [];
  let style: 'space' | 'tab' | null = null;
  source.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    const text = stripComment(raw);
    if (!text.trim()) return;
    const lead = text.match(/^[ \t]*/)![0];
    if (lead.length) {
      const hasTab = lead.includes('\t');
      const hasSpace = lead.includes(' ');
      const cur = hasTab ? 'tab' : 'space';
      if ((hasTab && hasSpace) || (style && style !== cur)) {
        errors.push({ line: lineNo, message: '들여쓰기에 탭과 공백을 섞어 쓸 수 없습니다. 공백 4칸을 사용하세요.' });
      }
      style ??= cur;
    }
    let indent = 0;
    for (const c of lead) indent += c === '\t' ? 4 : 1;
    out.push({ line: lineNo, indent, text: text.trim() });
  });
  return out;
}

/** 괄호/문자열 밖에 콜론이 있는 위치들 */
function topLevelColons(src: string): number[] {
  const res: number[] = [];
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
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ':' && depth === 0) res.push(i);
  }
  return res;
}

function keywordOf(text: string): string {
  const m = text.match(/^[A-Za-z_]+/);
  if (!m) return '';
  // 키워드 바로 뒤가 식별자 문자이면 키워드가 아님 (예: iffy = 1)
  const next = text[m[0].length];
  if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) return '';
  return m[0];
}

class Parser {
  private i = 0;
  private loopDepth = 0;
  private funcDepth = 0;
  readonly errors: ParseError[];
  private readonly lines: Line[];

  constructor(lines: Line[], errors: ParseError[]) {
    this.lines = lines;
    this.errors = errors;
  }

  private error(line: number, message: string) {
    this.errors.push({ line, message });
  }

  parseProgram(): Stmt[] {
    if (!this.lines.length) return [];
    const base = this.lines[0].indent;
    if (base > 0) this.error(this.lines[0].line, '첫 줄은 들여쓰기 없이 시작해야 합니다.');
    const body = this.parseBlock(base);
    while (this.i < this.lines.length) {
      // parseBlock이 더 작은 들여쓰기에서 멈춘 경우 (첫 줄이 들여쓰기된 경우 등)
      const l = this.lines[this.i];
      body.push(...this.parseBlock(l.indent));
    }
    return body;
  }

  private parseBlock(indent: number): Stmt[] {
    const stmts: Stmt[] = [];
    while (this.i < this.lines.length) {
      const l = this.lines[this.i];
      if (l.indent < indent) break;
      if (l.indent > indent) {
        this.error(l.line, '들여쓰기가 맞지 않습니다. 위 줄과 같은 칸에서 시작하세요.');
        this.parseBlock(l.indent); // 오류가 연쇄되지 않도록 블록을 건너뛴다
        continue;
      }
      const stmt = this.parseStatement(l);
      if (stmt) stmts.push(stmt);
    }
    return stmts;
  }

  /** 헤더 줄(if/while/for …) 다음의 들여쓴 본문 */
  private parseBody(header: Line, name: string): Stmt[] {
    const next = this.lines[this.i];
    if (!next || next.indent <= header.indent) {
      this.error(header.line, `${name} 문 아래 줄은 들여쓰기가 필요합니다. (공백 4칸)`);
      return [];
    }
    return this.parseBlock(next.indent);
  }

  /** 헤더 오류가 있을 때 딸린 본문을 조용히 건너뛴다 */
  private skipBody(header: Line) {
    const next = this.lines[this.i];
    if (next && next.indent > header.indent) this.parseBlock(next.indent);
  }

  /** 헤더 공통 검사: 콜론으로 끝나는지, 한 줄에 몰아 쓰지 않았는지 */
  private headerBody(l: Line, kw: string): string | null {
    const colons = topLevelColons(l.text);
    if (!colons.length) {
      this.error(l.line, `${kw} 문 끝에 콜론(:)이 필요합니다.`);
      return null;
    }
    const last = colons[colons.length - 1];
    if (last !== l.text.length - 1 || colons.length > 1) {
      this.error(l.line, `${kw} 문은 콜론(:)에서 줄을 바꾸고, 다음 줄에 들여써서 작성하세요.`);
      return null;
    }
    return l.text.slice(kw.length, -1).trim();
  }

  private checkCondition(l: Line, kw: string, cond: string): boolean {
    if (!cond) {
      this.error(l.line, `${kw} 뒤에 조건을 써야 합니다.`);
      return false;
    }
    const asg = findAssignment(cond);
    if (asg && asg.op === '=') {
      this.error(l.line, "같은지 비교할 때는 '=' 대신 '=='를 사용하세요.");
      return false;
    }
    return true;
  }

  private parseStatement(l: Line): Stmt | null {
    this.i++;
    const bracket = checkBrackets(l.text);
    if (bracket) {
      this.error(l.line, bracket);
      this.skipBody(l);
      return null;
    }
    const kw = keywordOf(l.text);

    if (/^else\s+if\b/.test(l.text)) {
      this.error(l.line, "파이썬에서는 'else if' 대신 'elif'를 사용합니다.");
      this.skipBody(l);
      return null;
    }

    switch (kw) {
      case 'if':
        return this.parseIf(l);
      case 'elif':
      case 'else':
        this.error(l.line, `${kw} 앞에 짝이 되는 if가 없습니다. 들여쓰기 칸이 if와 같은지 확인하세요.`);
        this.skipBody(l);
        return null;
      case 'while':
        return this.parseWhile(l);
      case 'for':
        return this.parseFor(l);
      case 'def':
        return this.parseDef(l);
      case 'return': {
        if (this.funcDepth === 0) {
          this.error(l.line, 'return은 함수(def) 안에서만 쓸 수 있습니다.');
          return null;
        }
        if (this.lines[this.i] && this.lines[this.i].indent > l.indent) {
          this.error(this.lines[this.i].line, '들여쓰기가 맞지 않습니다. 위 줄과 같은 칸에서 시작하세요.');
          this.skipBody(l);
        }
        return { type: 'return', value: l.text.slice(6).trim(), line: l.line };
      }
      case 'break':
      case 'continue':
      case 'pass':
        if (l.text !== kw) {
          this.error(l.line, `${kw}는 한 줄에 단독으로 써야 합니다.`);
          return null;
        }
        if (kw !== 'pass' && this.loopDepth === 0) {
          this.error(l.line, `${kw}는 반복문(while, for) 안에서만 쓸 수 있습니다.`);
          return null;
        }
        if (this.lines[this.i] && this.lines[this.i].indent > l.indent) {
          this.error(this.lines[this.i].line, '들여쓰기가 맞지 않습니다. 위 줄과 같은 칸에서 시작하세요.');
          this.skipBody(l);
        }
        return { type: kw, line: l.line };
    }

    if (kw in UNSUPPORTED) {
      this.error(l.line, `${UNSUPPORTED[kw]}는 아직 지원하지 않습니다.`);
      this.skipBody(l);
      return null;
    }

    if (this.lines[this.i] && this.lines[this.i].indent > l.indent) {
      if (l.text.endsWith(':')) {
        this.error(l.line, '알 수 없는 블록입니다. if, elif, else, while, for, def 만 사용할 수 있습니다.');
      } else {
        this.error(this.lines[this.i].line, '들여쓰기가 맞지 않습니다. 위 줄과 같은 칸에서 시작하세요.');
      }
      this.skipBody(l);
      if (l.text.endsWith(':')) return null;
    }

    if (IGNORED_LINES.has(l.text)) return null;
    return this.parseSimple(l);
  }

  private parseSimple(l: Line): Stmt {
    const text = l.text;
    const print = text.match(/^print\s*\((.*)\)$/s);
    if (print) {
      const args = splitTopLevel(print[1]).filter((a) => a && !/^(sep|end|file|flush)\s*=/.test(a));
      return { type: 'simple', role: 'output', text: args.join(', '), line: l.line };
    }
    const asg = findAssignment(text);
    if (asg) {
      const lhs = text.slice(0, asg.index).trim();
      const rhs = text.slice(asg.index + asg.op.length).trim();
      if (asg.op === '=' && /(^|[^\p{L}\p{N}_.])input\s*\(/u.test(rhs)) {
        return { type: 'simple', role: 'input', text: lhs, line: l.line };
      }
      if (asg.op !== '=') {
        const op = asg.op.slice(0, -1);
        const operand = op !== '+' && needsParens(rhs) ? `(${rhs})` : rhs;
        return { type: 'simple', role: 'process', text: `${lhs} = ${lhs} ${op} ${operand}`, line: l.line };
      }
      return { type: 'simple', role: 'process', text: `${lhs} = ${rhs}`, line: l.line };
    }
    if (/^input\s*\(/.test(text)) {
      return { type: 'simple', role: 'input', text: '', line: l.line };
    }
    return { type: 'simple', role: 'process', text, line: l.line };
  }

  private parseIf(l: Line): Stmt | null {
    const branches: { cond: string; body: Stmt[]; line: number }[] = [];
    let elseBody: Stmt[] | undefined;
    let ok = true;

    const cond = this.headerBody(l, 'if');
    if (cond === null || !this.checkCondition(l, 'if', cond)) {
      ok = false;
      this.skipBody(l);
    } else {
      branches.push({ cond, body: this.parseBody(l, 'if'), line: l.line });
    }

    while (this.i < this.lines.length) {
      const n = this.lines[this.i];
      if (n.indent !== l.indent) break;
      const kw = keywordOf(n.text);
      if (/^else\s+if\b/.test(n.text)) {
        this.i++;
        this.error(n.line, "파이썬에서는 'else if' 대신 'elif'를 사용합니다.");
        this.skipBody(n);
        ok = false;
        continue;
      }
      if (kw === 'elif') {
        if (elseBody) {
          this.i++;
          this.error(n.line, 'elif는 else보다 앞에 와야 합니다.');
          this.skipBody(n);
          ok = false;
          continue;
        }
        this.i++;
        const c = this.headerBody(n, 'elif');
        if (c === null || !this.checkCondition(n, 'elif', c)) {
          ok = false;
          this.skipBody(n);
        } else {
          branches.push({ cond: c, body: this.parseBody(n, 'elif'), line: n.line });
        }
      } else if (kw === 'else') {
        this.i++;
        if (elseBody) {
          this.error(n.line, 'else는 한 번만 쓸 수 있습니다.');
          this.skipBody(n);
          ok = false;
          continue;
        }
        const rest = this.headerBody(n, 'else');
        if (rest === null) {
          ok = false;
          this.skipBody(n);
        } else if (rest) {
          this.error(n.line, 'else 뒤에는 조건을 쓰지 않습니다. 조건이 필요하면 elif를 사용하세요.');
          ok = false;
          this.skipBody(n);
        } else {
          elseBody = this.parseBody(n, 'else');
        }
      } else {
        break;
      }
    }
    if (!ok) return null;
    return { type: 'if', branches, elseBody, line: l.line };
  }

  private parseDef(l: Line): Stmt | null {
    const head = this.headerBody(l, 'def');
    if (head === null) {
      this.skipBody(l);
      return null;
    }
    if (l.indent > 0 || this.funcDepth > 0) {
      this.error(l.line, '함수(def)는 맨 바깥(들여쓰기 없이)에서만 만들 수 있습니다.');
      this.skipBody(l);
      return null;
    }
    const m = head.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\((.*)\)$/su);
    if (!m) {
      this.error(l.line, '함수는 "def 이름(매개변수):" 형식으로 만드세요.');
      this.skipBody(l);
      return null;
    }
    const params = m[2].trim() ? splitTopLevel(m[2]) : [];
    const bad = params.find((p) => !IDENT.test(p));
    if (bad !== undefined) {
      this.error(l.line, `'${bad}'은(는) 매개변수로 쓸 수 없습니다. (기본값·*args는 지원하지 않습니다)`);
      this.skipBody(l);
      return null;
    }
    this.funcDepth++;
    const saved = this.loopDepth;
    this.loopDepth = 0;
    const body = this.parseBody(l, 'def');
    this.loopDepth = saved;
    this.funcDepth--;
    return { type: 'def', name: m[1], params, body, line: l.line };
  }

  private parseWhile(l: Line): Stmt | null {
    const cond = this.headerBody(l, 'while');
    if (cond === null || !this.checkCondition(l, 'while', cond)) {
      this.skipBody(l);
      return null;
    }
    this.loopDepth++;
    const body = this.parseBody(l, 'while');
    this.loopDepth--;
    return { type: 'while', cond, body, line: l.line };
  }

  private parseFor(l: Line): Stmt | null {
    const head = this.headerBody(l, 'for');
    if (head === null) {
      this.skipBody(l);
      return null;
    }
    const m = head.match(/^(.+?)\s+in\s+(.+)$/s);
    if (!m) {
      this.error(l.line, 'for 문은 "for 변수 in range(…):" 형식으로 작성하세요.');
      this.skipBody(l);
      return null;
    }
    const variable = m[1].trim();
    const iterable = m[2].trim();
    if (!TARGET.test(variable)) {
      this.error(l.line, `'${variable}'은(는) 반복 변수로 쓸 수 없습니다.`);
      this.skipBody(l);
      return null;
    }
    const range = iterable.match(/^range\s*\((.*)\)$/s);
    let start = '0';
    let stop = '';
    let step = '1';
    if (range) {
      if (!IDENT.test(variable)) {
        this.error(l.line, 'range 반복에는 변수 하나만 쓸 수 있습니다.');
        this.skipBody(l);
        return null;
      }
      const args = range[1].trim() ? splitTopLevel(range[1]) : [];
      if (args.length < 1 || args.length > 3 || args.some((a) => !a)) {
        this.error(l.line, 'range()에는 값을 1~3개 넣어야 합니다. 예: range(5), range(1, 6), range(0, 10, 2)');
        this.skipBody(l);
        return null;
      }
      if (args.length === 1) stop = args[0];
      else [start, stop, step = '1'] = args;
      if (/^0+$/.test(step.replace(/\s/g, ''))) {
        this.error(l.line, 'range()의 증가값은 0이 될 수 없습니다.');
        this.skipBody(l);
        return null;
      }
    }
    this.loopDepth++;
    const body = this.parseBody(l, 'for');
    this.loopDepth--;
    if (range) return { type: 'forRange', variable, start, stop, step, body, line: l.line };
    return { type: 'forEach', variable, iterable, body, line: l.line };
  }
}

export function parse(source: string): ParseResult {
  const errors: ParseError[] = [];
  const lines = tokenizeLines(source, errors);
  const parser = new Parser(lines, errors);
  const body = parser.parseProgram();
  errors.sort((a, b) => a.line - b.line);
  return { body, errors };
}

// AST → 파이썬식 의사코드 글자

import type { Stmt } from './ast';

const IND = '    ';

function rangeArgs(start: string, stop: string, step: string): string {
  if (step === '1') return start === '0' ? stop : `${start}, ${stop}`;
  return `${start}, ${stop}, ${step}`;
}

function lines(stmts: Stmt[], depth: number): string[] {
  const pad = IND.repeat(depth);
  const out: string[] = [];
  const block = (body: Stmt[]) => (body.length ? lines(body, depth + 1) : [`${pad}${IND}pass`]);
  for (const s of stmts) {
    switch (s.type) {
      case 'simple':
        if (s.role === 'input') out.push(pad + (s.text ? `${s.text} = input()` : 'input()'));
        else if (s.role === 'output') out.push(`${pad}print(${s.text})`);
        else out.push(pad + s.text);
        break;
      case 'if':
        s.branches.forEach((b, i) => {
          out.push(`${pad}${i ? 'elif' : 'if'} ${b.cond}:`);
          out.push(...block(b.body));
        });
        if (s.elseBody?.length) {
          out.push(`${pad}else:`);
          out.push(...block(s.elseBody));
        }
        break;
      case 'while':
        out.push(`${pad}while ${s.cond}:`, ...block(s.body));
        break;
      case 'forRange':
        out.push(`${pad}for ${s.variable} in range(${rangeArgs(s.start, s.stop, s.step)}):`, ...block(s.body));
        break;
      case 'forEach':
        out.push(`${pad}for ${s.variable} in ${s.iterable}:`, ...block(s.body));
        break;
      default:
        out.push(pad + s.type);
    }
  }
  return out;
}

export function toPseudocode(stmts: Stmt[]): string {
  return lines(stmts, 0).join('\n') + '\n';
}

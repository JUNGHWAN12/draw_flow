// 도형에 들어갈 글자 만들기

import type { ForEachStmt } from './ast';
import { findAssignment, needsParens } from './text';

/** range(start, stop, step)의 반복 조건을 학생이 읽기 쉬운 형태로 (range(1, n + 1) → i <= n) */
export function rangeCondition(variable: string, stop: string, step: string): string {
  const s = stop.trim();
  if (step.trim().startsWith('-')) {
    const m = s.match(/^(.*\S)\s*-\s*1$/);
    if (m) return `${variable} >= ${m[1]}`;
    if (/^-?\d+$/.test(s)) return `${variable} >= ${Number(s) + 1}`;
    return `${variable} > ${s}`;
  }
  const m = s.match(/^(.*\S)\s*\+\s*1$/);
  if (m) return `${variable} <= ${m[1]}`;
  if (/^-?\d+$/.test(s)) return `${variable} <= ${Number(s) - 1}`;
  return `${variable} < ${s}`;
}

export function rangeIncrement(variable: string, step: string): string {
  const s = step.trim();
  if (s.startsWith('-')) {
    const k = s.slice(1).trim();
    return `${variable} = ${variable} - ${needsParens(k) ? `(${k})` : k}`;
  }
  return `${variable} = ${variable} + ${s}`;
}

/** for x in 목록: 을 풀어 쓸 때 사용할 순번 변수 이름 */
export function pickIndexVar(stmt: ForEachStmt): string {
  const used = new Set(`${stmt.variable} ${stmt.iterable}`.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []);
  return ['k', 'j', 'idx', '번호'].find((v) => !used.has(v)) ?? '_k';
}

/** 대입 '='를 순서도 관례 표기 '←'로 */
export function toArrow(text: string): string {
  const asg = findAssignment(text);
  if (!asg || asg.op !== '=') return text;
  return `${text.slice(0, asg.index).trim()} ← ${text.slice(asg.index + 1).trim()}`;
}

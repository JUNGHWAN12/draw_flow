// 문제 채점: 학생 답(AST)을 정답(AST)과 비교한다.
// 1) 구조 — 반복·조건의 짜임새와 도형 개수
// 2) 동작 — 테스트 입력으로 둘 다 실행해 출력이 같은지

import type { Stmt } from './ast';
import { buildFlowchart } from './flowchart';
import { runGraph } from './interp/runner';
import { prettify } from './structure';

export interface GradeItem {
  ok: boolean;
  text: string;
}

export interface GradeResult {
  /** correct: 구조와 동작 모두 같음 / partial: 동작은 같지만 구조가 다름 / wrong */
  verdict: 'correct' | 'partial' | 'wrong';
  items: GradeItem[];
}

/** 구조 요약 글자: P(처리) I(입력) O(출력) L[…](반복) C2[…|…](조건 갈래 수) B(break) N(continue) R(return) D2[…](매개변수 2개 함수) */
export function signature(stmts: Stmt[]): string {
  return stmts
    .map((s): string => {
      switch (s.type) {
        case 'simple':
          return s.role === 'input' ? 'I' : s.role === 'output' ? 'O' : 'P';
        case 'if': {
          const parts = s.branches.map((b) => signature(b.body));
          if (s.elseBody?.length) parts.push(signature(s.elseBody));
          return `C${s.branches.length}[${parts.join('|')}]`;
        }
        case 'while':
        case 'forRange':
        case 'forEach':
          return `L[${signature(s.body)}]`;
        case 'break':
          return 'B';
        case 'continue':
          return 'N';
        case 'pass':
          return '';
        case 'return':
          return 'R';
        case 'def':
          return `D${s.params.length}[${signature(s.body)}]`;
      }
    })
    .filter(Boolean)
    .join(' ');
}

function count(stmts: Stmt[], pick: (s: Stmt) => boolean): number {
  let n = 0;
  for (const s of stmts) {
    if (pick(s)) n++;
    if (s.type === 'if') {
      for (const b of s.branches) n += count(b.body, pick);
      n += count(s.elseBody ?? [], pick);
    } else if (s.type === 'while' || s.type === 'forRange' || s.type === 'forEach' || s.type === 'def')
      n += count(s.body, pick);
  }
  return n;
}

const isLoop = (s: Stmt) => s.type === 'while' || s.type === 'forRange' || s.type === 'forEach';
const isIf = (s: Stmt) => s.type === 'if';

function shapeCounts(stmts: Stmt[]) {
  const g = buildFlowchart(stmts);
  return {
    process: g.nodes.filter((n) => n.kind === 'process').length,
    decision: g.nodes.filter((n) => n.kind === 'decision').length,
  };
}

const show = (lines: string[]) => (lines.length ? lines.join(' / ') : '(출력 없음)');

export function grade(answerIn: Stmt[], studentIn: Stmt[], tests: string[][]): GradeResult {
  const items: GradeItem[] = [];
  // while로 직접 쓴 반복도 for와 같은 순서도이므로, 비교 전에 같은 모양으로 맞춘다
  const answer = prettify(answerIn);
  const student = prettify(studentIn);

  // ── 구조 ──
  const sameShape = signature(answer) === signature(student);
  const [la, ls] = [count(answer, isLoop), count(student, isLoop)];
  const [ia, is] = [count(answer, isIf), count(student, isIf)];
  items.push({ ok: la === ls, text: `반복 ${ls}개 (정답 ${la}개)` });
  items.push({ ok: ia === is, text: `조건 ${is}개 (정답 ${ia}개)` });
  const isDef = (s: Stmt) => s.type === 'def';
  const [da, ds] = [count(answer, isDef), count(student, isDef)];
  if (da || ds) items.push({ ok: da === ds, text: `함수 ${ds}개 (정답 ${da}개)` });
  const ca = shapeCounts(answer);
  const cs = shapeCounts(student);
  items.push({
    ok: ca.process === cs.process && ca.decision === cs.decision,
    text: `도형: 처리 ${cs.process}개, 판단 ${cs.decision}개 (정답: 처리 ${ca.process}개, 판단 ${ca.decision}개)`,
  });
  if (!sameShape && la === ls && ia === is)
    items.push({ ok: false, text: '반복·조건의 순서나 안에 든 문장이 정답과 다릅니다.' });

  // ── 동작 ──
  const ga = buildFlowchart(answer);
  const gs = buildFlowchart(student);
  const cases = tests.length ? tests : [[]];
  let behaviourOk = true;
  cases.forEach((inputs, i) => {
    const name = tests.length ? `테스트 ${i + 1} (입력: ${inputs.length ? inputs.join(', ') : '없음'})` : '실행 결과';
    const ta = runGraph(ga, inputs);
    const ts = runGraph(gs, inputs);
    const errA = ta.steps.find((s) => s.error)?.error;
    const errS = ts.steps.find((s) => s.error)?.error;
    if (errA) {
      items.push({ ok: true, text: `${name}: 정답도 실행할 수 없어 비교하지 않았습니다.` });
      return;
    }
    if (errS) {
      behaviourOk = false;
      items.push({ ok: false, text: `${name}: 실행 중 오류 — ${errS}` });
      return;
    }
    const same = ta.output.length === ts.output.length && ta.output.every((l, k) => l === ts.output[k]);
    if (!same) behaviourOk = false;
    items.push({
      ok: same,
      text: same
        ? `${name}: 출력이 같습니다 — ${show(ts.output)}`
        : `${name}: 출력이 다릅니다 — 정답 ${show(ta.output)}, 내 답 ${show(ts.output)}`,
    });
  });

  const verdict = !behaviourOk || !student.length ? 'wrong' : sameShape ? 'correct' : 'partial';
  return { verdict, items };
}

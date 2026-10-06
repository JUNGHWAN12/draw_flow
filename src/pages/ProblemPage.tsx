import { useCallback, useEffect, useMemo, useState } from 'react';
import { CodeEditor } from '../components/CodeEditor';
import { FlowView } from '../components/FlowView';
import { EditorPage } from './EditorPage';
import { parse } from '../core/parser';
import { buildFlowchart } from '../core/flowchart';
import { graphToAst } from '../core/structure';
import { grade, type GradeResult } from '../core/grade';
import type { FlowGraph } from '../core/types';
import { decodeProblem, encodeProblem, problemId, problemUrl, type Problem, type ProblemMode } from '../io/share';
import { load, save } from '../io/storage';
import { EXAMPLES } from '../examples';

interface Props {
  /** 주소의 d= 값 (있으면 풀기 화면) */
  encoded: string | null;
}

const MODES: { mode: ProblemMode; name: string; hint: string }[] = [
  { mode: 'code2flow', name: '코드 보고 순서도 그리기', hint: '아래 의사코드를 순서도로 그려 보세요.' },
  { mode: 'flow2code', name: '순서도 보고 코드 쓰기', hint: '아래 순서도를 파이썬식 의사코드로 써 보세요.' },
];

const linesOf = (text: string) => text.split('\n').filter((l, i, all) => l !== '' || i < all.length - 1);

export function ProblemPage({ encoded }: Props) {
  return encoded ? <SolveView encoded={encoded} /> : <AuthorView />;
}

// ── 문제 만들기 (교사) ─────────────────────────────────

const DEFAULT_DRAFT: Problem = {
  v: 1,
  title: '1부터 n까지의 합',
  desc: 'n을 입력받아 1부터 n까지의 합을 출력하는 순서도를 그리세요.',
  mode: 'code2flow',
  answer: 'n = int(input())\n합 = 0\nfor i in range(1, n + 1):\n    합 = 합 + i\nprint(합)\n',
  tests: [['5'], ['10']],
};

function AuthorView() {
  const [draft, setDraft] = useState<Problem>(() => load('problemDraft', DEFAULT_DRAFT));
  const [testTexts, setTestTexts] = useState<string[]>(() => draft.tests.map((t) => t.join('\n')));
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const problem = useMemo<Problem>(() => ({ ...draft, tests: testTexts.map(linesOf) }), [draft, testTexts]);
  useEffect(() => save('problemDraft', problem), [problem]);
  useEffect(() => {
    setLink('');
    setCopied(false);
  }, [problem]);

  const parsed = useMemo(() => parse(draft.answer), [draft.answer]);
  const preview = useMemo(() => (parsed.errors.length ? null : buildFlowchart(parsed.body)), [parsed]);
  const errorLines = useMemo(() => new Set(parsed.errors.map((e) => e.line)), [parsed]);
  const set = (patch: Partial<Problem>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="problem author">
      <section className="panel problem-form">
        <h2>문제 만들기</h2>
        <label>
          제목
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label>
          설명
          <textarea rows={3} value={draft.desc} onChange={(e) => set({ desc: e.target.value })} />
        </label>
        <fieldset>
          <legend>문제 유형</legend>
          {MODES.map((m) => (
            <label key={m.mode} className="radio">
              <input type="radio" checked={draft.mode === m.mode} onChange={() => set({ mode: m.mode })} />
              {m.name}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <div className="field-head">
            정답 의사코드
            <select
              value=""
              aria-label="예제에서 가져오기"
              onChange={(e) => {
                const ex = EXAMPLES.find((x) => x.id === e.target.value);
                if (ex) set({ answer: ex.code, title: ex.title });
              }}
            >
              <option value="">예제에서 가져오기…</option>
              {EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>
          <div className="answer-editor">
            <CodeEditor
              value={draft.answer}
              onChange={(answer) => set({ answer })}
              errorLines={errorLines}
              highlightLine={null}
              onHoverLine={() => {}}
            />
          </div>
          {parsed.errors.length > 0 && (
            <ul className="form-errors">
              {parsed.errors.map((e, i) => (
                <li key={i}>
                  {e.line}번째 줄: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="field">
          <div className="field-head">
            채점용 테스트 입력
            <button onClick={() => setTestTexts((t) => [...t, ''])}>+ 테스트 추가</button>
          </div>
          <p className="muted small">테스트마다 input()에 들어갈 값을 한 줄에 하나씩 적습니다. 학생 답과 정답을 같은 입력으로 실행해 출력을 비교합니다.</p>
          <div className="tests">
            {testTexts.map((t, i) => (
              <div key={i} className="test">
                <span>테스트 {i + 1}</span>
                <textarea
                  rows={2}
                  value={t}
                  onChange={(e) => setTestTexts((all) => all.map((x, k) => (k === i ? e.target.value : x)))}
                />
                <button aria-label={`테스트 ${i + 1} 삭제`} onClick={() => setTestTexts((all) => all.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="share">
          <button
            className="primary"
            disabled={!preview || !draft.title.trim()}
            onClick={async () => setLink(problemUrl(await encodeProblem(problem)))}
          >
            학생용 링크 만들기
          </button>
          {link && (
            <>
              <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="학생용 링크" />
              <div className="share-actions">
                <button
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? '✔ 복사됨' : '링크 복사'}
                </button>
                <a className="button" href={link} target="_blank" rel="noreferrer">
                  학생 화면 열어 보기 ↗
                </a>
              </div>
              <p className="muted small">
                링크 안에 문제와 정답이 함께 들어 있습니다(서버 없이 공유하기 위해서). 링크 길이: {link.length}자
              </p>
            </>
          )}
        </div>
      </section>
      <section className="panel problem-preview">
        <div className="toolbar">
          <b>정답 순서도 미리보기</b>
        </div>
        {preview ? <FlowView graph={preview} /> : <div className="empty-note">정답 의사코드의 오류를 고치면 순서도가 보입니다.</div>}
      </section>
    </div>
  );
}

// ── 문제 풀기 (학생) ───────────────────────────────────

function Verdict({ result, mode }: { result: GradeResult; mode: ProblemMode }) {
  const head =
    result.verdict === 'correct'
      ? '🎉 정답입니다!'
      : result.verdict === 'partial'
        ? `🟡 실행 결과는 맞지만, ${mode === 'code2flow' ? '순서도' : '코드'}의 짜임새(반복·조건)가 정답과 다릅니다.`
        : '🤔 아직 정답이 아닙니다. 아래를 확인해 보세요.';
  return (
    <div className={`verdict verdict-${result.verdict}`} role="status">
      <b>{head}</b>
      <ul>
        {result.items.map((it, i) => (
          <li key={i} className={it.ok ? 'ok' : 'bad'}>
            {it.ok ? '✔' : '✘'} {it.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SolveView({ encoded }: { encoded: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loadError, setLoadError] = useState('');
  const id = problemId(encoded);
  const codeKey = `problem:${id}:code`;
  const [code, setCode] = useState<string>(() => load(codeKey, ''));
  const [studentGraph, setStudentGraph] = useState<FlowGraph | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [message, setMessage] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    decodeProblem(encoded).then(
      (p) => alive && setProblem(p),
      (e: Error) => alive && setLoadError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [encoded]);

  useEffect(() => save(codeKey, code), [code, codeKey]);

  const answer = useMemo(() => (problem ? parse(problem.answer) : null), [problem]);
  const answerGraph = useMemo(() => (answer && !answer.errors.length ? buildFlowchart(answer.body) : null), [answer]);
  const studentParse = useMemo(() => parse(code), [code]);
  const errorLines = useMemo(() => new Set(studentParse.errors.map((e) => e.line)), [studentParse]);
  const onGraphChange = useCallback((g: FlowGraph) => setStudentGraph(g), []);

  // 답을 고치면 이전 채점 결과는 지운다
  useEffect(() => {
    setResult(null);
    setMessage([]);
  }, [code, studentGraph]);

  if (loadError) return <div className="problem-message">{loadError}</div>;
  if (!problem || !answer) return <div className="problem-message">문제를 불러오는 중…</div>;

  const check = () => {
    setResult(null);
    setMessage([]);
    if (problem.mode === 'flow2code') {
      if (studentParse.errors.length) {
        setMessage(studentParse.errors.map((e) => `${e.line}번째 줄: ${e.message}`));
        return;
      }
      setResult(grade(answer.body, studentParse.body, problem.tests));
    } else {
      if (!studentGraph || !studentGraph.nodes.length) {
        setMessage(['오른쪽에 순서도를 그려 주세요.']);
        return;
      }
      const r = graphToAst(studentGraph);
      if (!r.ok) {
        setMessage(r.issues.map((i) => i.message));
        return;
      }
      setResult(grade(answer.body, r.body, problem.tests));
    }
  };

  const mode = MODES.find((m) => m.mode === problem.mode)!;
  return (
    <div className="problem solve">
      <section className="panel problem-info">
        <div className="problem-head">
          <span className="badge">{mode.name}</span>
          <h2>{problem.title}</h2>
          {problem.desc && <p>{problem.desc}</p>}
          <p className="muted">{mode.hint}</p>
        </div>
        <div className="problem-given">
          {problem.mode === 'code2flow' ? (
            <pre className="given-code">{problem.answer}</pre>
          ) : answerGraph ? (
            <FlowView graph={answerGraph} />
          ) : null}
        </div>
        <div className="problem-check">
          <button className="primary" onClick={check}>
            채점하기
          </button>
          {message.length > 0 && (
            <div className="verdict verdict-wrong" role="status">
              <b>먼저 고쳐야 할 곳이 있습니다.</b>
              <ul>
                {message.map((m, i) => (
                  <li key={i} className="bad">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result && <Verdict result={result} mode={problem.mode} />}
        </div>
      </section>
      <section className="panel problem-work">
        {problem.mode === 'code2flow' ? (
          <EditorPage storageKey={`problem:${id}`} onGraphChange={onGraphChange} />
        ) : (
          <>
            <div className="toolbar">
              <b>내 의사코드</b>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              errorLines={errorLines}
              highlightLine={null}
              onHoverLine={() => {}}
            />
            {studentParse.errors.length > 0 && (
              <div className="status status-error">
                <ul>
                  {studentParse.errors.map((e, i) => (
                    <li key={i}>
                      <b>{e.line}번째 줄:</b> {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

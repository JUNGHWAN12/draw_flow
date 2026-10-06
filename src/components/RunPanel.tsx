import { useEffect, useMemo, useRef, useState } from 'react';
import type { FlowGraph } from '../core/types';
import { runGraph } from '../core/interp/runner';
import { load, save } from '../io/storage';

interface Props {
  graph: FlowGraph;
  /** 지금 단계의 도형 (null이면 강조 없음) */
  onStep: (nodeId: string | null) => void;
  onClose: () => void;
}

const SPEEDS = [
  { name: '느리게', ms: 1200 },
  { name: '보통', ms: 600 },
  { name: '빠르게', ms: 200 },
];

/** 단계별 실행 창: 실행 단추, 변수 표/추적 표, 출력 */
export function RunPanel({ graph, onStep, onClose }: Props) {
  const [inputText, setInputText] = useState<string>(() => load('runInputs', ''));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'vars' | 'table'>('table');
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => save('runInputs', inputText), [inputText]);

  const inputs = useMemo(() => inputText.split('\n').filter((l, i, all) => l !== '' || i < all.length - 1), [inputText]);
  const trace = useMemo(() => runGraph(graph, inputs), [graph, inputs]);
  const steps = trace.steps;
  const last = steps.length - 1;
  const step = steps[Math.min(index, last)];

  // 순서도나 입력값이 바뀌면 처음부터
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [trace]);

  useEffect(() => {
    onStep(step?.nodeId || null);
  }, [step, onStep]);

  useEffect(() => () => onStep(null), [onStep]);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, index, last, speed]);

  // 추적 표에서 지금 줄이 보이도록
  useEffect(() => {
    tableRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [index, tab]);

  const labels = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n.label])), [graph]);
  const varNames = useMemo(() => {
    const names: string[] = [];
    for (const s of steps.slice(0, index + 1)) for (const [k] of s.vars) if (!names.includes(k)) names.push(k);
    return names;
  }, [steps, index]);

  const output = trace.output.slice(0, step?.outputCount ?? 0);
  const go = (i: number) => {
    setPlaying(false);
    setIndex(Math.max(0, Math.min(last, i)));
  };

  return (
    <section className="run-panel" aria-label="단계별 실행">
      <div className="run-controls">
        <b>단계별 실행</b>
        <button onClick={() => go(0)} disabled={index === 0} title="처음으로">
          ⏮
        </button>
        <button onClick={() => go(index - 1)} disabled={index === 0} title="이전 단계">
          ◀ 이전
        </button>
        <button className="primary" onClick={() => go(index + 1)} disabled={index >= last} title="다음 단계">
          다음 ▶
        </button>
        <button onClick={() => go(last)} disabled={index >= last} title="끝까지">
          ⏭
        </button>
        <button
          onClick={() => {
            if (index >= last) setIndex(0);
            setPlaying((p) => !p);
          }}
          disabled={last === 0}
        >
          {playing ? '⏸ 멈춤' : '⏵ 자동'}
        </button>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="자동 실행 빠르기">
          {SPEEDS.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="run-count">
          {index + 1} / {steps.length} 단계
        </span>
        <span className="spacer" />
        <button className="close" onClick={onClose} aria-label="단계별 실행 닫기">
          ✕
        </button>
      </div>

      <div className={`run-note${step?.error ? ' is-error' : index === last && trace.finished ? ' is-done' : ''}`}>
        {step?.note}
        {index === last && trace.finished && ' — 실행이 끝났습니다.'}
      </div>

      <div className="run-body">
        <label className="run-inputs">
          <span>입력값 (한 줄에 하나)</span>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'예)\n10\n민수'}
            spellCheck={false}
          />
          <small>{trace.inputsUsed}개 사용</small>
        </label>

        <div className="run-vars">
          <div className="run-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'table'} className={tab === 'table' ? 'active' : ''} onClick={() => setTab('table')}>
              추적 표
            </button>
            <button role="tab" aria-selected={tab === 'vars'} className={tab === 'vars' ? 'active' : ''} onClick={() => setTab('vars')}>
              지금 변수
            </button>
          </div>
          <div className="run-table" ref={tableRef}>
            {tab === 'vars' ? (
              <table>
                <thead>
                  <tr>
                    <th>변수</th>
                    <th>값</th>
                  </tr>
                </thead>
                <tbody>
                  {step?.vars.length ? (
                    step.vars.map(([k, v]) => (
                      <tr key={k} className={step.changed.includes(k) ? 'is-changed' : ''}>
                        <td>{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="muted">
                        아직 변수가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>단계</th>
                    <th>도형</th>
                    {varNames.map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                    <th>출력</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.slice(0, index + 1).map((s, i) => {
                    const vals = new Map(s.vars);
                    return (
                      <tr key={i} className={i === index ? 'is-current' : ''} onClick={() => go(i)}>
                        <td>{i + 1}</td>
                        <td className="run-shape">
                          {labels.get(s.nodeId)}
                          {s.branch && <span className={`run-branch run-branch-${s.branch === '예' ? 'yes' : 'no'}`}>{s.branch}</span>}
                        </td>
                        {varNames.map((k) => (
                          <td key={k} className={s.changed.includes(k) ? 'is-changed' : ''}>
                            {s.changed.includes(k) ? vals.get(k) : ''}
                          </td>
                        ))}
                        <td>{s.printed.join(' / ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="run-output">
          <span>출력</span>
          <pre>{output.length ? output.join('\n') : ' '}</pre>
        </div>
      </div>
    </section>
  );
}

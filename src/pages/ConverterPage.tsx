import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, ConnectionMode } from '@xyflow/react';
import { CodeEditor } from '../components/CodeEditor';
import { nodeTypes } from '../components/nodes/ShapeNodes';
import { edgeTypes } from '../components/ArrowEdge';
import { toRfEdges, toRfNodes } from '../components/flowTypes';
import { parse } from '../core/parser';
import { buildFlowchart } from '../core/flowchart';
import type { ParseError } from '../core/ast';
import type { FlowGraph } from '../core/types';
import { EXAMPLES } from '../examples';
import { load, save } from '../io/storage';
import { downloadDataUrl, downloadText, pickTextFile } from '../io/files';
import { exportImage } from '../io/imageExport';
import { toDrawio } from '../io/drawioExport';
import { PrintDialog } from '../components/PrintDialog';
import { RunPanel } from '../components/RunPanel';
import { useFollowNode } from '../components/useFollowNode';

interface Props {
  code: string;
  onCodeChange: (code: string) => void;
  onSendToEditor: (graph: FlowGraph, pseudocode: string) => void;
}

const EMPTY: FlowGraph = { nodes: [], edges: [] };

function ConverterInner({ code, onCodeChange, onSendToEditor }: Props) {
  const [arrowAssign, setArrowAssign] = useState<boolean>(() => load('arrowAssign', false));
  const [graph, setGraph] = useState<FlowGraph>(EMPTY);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  useEffect(() => save('arrowAssign', arrowAssign), [arrowAssign]);

  // 입력이 멈추고 0.3초 뒤 변환
  useEffect(() => {
    const t = setTimeout(() => {
      const result = parse(code);
      setErrors(result.errors);
      if (!result.errors.length) setGraph(buildFlowchart(result.body, { arrowAssign }));
    }, 300);
    return () => clearTimeout(t);
  }, [code, arrowAssign]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => fitView({ padding: 0.08, maxZoom: 1.2 }));
    return () => cancelAnimationFrame(raf);
  }, [graph, fitView]);

  const nodes = useMemo(
    () =>
      toRfNodes(graph.nodes).map((n) => ({
        ...n,
        data: { ...n.data, highlight: hoverLine !== null && n.data.line === hoverLine, current: n.id === currentId },
      })),
    [graph, hoverLine, currentId],
  );
  const currentLine = currentId ? (graph.nodes.find((n) => n.id === currentId)?.line ?? null) : null;
  useFollowNode(currentId, flowRef);
  const edges = useMemo(() => toRfEdges(graph.edges), [graph]);
  const errorLines = useMemo(() => new Set(errors.map((e) => e.line)), [errors]);
  const stale = errors.length > 0;

  const exportAs = async (format: 'png' | 'svg') => {
    if (!flowRef.current) return;
    try {
      const url = await exportImage(flowRef.current, nodes, format);
      downloadDataUrl(url, `순서도.${format}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="converter">
      <section className="panel code-panel">
        <div className="toolbar">
          <select
            aria-label="예제 불러오기"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value);
              if (ex && (!code.trim() || confirm(`'${ex.title}' 예제를 불러올까요? 지금 입력한 내용은 지워집니다.`))) {
                onCodeChange(ex.code);
              }
            }}
          >
            <option value="">예제 불러오기…</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              const text = await pickTextFile('.py,.txt');
              if (text !== null) onCodeChange(text.replace(/\r\n/g, '\n'));
            }}
          >
            열기
          </button>
          <button onClick={() => downloadText(code, '의사코드.py')}>저장 (.py)</button>
        </div>
        <CodeEditor
          value={code}
          onChange={onCodeChange}
          errorLines={errorLines}
          highlightLine={currentLine ?? hoverLine}
          onHoverLine={setHoverLine}
        />
        <div className={`status ${stale ? 'status-error' : 'status-ok'}`} role="status">
          {stale ? (
            <ul>
              {errors.map((e, i) => (
                <li key={i}>
                  <b>{e.line}번째 줄:</b> {e.message}
                </li>
              ))}
            </ul>
          ) : graph.nodes.length > 2 ? (
            `✔ 순서도로 변환했습니다. (도형 ${graph.nodes.length}개)`
          ) : (
            '의사코드를 입력하면 오른쪽에 순서도가 그려집니다.'
          )}
        </div>
      </section>

      <section className="panel flow-panel">
        <div className="toolbar">
          <label className="toggle" title="대입을 ← 로 표시합니다 (예: 합 ← 합 + i)">
            <input type="checkbox" checked={arrowAssign} onChange={(e) => setArrowAssign(e.target.checked)} />
            대입을 ← 로 표시
          </label>
          <span className="spacer" />
          <button
            className={running ? 'active' : ''}
            disabled={!graph.nodes.length}
            onClick={() => setRunning((r) => !r)}
            title="순서도를 한 단계씩 실행하며 변수 값의 변화를 봅니다"
          >
            ▶ 단계별 실행
          </button>
          <button className="primary" disabled={stale || !graph.nodes.length} onClick={() => onSendToEditor(graph, code)}>
            편집기에서 고치기 →
          </button>
          <button disabled={!graph.nodes.length} onClick={() => exportAs('png')}>
            PNG
          </button>
          <button disabled={!graph.nodes.length} onClick={() => exportAs('svg')}>
            SVG
          </button>
          <button
            disabled={!graph.nodes.length}
            onClick={() => downloadText(toDrawio(graph), '순서도.drawio', 'application/xml')}
          >
            draw.io
          </button>
          <button
            disabled={!graph.nodes.length}
            title="A4 한 장으로 인쇄합니다. 인쇄 창에서 'PDF로 저장'을 고르면 PDF가 됩니다."
            onClick={() => setPrinting(true)}
          >
            인쇄 / PDF
          </button>
        </div>
        <div className={`flow-canvas${stale ? ' is-stale' : ''}`} ref={flowRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeMouseEnter={(_, n) => setHoverLine(n.data.line ?? null)}
            onNodeMouseLeave={() => setHoverLine(null)}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            className="readonly"
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {stale && graph.nodes.length > 0 && <div className="stale-badge">오류를 고치면 순서도가 다시 그려집니다</div>}
        </div>
        {printing && (
          <PrintDialog
            defaultTitle="순서도"
            code={stale ? { ok: false, reason: '의사코드에 오류가 있습니다.' } : { ok: true, text: code }}
            getImage={() => exportImage(flowRef.current!, nodes, 'png')}
            onClose={() => setPrinting(false)}
          />
        )}
        {running && graph.nodes.length > 0 && (
          <RunPanel graph={graph} onStep={setCurrentId} onClose={() => setRunning(false)} />
        )}
      </section>
    </div>
  );
}

export function ConverterPage(props: Props) {
  return (
    <ReactFlowProvider>
      <ConverterInner {...props} />
    </ReactFlowProvider>
  );
}

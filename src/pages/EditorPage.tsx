import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { nodeTypes } from '../components/nodes/ShapeNodes';
import { edgeTypes } from '../components/ArrowEdge';
import { ARROW_MARKER, fromRf, toRfEdges, toRfNodes, type ArrowEdge, type ShapeNode } from '../components/flowTypes';
import { nodeSize } from '../core/shapes';
import type { EdgeLabel, FlowDocument, NodeKind } from '../core/types';
import { load, save } from '../io/storage';
import { downloadDataUrl, downloadText, parseDocument, pickTextFile, safeFilename, toDocument } from '../io/files';
import { exportImage } from '../io/imageExport';
import { toDrawio } from '../io/drawioExport';

interface Props {
  /** 의사코드 변환 화면에서 보낸 순서도 (보낼 때마다 새 객체) */
  incoming: FlowDocument | null;
  onIncomingConsumed: () => void;
}

interface Snapshot {
  nodes: ShapeNode[];
  edges: ArrowEdge[];
}

const PALETTE: { kind: NodeKind; name: string; label: string }[] = [
  { kind: 'terminal', name: '터미널', label: '시작' },
  { kind: 'process', name: '처리', label: '처리' },
  { kind: 'decision', name: '판단', label: '조건' },
];

const LABEL_CYCLE: (EdgeLabel | undefined)[] = [undefined, '예', '아니오'];

function fromDoc(doc: FlowDocument, keepPoints: boolean): Snapshot {
  return { nodes: toRfNodes(doc.nodes, true), edges: toRfEdges(doc.edges, keepPoints) };
}

/** 실행 취소 비교용: 선택·크기 측정 등 화면 상태는 제외 */
function essence(s: Snapshot): string {
  return JSON.stringify([
    s.nodes.map((n) => [n.id, n.type, n.data.label, Math.round(n.position.x), Math.round(n.position.y)]),
    s.edges.map((e) => [e.id, e.source, e.sourceHandle, e.target, e.targetHandle, e.data?.label]),
  ]);
}

function EditorInner({ incoming, onIncomingConsumed }: Props) {
  const initial = useMemo<Snapshot>(() => {
    const doc = load<FlowDocument | null>('editorDoc', null);
    return doc ? fromDoc(doc, true) : { nodes: [], edges: [] };
  }, []);
  const [nodes, setNodes] = useState<ShapeNode[]>(initial.nodes);
  const [edges, setEdges] = useState<ArrowEdge[]>(initial.edges);
  const [title, setTitle] = useState<string>(() => load('editorTitle', '내 순서도'));
  const flowRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // ── 실행 취소 / 다시 실행 ──────────────────────────────
  const history = useRef<{ past: Snapshot[]; future: Snapshot[]; last: Snapshot; lastKey: string }>({
    past: [],
    future: [],
    last: initial,
    lastKey: essence(initial),
  });
  const [, forceRender] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      const snap = { nodes, edges };
      const key = essence(snap);
      const h = history.current;
      if (key === h.lastKey) return;
      h.past.push(h.last);
      if (h.past.length > 100) h.past.shift();
      h.future = [];
      h.last = snap;
      h.lastKey = key;
      forceRender((x) => x + 1);
      save('editorDoc', toDocument(fromRf(nodes, edges), title));
    }, 250);
    return () => clearTimeout(t);
  }, [nodes, edges, title]);

  useEffect(() => save('editorTitle', title), [title]);

  // 다른 화면으로 넘어갈 때 마지막 변경도 저장
  const latest = useRef({ nodes, edges, title });
  latest.current = { nodes, edges, title };
  useEffect(
    () => () => {
      const l = latest.current;
      save('editorDoc', toDocument(fromRf(l.nodes, l.edges), l.title));
    },
    [],
  );

  const restore = useCallback((snap: Snapshot) => {
    const h = history.current;
    h.last = snap;
    h.lastKey = essence(snap);
    setNodes(snap.nodes);
    setEdges(snap.edges);
    forceRender((x) => x + 1);
  }, []);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.last);
    restore(prev);
  }, [restore]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(h.last);
    restore(next);
  }, [restore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── 변환 화면에서 받은 순서도 ─────────────────────────
  useEffect(() => {
    if (!incoming) return;
    const snap = fromDoc(incoming, true);
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setTitle(incoming.title);
    onIncomingConsumed();
    requestAnimationFrame(() => fitView({ padding: 0.1, maxZoom: 1.2 }));
  }, [incoming, onIncomingConsumed, fitView]);

  // ── 변경 처리 ─────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange<ShapeNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    // 도형을 옮기면 자동 배치 경로는 더 이상 맞지 않으므로 직각선으로 바꾼다
    const moved = new Set(changes.filter((c) => c.type === 'position').map((c) => c.id));
    if (moved.size) {
      setEdges((es) =>
        es.some((e) => e.data?.points && (moved.has(e.source) || moved.has(e.target)))
          ? es.map((e) =>
              e.data?.points && (moved.has(e.source) || moved.has(e.target))
                ? { ...e, data: { ...e.data, points: undefined } }
                : e,
            )
          : es,
      );
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ArrowEdge>[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source === c.target) return;
      setEdges((es) => {
        let label: EdgeLabel | undefined;
        const src = nodes.find((n) => n.id === c.source);
        if (src?.type === 'decision') {
          const used = es.filter((e) => e.source === c.source).map((e) => e.data?.label);
          label = !used.includes('예') ? '예' : !used.includes('아니오') ? '아니오' : undefined;
        }
        return addEdge(
          { ...c, id: `e${Date.now().toString(36)}`, type: 'arrow', markerEnd: ARROW_MARKER, data: { label } },
          es,
        );
      });
    },
    [nodes],
  );

  /** 도형 추가. 위치를 정하지 않으면 선택된(또는 마지막) 도형 바로 아래, 없으면 화면 가운데에 놓는다 */
  const addNode = useCallback(
    (kind: NodeKind, label: string, center?: { x: number; y: number }) => {
      const size = nodeSize(kind, label);
      setNodes((ns) => {
        let at = center;
        if (!at) {
          const ref = ns.find((n) => n.selected) ?? ns[ns.length - 1];
          if (ref) {
            const w = ref.width ?? ref.measured?.width ?? 0;
            const h = ref.height ?? ref.measured?.height ?? 0;
            at = { x: ref.position.x + w / 2, y: ref.position.y + h + 40 + size.height / 2 };
          } else {
            const el = flowRef.current?.getBoundingClientRect();
            at = screenToFlowPosition(el ? { x: el.left + el.width / 2, y: el.top + el.height / 3 } : { x: 300, y: 200 });
          }
        }
        const node: ShapeNode = {
          id: `n${Date.now().toString(36)}`,
          type: kind,
          position: { x: Math.round(at.x - size.width / 2), y: Math.round(at.y - size.height / 2) },
          ...size,
          data: { label, editable: true },
          selected: true,
        };
        return [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node];
      });
    },
    [screenToFlowPosition],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const item = PALETTE.find((p) => p.kind === e.dataTransfer.getData('application/draw-flow'));
    if (item) addNode(item.kind, item.label, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  // ── 간단 검사 ─────────────────────────────────────────
  const issues = useMemo(() => {
    const list: string[] = [];
    if (!nodes.length) return list;
    const out = (id: string) => edges.filter((e) => e.source === id);
    const inn = (id: string) => edges.filter((e) => e.target === id);
    const terminals = nodes.filter((n) => n.type === 'terminal');
    if (!terminals.some((n) => out(n.id).length && !inn(n.id).length)) list.push('시작 터미널이 없습니다.');
    if (!terminals.some((n) => inn(n.id).length && !out(n.id).length)) list.push('끝 터미널이 없습니다.');
    for (const n of nodes) {
      if (n.type === 'decision' && out(n.id).length !== 2)
        list.push(`판단 '${n.data.label}'에서 나가는 화살표는 2개(예/아니오)여야 합니다.`);
      if (n.type === 'process' && !out(n.id).length) list.push(`처리 '${n.data.label}'에서 나가는 화살표가 없습니다.`);
      if (n.type !== 'terminal' && !inn(n.id).length) list.push(`'${n.data.label}'(으)로 들어오는 화살표가 없습니다.`);
    }
    return list;
  }, [nodes, edges]);

  const graph = () => fromRf(nodes, edges);
  const h = history.current;

  const exportAs = async (format: 'png' | 'svg') => {
    if (!flowRef.current) return;
    try {
      downloadDataUrl(await exportImage(flowRef.current, nodes, format), `${safeFilename(title)}.${format}`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="editor">
      <div className="toolbar">
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="제목" />
        <button
          onClick={() => {
            if (!nodes.length || confirm('새 순서도를 만들까요? 지금 그림은 지워집니다. (실행 취소 가능)')) {
              setNodes([]);
              setEdges([]);
            }
          }}
        >
          새로 만들기
        </button>
        <button
          onClick={async () => {
            const text = await pickTextFile('.json');
            if (text === null) return;
            try {
              const doc = parseDocument(text);
              const snap = fromDoc(doc, true);
              setNodes(snap.nodes);
              setEdges(snap.edges);
              setTitle(doc.title);
              requestAnimationFrame(() => fitView({ padding: 0.1, maxZoom: 1.2 }));
            } catch (e) {
              alert((e as Error).message);
            }
          }}
        >
          열기
        </button>
        <button
          onClick={() =>
            downloadText(
              JSON.stringify(toDocument(graph(), title), null, 2),
              `${safeFilename(title)}.json`,
              'application/json',
            )
          }
        >
          저장 (.json)
        </button>
        <span className="sep" />
        <button onClick={undo} disabled={!h.past.length} title="Ctrl+Z">
          ↶ 실행 취소
        </button>
        <button onClick={redo} disabled={!h.future.length} title="Ctrl+Y">
          ↷ 다시 실행
        </button>
        <span className="spacer" />
        <button disabled={!nodes.length} onClick={() => exportAs('png')}>
          PNG
        </button>
        <button disabled={!nodes.length} onClick={() => exportAs('svg')}>
          SVG
        </button>
        <button
          disabled={!nodes.length}
          onClick={() => downloadText(toDrawio(graph(), title), `${safeFilename(title)}.drawio`, 'application/xml')}
        >
          draw.io
        </button>
      </div>

      <div className="editor-body">
        <aside className="palette">
          <h3>도형</h3>
          {PALETTE.map((p) => (
            <button
              key={p.kind}
              className="palette-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/draw-flow', p.kind);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => addNode(p.kind, p.label)}
              title="클릭하거나 캔버스로 끌어다 놓으세요"
            >
              <span className={`palette-shape palette-${p.kind}`} />
              {p.name}
            </button>
          ))}
          <div className="palette-item palette-static">
            <span className="palette-arrow">→</span>화살표
          </div>
          <ul className="palette-help">
            <li>도형 가장자리의 점을 끌어 다른 도형에 놓으면 화살표가 생깁니다.</li>
            <li>도형을 더블클릭하면 글자를 고칠 수 있습니다.</li>
            <li>화살표를 더블클릭하면 예 → 아니오 → 없음 순으로 바뀝니다.</li>
            <li>선택 후 Delete 키로 지웁니다.</li>
          </ul>
        </aside>

        <div className="flow-canvas" ref={flowRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeDoubleClick={(_, edge) =>
              setEdges((es) =>
                es.map((e) => {
                  if (e.id !== edge.id) return e;
                  const i = LABEL_CYCLE.indexOf(e.data?.label);
                  return { ...e, data: { ...e.data, label: LABEL_CYCLE[(i + 1) % LABEL_CYCLE.length] } };
                }),
              )
            }
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Delete', 'Backspace']}
            snapToGrid
            snapGrid={[10, 10]}
            defaultEdgeOptions={{ type: 'arrow', markerEnd: ARROW_MARKER }}
            zoomOnDoubleClick={false}
            minZoom={0.2}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {!nodes.length && (
            <div className="empty-hint">
              왼쪽에서 도형을 골라 순서도를 그려 보세요.
              <br />
              또는 <a href="#/convert">의사코드 → 순서도</a>에서 만든 순서도를 가져올 수 있습니다.
            </div>
          )}
        </div>
      </div>

      <div className={`status ${issues.length ? 'status-warn' : 'status-ok'}`}>
        {issues.length ? (
          <details>
            <summary>점검 결과 {issues.length}건 확인이 필요합니다</summary>
            <ul>
              {issues.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </details>
        ) : nodes.length ? (
          '✔ 점검 결과 문제가 없습니다.'
        ) : (
          '빈 순서도입니다.'
        )}
      </div>
    </div>
  );
}

export function EditorPage(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

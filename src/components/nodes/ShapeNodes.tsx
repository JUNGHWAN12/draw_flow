import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { ShapeData, ShapeNode } from '../flowTypes';
import { nodeSize } from '../../core/shapes';
import type { NodeKind } from '../../core/types';

const HANDLES: { id: string; pos: Position }[] = [
  { id: 't', pos: Position.Top },
  { id: 'r', pos: Position.Right },
  { id: 'b', pos: Position.Bottom },
  { id: 'l', pos: Position.Left },
];

function Handles() {
  return (
    <>
      {HANDLES.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={h.pos} className="shape-handle" />
      ))}
    </>
  );
}

/** 더블클릭으로 글자를 고치는 라벨 (편집기 전용) */
function Label({ id, kind, data }: { id: string; kind: NodeKind; data: ShapeData }) {
  const { updateNode } = useReactFlow<ShapeNode>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const label = draft.trim() || data.label;
    if (label !== data.label) {
      updateNode(id, (n) => ({ data: { ...n.data, label }, ...nodeSize(kind, label) }));
    }
  };

  if (editing) {
    return (
      <input
        ref={ref}
        className="shape-input nodrag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(data.label);
            setEditing(false);
          }
          e.stopPropagation();
        }}
      />
    );
  }
  return (
    <span
      className="shape-label"
      onDoubleClick={
        data.editable
          ? () => {
              setDraft(data.label);
              setEditing(true);
            }
          : undefined
      }
    >
      {data.label}
    </span>
  );
}

function classes(kind: string, p: NodeProps<ShapeNode>) {
  return `shape shape-${kind}${p.data.highlight ? ' is-highlight' : ''}${p.selected ? ' is-selected' : ''}`;
}

export function TerminalNode(p: NodeProps<ShapeNode>) {
  return (
    <div className={classes('terminal', p)}>
      <Handles />
      <Label id={p.id} kind="terminal" data={p.data} />
    </div>
  );
}

export function ProcessNode(p: NodeProps<ShapeNode>) {
  return (
    <div className={classes('process', p)}>
      <Handles />
      <Label id={p.id} kind="process" data={p.data} />
    </div>
  );
}

export function DecisionNode(p: NodeProps<ShapeNode>) {
  return (
    <div className={classes('decision', p)}>
      <svg className="decision-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {/* 이미지 내보내기에서도 색이 유지되도록 CSS가 아닌 속성으로 색을 지정한다 */}
        <polygon
          points="50,1 99,50 50,99 1,50"
          vectorEffect="non-scaling-stroke"
          fill="#fef3c7"
          stroke={p.selected ? '#2563eb' : '#b45309'}
          strokeWidth={p.selected ? 3 : 2}
        />
      </svg>
      <Handles />
      <Label id={p.id} kind="decision" data={p.data} />
    </div>
  );
}

export const nodeTypes = {
  terminal: TerminalNode,
  process: ProcessNode,
  decision: DecisionNode,
};

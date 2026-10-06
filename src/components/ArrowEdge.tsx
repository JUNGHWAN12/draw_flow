import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';
import type { ArrowEdge as ArrowEdgeType } from './flowTypes';

/**
 * 화살표: 자동 배치 경로(points)가 있으면 그대로 그리고,
 * 없으면(편집기에서 도형을 옮긴 경우) 직각 꺾은선으로 그린다.
 */
export function ArrowEdge(p: EdgeProps<ArrowEdgeType>) {
  const pts = p.data?.points;
  let path: string;
  if (pts && pts.length >= 2) {
    path = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x},${pt.y}`).join(' ');
  } else {
    [path] = getSmoothStepPath({
      sourceX: p.sourceX,
      sourceY: p.sourceY,
      sourcePosition: p.sourcePosition,
      targetX: p.targetX,
      targetY: p.targetY,
      targetPosition: p.targetPosition,
      borderRadius: 0,
      offset: 18,
    });
  }

  // 라벨은 출발점 바로 옆에 둔다 (예/아니오가 어느 갈래인지 분명하게)
  const sx = pts?.[0]?.x ?? p.sourceX;
  const sy = pts?.[0]?.y ?? p.sourceY;
  const side = p.sourcePosition;
  const dx = side === Position.Right ? 8 : side === Position.Left ? -8 : 6;
  const dy = side === Position.Bottom ? 6 : side === Position.Top ? -22 : -20;
  const anchor = side === Position.Left ? 'translate(-100%, 0)' : 'translate(0, 0)';

  return (
    <>
      <BaseEdge
        id={p.id}
        path={path}
        markerEnd={p.markerEnd}
        // 이미지 내보내기에서도 선이 보이도록 색을 직접 지정한다
        style={{
          stroke: p.selected ? '#2563eb' : '#334155',
          strokeWidth: p.selected ? 'calc(var(--edge-w, 2px) + 0.5px)' : 'var(--edge-w, 2px)',
        }}
        interactionWidth={16}
      />
      {p.data?.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label edge-label-${p.data.label === '예' ? 'yes' : 'no'}`}
            style={{ transform: `${anchor} translate(${sx + dx}px, ${sy + dy}px)` }}
          >
            {p.data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { arrow: ArrowEdge };

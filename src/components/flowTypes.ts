// React Flow ⇄ draw_flow 그래프 변환

import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { EdgeLabel, FlowEdge, FlowGraph, FlowNode, NodeKind, Point, Side } from '../core/types';

export interface ShapeData extends Record<string, unknown> {
  label: string;
  line?: number;
  highlight?: boolean;
  editable?: boolean;
  /** 역변환/자동 정렬에서 문제가 된 도형 */
  error?: boolean;
  /** 값이 바뀌면 글자 편집을 시작한다 (터치 화면의 '글자 고치기' 버튼) */
  editRequest?: number;
  /** 단계별 실행에서 지금 실행 중인 도형 */
  current?: boolean;
}

export interface ArrowData extends Record<string, unknown> {
  label?: EdgeLabel;
  points?: Point[];
}

export type ShapeNode = Node<ShapeData, NodeKind>;
export type ArrowEdge = Edge<ArrowData, 'arrow'>;

export const ARROW_MARKER = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#334155' };

export function toRfNodes(nodes: FlowNode[], editable = false): ShapeNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    data: { label: n.label, line: n.line, editable },
  }));
}

export function toRfEdges(edges: FlowEdge[], keepPoints = true): ArrowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    type: 'arrow',
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    markerEnd: ARROW_MARKER,
    data: { label: e.label, points: keepPoints ? e.points : undefined },
  }));
}

export function fromRf(nodes: ShapeNode[], edges: ArrowEdge[]): FlowGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.type as NodeKind,
      label: n.data.label,
      line: n.data.line,
      x: n.position.x,
      y: n.position.y,
      width: n.width ?? n.measured?.width ?? 120,
      height: n.height ?? n.measured?.height ?? 44,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: (e.sourceHandle ?? 'b') as Side,
      targetHandle: (e.targetHandle ?? 't') as Side,
      label: e.data?.label,
      points: e.data?.points,
    })),
  };
}

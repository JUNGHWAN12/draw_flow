// 순서도 데이터 형식 — 터미널·처리·판단 도형 + 화살표만 사용한다.

export type NodeKind = 'terminal' | 'process' | 'decision';

/** 도형의 연결 지점 (위/오른쪽/아래/왼쪽) */
export type Side = 't' | 'r' | 'b' | 'l';

export type EdgeLabel = '예' | '아니오';

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** 의사코드 줄 번호 (연결 강조용) */
  line?: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: Side;
  targetHandle: Side;
  label?: EdgeLabel;
  /** 자동 배치가 계산한 꺾은선 경로 (시작점 ~ 끝점) */
  points?: Point[];
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowDocument extends FlowGraph {
  app: 'draw_flow';
  version: 1;
  title: string;
  pseudocode?: string;
}

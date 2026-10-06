import { useEffect, useMemo } from 'react';
import { Background, ConnectionMode, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import type { FlowGraph } from '../core/types';
import { nodeTypes } from './nodes/ShapeNodes';
import { edgeTypes } from './ArrowEdge';
import { toRfEdges, toRfNodes } from './flowTypes';

/** 보기 전용 순서도 (문제 화면에서 정답 순서도·미리보기용) */
function Inner({ graph }: { graph: FlowGraph }) {
  const nodes = useMemo(() => toRfNodes(graph.nodes), [graph]);
  const edges = useMemo(() => toRfEdges(graph.edges), [graph]);
  const { fitView } = useReactFlow();
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitView({ padding: 0.06, maxZoom: 1.1 }));
    return () => cancelAnimationFrame(raf);
  }, [graph, fitView]);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
      className="readonly"
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function FlowView({ graph }: { graph: FlowGraph }) {
  return (
    <div className="flow-view">
      <ReactFlowProvider>
        <Inner graph={graph} />
      </ReactFlowProvider>
    </div>
  );
}

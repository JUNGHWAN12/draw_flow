// draw.io(diagrams.net)에서 열 수 있는 .drawio 파일 만들기

import type { FlowGraph, Side } from '../core/types';

const STYLE = {
  terminal: 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#e0f2fe;strokeColor=#0369a1;',
  process: 'rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#334155;',
  decision: 'rhombus;whiteSpace=wrap;html=1;fillColor=#fef3c7;strokeColor=#b45309;',
};

const ANCHOR: Record<Side, [number, number]> = { t: [0.5, 0], r: [1, 0.5], b: [0.5, 1], l: [0, 0.5] };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toDrawio(graph: FlowGraph, title = '순서도'): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const n of graph.nodes) {
    // draw.io의 html=1 라벨은 HTML로 해석되므로 한 번 더 이스케이프한다
    cells.push(
      `<mxCell id="${esc(n.id)}" value="${esc(esc(n.label))}" style="${STYLE[n.kind]}" vertex="1" parent="1">` +
        `<mxGeometry x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" as="geometry"/></mxCell>`,
    );
  }
  for (const e of graph.edges) {
    const [ex, ey] = ANCHOR[e.sourceHandle];
    const [nx, ny] = ANCHOR[e.targetHandle];
    const style =
      'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;strokeColor=#334155;' +
      `exitX=${ex};exitY=${ey};exitDx=0;exitDy=0;entryX=${nx};entryY=${ny};entryDx=0;entryDy=0;`;
    const bends = (e.points ?? []).slice(1, -1);
    const pts = bends.length
      ? `<Array as="points">${bends.map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join('')}</Array>`
      : '';
    cells.push(
      `<mxCell id="${esc(e.id)}" value="${esc(e.label ?? '')}" style="${style}" edge="1" parent="1" source="${esc(e.source)}" target="${esc(e.target)}">` +
        `<mxGeometry relative="1" as="geometry">${pts}</mxGeometry></mxCell>`,
    );
  }
  return (
    `<mxfile host="draw_flow"><diagram name="${esc(title)}">` +
    `<mxGraphModel grid="1" gridSize="10" guides="1" connect="1" arrows="1" page="0"><root>` +
    cells.join('') +
    '</root></mxGraphModel></diagram></mxfile>'
  );
}

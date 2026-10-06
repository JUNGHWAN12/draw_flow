// 순서도를 PNG/SVG 이미지로 내보내기

import { toPng, toSvg } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';

// 되돌아가는 화살표가 도형 바깥으로 나가므로 여백을 넉넉히 둔다
const PADDING = 48;

export async function exportImage(container: HTMLElement, nodes: Node[], format: 'png' | 'svg'): Promise<string> {
  const viewport = container.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || !nodes.length) throw new Error('내보낼 순서도가 없습니다.');
  const bounds = getNodesBounds(nodes);
  const width = Math.ceil(bounds.width + PADDING * 2);
  const height = Math.ceil(bounds.height + PADDING * 2);
  const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
  const options = {
    backgroundColor: '#ffffff',
    width,
    height,
    pixelRatio: 2,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
    filter: (el: Node | HTMLElement) =>
      !(el instanceof HTMLElement && el.classList?.contains('react-flow__handle')),
  };
  // 선택 표시는 그림에 넣지 않는다
  container.classList.add('is-exporting');
  try {
    return await (format === 'png' ? toPng(viewport, options) : toSvg(viewport, options));
  } finally {
    container.classList.remove('is-exporting');
  }
}

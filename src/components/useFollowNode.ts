import { useEffect, type RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';

/** 단계별 실행 중인 도형이 화면 밖에 있으면 그 도형으로 화면을 옮긴다 */
export function useFollowNode(nodeId: string | null, container: RefObject<HTMLElement | null>) {
  const { getNode, getViewport, setCenter } = useReactFlow();
  useEffect(() => {
    if (!nodeId || !container.current) return;
    const n = getNode(nodeId);
    if (!n) return;
    const { x, y, zoom } = getViewport();
    const w = n.width ?? n.measured?.width ?? 0;
    const h = n.height ?? n.measured?.height ?? 0;
    const rect = container.current.getBoundingClientRect();
    const left = n.position.x * zoom + x;
    const top = n.position.y * zoom + y;
    const margin = 40;
    if (left < margin || top < margin || left + w * zoom > rect.width - margin || top + h * zoom > rect.height - margin) {
      setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom, duration: 250 });
    }
  }, [nodeId, container, getNode, getViewport, setCenter]);
}

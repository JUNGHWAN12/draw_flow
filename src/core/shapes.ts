// 도형 크기 계산 (글자 수에 맞춰 도형 폭을 정한다)

import type { NodeKind } from './types';

/** 대략적인 글자 폭 (14px 고정폭 글꼴 기준, 한글은 넓게) */
export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) < 0x100 ? 8.6 : 14.5;
  return w;
}

export function nodeSize(kind: NodeKind, label: string): { width: number; height: number } {
  const tw = textWidth(label);
  switch (kind) {
    case 'terminal':
      return { width: Math.max(96, Math.ceil(tw + 48)), height: 40 };
    case 'process':
      return { width: Math.min(380, Math.max(110, Math.ceil(tw + 40))), height: 44 };
    case 'decision':
      return { width: Math.min(420, Math.max(130, Math.round(tw * 1.5 + 40))), height: 72 };
  }
}

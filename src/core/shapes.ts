// 도형 크기 계산 (글자 수에 맞춰 도형 폭을 정하고, 너무 길면 여러 줄로 높인다)

import type { NodeKind } from './types';

/** 도형 안 글자 한 줄의 높이 (styles.css의 .shape-label line-height와 맞춘다) */
export const LABEL_LINE = 18;

/** 한 줄에 넣을 최대 글자 폭 */
const MAX_TEXT = { process: 300, decision: 220 } as const;

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
    case 'process': {
      const lines = Math.ceil(tw / MAX_TEXT.process) || 1;
      return {
        width: Math.max(110, Math.ceil(Math.min(tw, MAX_TEXT.process) + 40)),
        height: 44 + (lines - 1) * LABEL_LINE,
      };
    }
    case 'decision': {
      // 마름모 안에 글자가 들어가려면 (글자 폭 / 도형 폭) + (글자 높이 / 도형 높이) ≤ 1
      const lines = Math.ceil(tw / MAX_TEXT.decision) || 1;
      return {
        width: Math.max(130, Math.round(Math.min(tw, MAX_TEXT.decision) * 1.5 + 40)),
        height: Math.max(72, Math.ceil((lines * LABEL_LINE) / 0.36)),
      };
    }
  }
}

// 파일 내려받기 / 불러오기

import type { FlowDocument, FlowGraph } from '../core/types';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function toDocument(graph: FlowGraph, title: string, pseudocode?: string): FlowDocument {
  return { app: 'draw_flow', version: 1, title, pseudocode, nodes: graph.nodes, edges: graph.edges };
}

export function parseDocument(text: string): FlowDocument {
  const doc = JSON.parse(text) as Partial<FlowDocument>;
  if (doc.app !== 'draw_flow' || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new Error('draw_flow 순서도 파일(.json)이 아닙니다.');
  }
  return doc as FlowDocument;
}

/** 파일 선택 창을 열고 선택한 파일의 내용을 돌려준다 */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.click();
  });
}

export function safeFilename(title: string): string {
  return (title.trim() || '순서도').replace(/[\\/:*?"<>|]/g, '_');
}

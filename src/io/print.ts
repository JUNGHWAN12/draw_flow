// 인쇄 / PDF 저장 — 숨긴 iframe에 A4 인쇄용 페이지를 만들어 인쇄 창을 연다.
// (브라우저 인쇄 창에서 "PDF로 저장"을 고르면 PDF 파일이 된다)

/** 무엇을 인쇄할지 */
export type PrintLayout =
  | 'chart' // 순서도만
  | 'both' // 의사코드 + 순서도
  | 'code-blank' // 학습지: 의사코드 + 순서도를 그릴 빈 칸
  | 'chart-lines'; // 학습지: 순서도 + 의사코드를 쓸 줄

export interface PrintOptions {
  title: string;
  layout: PrintLayout;
  /** 날짜·이름 칸 */
  header: boolean;
  orientation: 'portrait' | 'landscape';
}

export const LAYOUTS: { layout: PrintLayout; name: string; needsCode: boolean }[] = [
  { layout: 'chart', name: '순서도만', needsCode: false },
  { layout: 'both', name: '의사코드 + 순서도', needsCode: true },
  { layout: 'code-blank', name: '학습지: 의사코드 보고 순서도 그리기', needsCode: true },
  { layout: 'chart-lines', name: '학습지: 순서도 보고 의사코드 쓰기', needsCode: false },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 인쇄용 HTML (테스트에서도 확인할 수 있게 따로 만든다) */
export function printHtml(opts: PrintOptions & { image: string; code?: string }): string {
  const landscape = opts.orientation === 'landscape';
  // A4: 210 × 297mm, 여백 12mm, 머리글 약 20mm
  const bodyH = (landscape ? 210 : 297) - 24 - (opts.header || opts.title ? 22 : 0);
  const date = new Date().toLocaleDateString('ko-KR');
  const code = opts.code ?? '';

  const chart = `<div class="chart"><img src="${opts.image}" alt="순서도"></div>`;
  const codeBox = `<pre class="code">${esc(code)}</pre>`;
  let main: string;
  switch (opts.layout) {
    case 'chart':
      main = chart;
      break;
    case 'both':
      main = codeBox + chart;
      break;
    case 'code-blank':
      main = codeBox + '<div class="blank"><span>여기에 순서도를 그리세요.</span></div>';
      break;
    case 'chart-lines':
      main = chart + '<div class="lines"><span>의사코드를 쓰세요.</span></div>';
      break;
  }

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(opts.title || '순서도')}</title>
<style>
  @page { size: A4 ${opts.orientation}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #0f172a; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 8mm; border-bottom: 1.5px solid #0f172a; padding-bottom: 4mm; margin-bottom: 5mm; }
  h1 { font-size: 16pt; margin: 0; }
  .meta { font-size: 10pt; color: #475569; white-space: nowrap; }
  .meta span { display: inline-block; min-width: 40mm; border-bottom: 1px solid #94a3b8; margin-left: 2mm; }
  main { display: flex; gap: 6mm; align-items: stretch; height: ${bodyH}mm; }
  .code { flex: 0 0 38%; margin: 0; padding: 3mm; border: 1px solid #cbd5e1; border-radius: 2mm; font: 10pt/1.55 'D2Coding', Consolas, monospace; white-space: pre-wrap; word-break: break-all; overflow: hidden; align-self: flex-start; max-height: 100%; }
  .chart { flex: 1; display: flex; justify-content: center; align-items: flex-start; min-width: 0; }
  .chart:only-child img { margin: 0 auto; }
  img { max-width: 100%; max-height: ${bodyH}mm; object-fit: contain; }
  .blank, .lines { flex: 1; position: relative; border: 1px solid #94a3b8; border-radius: 2mm; }
  .blank span, .lines span { position: absolute; top: 2mm; left: 3mm; font-size: 9pt; color: #94a3b8; }
  .lines { flex: 0 0 42%; background: repeating-linear-gradient(to bottom, transparent 0, transparent 9mm, #cbd5e1 9mm, #cbd5e1 calc(9mm + 1px)); background-position: 0 6mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
${opts.title || opts.header ? `<header><h1>${esc(opts.title)}</h1>${opts.header ? `<div class="meta">${date} · 이름<span></span></div>` : ''}</header>` : ''}
<main>${main}</main>
</body></html>`;
}

export function printFlowchart(opts: PrintOptions & { image: string; code?: string }) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(printHtml(opts));
  doc.close();
  const img = doc.querySelector('img');
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (!img || img.complete) go();
  else img.onload = go;
}

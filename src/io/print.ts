// 인쇄 / PDF 저장 — 숨긴 iframe에 A4 한 장짜리 인쇄용 페이지를 만들어 인쇄 창을 연다.
// (브라우저 인쇄 창에서 "PDF로 저장"을 고르면 PDF 파일이 된다)

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function printFlowchart(opts: { title: string; image: string; code?: string }) {
  const date = new Date().toLocaleDateString('ko-KR');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #0f172a; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #0f172a; padding-bottom: 4mm; margin-bottom: 5mm; }
  h1 { font-size: 16pt; margin: 0; }
  .meta { font-size: 10pt; color: #475569; }
  .meta span { display: inline-block; min-width: 40mm; border-bottom: 1px solid #94a3b8; margin-left: 2mm; }
  main { display: flex; gap: 6mm; align-items: flex-start; }
  pre { flex: 0 0 38%; margin: 0; padding: 3mm; border: 1px solid #cbd5e1; border-radius: 2mm; font: 9.5pt/1.5 'D2Coding', Consolas, monospace; white-space: pre-wrap; word-break: break-all; }
  .chart { flex: 1; display: flex; justify-content: center; }
  img { max-width: 100%; max-height: 245mm; object-fit: contain; }
</style></head><body>
<header><h1>${esc(opts.title)}</h1><div class="meta">${date} · 이름<span></span></div></header>
<main>${opts.code ? `<pre>${esc(opts.code)}</pre>` : ''}<div class="chart"><img src="${opts.image}" alt="순서도"></div></main>
</body></html>`;

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const img = doc.querySelector('img')!;
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (img.complete) go();
  else img.onload = go;
}

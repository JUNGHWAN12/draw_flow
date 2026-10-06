import { describe, expect, it } from 'vitest';
import { printHtml, type PrintLayout } from '../src/io/print';

const base = { title: '합계 <연습>', header: true, orientation: 'portrait' as const, image: 'data:image/png;base64,AAAA', code: 'if a < b:\n    print(a)' };

describe('인쇄용 페이지', () => {
  it.each<[PrintLayout, string[], string[]]>([
    ['chart', ['class="chart"'], ['class="code"', 'class="blank"', 'class="lines"']],
    ['both', ['class="code"', 'class="chart"'], ['class="blank"']],
    ['code-blank', ['class="code"', 'class="blank"', '순서도를 그리세요'], ['<img']],
    ['chart-lines', ['class="chart"', 'class="lines"', '의사코드를 쓰세요'], ['class="code"']],
  ])('%s', (layout, has, hasNot) => {
    const html = printHtml({ ...base, layout });
    for (const h of has) expect(html).toContain(h);
    for (const h of hasNot) expect(html).not.toContain(h);
  });

  it('제목과 코드는 HTML로 해석되지 않게 바꾼다', () => {
    const html = printHtml({ ...base, layout: 'both' });
    expect(html).toContain('합계 &lt;연습&gt;');
    expect(html).toContain('if a &lt; b:');
  });

  it('이름 칸과 용지 방향', () => {
    expect(printHtml({ ...base, layout: 'chart', header: false })).not.toContain('이름');
    expect(printHtml({ ...base, layout: 'chart', orientation: 'landscape' })).toContain('size: A4 landscape');
  });
});

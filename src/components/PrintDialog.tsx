import { useEffect, useState } from 'react';
import { LAYOUTS, printFlowchart, type PrintOptions } from '../io/print';
import { load, save } from '../io/storage';

interface Props {
  defaultTitle: string;
  /** 함께 인쇄할 의사코드. 만들 수 없으면 그 이유 */
  code: { ok: true; text: string } | { ok: false; reason: string };
  /** 순서도 그림 (PNG data URL) */
  getImage: () => Promise<string>;
  onClose: () => void;
}

type Saved = Omit<PrintOptions, 'title'>;
const DEFAULTS: Saved = { layout: 'both', header: true, orientation: 'portrait' };

/** 인쇄 옵션 창 */
export function PrintDialog({ defaultTitle, code, getImage, onClose }: Props) {
  const [opts, setOpts] = useState<Saved>(() => ({ ...DEFAULTS, ...load<Partial<Saved>>('printOptions', {}) }));
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const layoutOk = (l: (typeof LAYOUTS)[number]) => !l.needsCode || code.ok;
  const layout = LAYOUTS.find((l) => l.layout === opts.layout && layoutOk(l)) ? opts.layout : 'chart';

  useEffect(() => save('printOptions', opts), [opts]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const print = async () => {
    setBusy(true);
    try {
      printFlowchart({ ...opts, layout, title, image: await getImage(), code: code.ok ? code.text : undefined });
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="인쇄 옵션">
        <header>
          <b>인쇄 / PDF</b>
          <button className="close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <fieldset>
            <legend>인쇄할 내용</legend>
            {LAYOUTS.map((l) => (
              <label key={l.layout} className={`radio${layoutOk(l) ? '' : ' is-disabled'}`}>
                <input
                  type="radio"
                  name="print-layout"
                  checked={layout === l.layout}
                  disabled={!layoutOk(l)}
                  onChange={() => setOpts((o) => ({ ...o, layout: l.layout }))}
                />
                <span className={`layout-icon layout-${l.layout}`} aria-hidden />
                {l.name}
              </label>
            ))}
            {!code.ok && <p className="muted small">의사코드를 함께 인쇄할 수 없습니다: {code.reason}</p>}
          </fieldset>

          <fieldset>
            <legend>용지</legend>
            <label className="radio">
              <input
                type="radio"
                name="print-orientation"
                checked={opts.orientation === 'portrait'}
                onChange={() => setOpts((o) => ({ ...o, orientation: 'portrait' }))}
              />
              A4 세로
            </label>
            <label className="radio">
              <input
                type="radio"
                name="print-orientation"
                checked={opts.orientation === 'landscape'}
                onChange={() => setOpts((o) => ({ ...o, orientation: 'landscape' }))}
              />
              A4 가로 (순서도가 넓을 때)
            </label>
          </fieldset>

          <label className="radio">
            <input type="checkbox" checked={opts.header} onChange={(e) => setOpts((o) => ({ ...o, header: e.target.checked }))} />
            날짜·이름 칸 넣기
          </label>
          <p className="muted small">인쇄 창에서 '대상'을 'PDF로 저장'으로 고르면 PDF 파일이 됩니다.</p>
        </div>
        <footer>
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={print} disabled={busy}>
            {busy ? '준비 중…' : '인쇄'}
          </button>
        </footer>
      </div>
    </div>
  );
}

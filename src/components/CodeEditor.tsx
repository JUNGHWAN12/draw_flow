import { useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  errorLines: Set<number>;
  highlightLine: number | null;
  onHoverLine: (line: number | null) => void;
}

const INDENT = '    ';
const PAD_TOP = 10;

/** 브라우저 실행 취소(Ctrl+Z)가 유지되도록 execCommand로 글자를 넣는다 */
function insertText(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * 파이썬식 의사코드 입력창
 * - 줄 번호, 오류 줄/강조 줄 배경 표시
 * - Tab → 공백 4칸, Shift+Tab → 내어쓰기, 콜론 뒤 Enter → 자동 들여쓰기
 */
export function CodeEditor({ value, onChange, errorLines, highlightLine, onHoverLine }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const lines = value.split('\n');

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: end } = el;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        const lead = value.slice(lineStart).match(/^ {1,4}|^\t/)?.[0];
        if (lead) {
          el.setSelectionRange(lineStart, lineStart + lead.length);
          insertText(el, '');
          const pos = Math.max(lineStart, s - lead.length);
          el.setSelectionRange(pos, Math.max(pos, end - lead.length));
        }
      } else if (s !== end && value.slice(s, end).includes('\n')) {
        // 여러 줄 선택 → 모두 들여쓰기
        const block = value.slice(lineStart, end);
        el.setSelectionRange(lineStart, end);
        insertText(el, block.replace(/^/gm, INDENT));
      } else {
        insertText(el, INDENT);
      }
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const cur = value.slice(lineStart, s);
      let indent = cur.match(/^[ \t]*/)![0];
      if (/:\s*(#.*)?$/.test(cur)) indent += INDENT;
      insertText(el, '\n' + indent);
    } else if (e.key === 'Backspace' && s === end && s > lineStart) {
      const before = value.slice(lineStart, s);
      if (/^ +$/.test(before)) {
        e.preventDefault();
        const remove = before.length % 4 || 4;
        el.setSelectionRange(s - remove, s);
        insertText(el, '');
      }
    }
  };

  const lineAt = (clientY: number): number | null => {
    const el = ta.current;
    if (!el) return null;
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop - PAD_TOP;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const n = Math.floor(y / lineHeight) + 1;
    return n >= 1 && n <= lines.length ? n : null;
  };

  return (
    <div className="code-editor">
      <div className="code-gutter" aria-hidden>
        <div style={{ transform: `translateY(${-scroll.top}px)` }}>
          {lines.map((_, i) => (
            <div key={i} className={errorLines.has(i + 1) ? 'is-error' : highlightLine === i + 1 ? 'is-highlight' : ''}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      <div className="code-area">
        <div className="code-backdrop" aria-hidden>
          <div style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>
            {lines.map((_, i) => (
              <div
                key={i}
                className={errorLines.has(i + 1) ? 'is-error' : highlightLine === i + 1 ? 'is-highlight' : ''}
              />
            ))}
          </div>
        </div>
        <textarea
          ref={ta}
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label="의사코드 입력"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
          onMouseMove={(e) => onHoverLine(lineAt(e.clientY))}
          onMouseLeave={() => onHoverLine(null)}
        />
      </div>
    </div>
  );
}

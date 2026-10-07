import { useCallback, useEffect, useState } from 'react';
import { ConverterPage } from './pages/ConverterPage';
import { EditorPage } from './pages/EditorPage';
import { HelpPage } from './pages/HelpPage';
import { ProblemPage } from './pages/ProblemPage';
import type { FlowDocument } from './core/types';
import { EXAMPLES } from './examples';
import { load, save } from './io/storage';
import { toDocument } from './io/files';

type Route = 'convert' | 'editor' | 'problem' | 'help';

const TABS: { route: Route; name: string }[] = [
  { route: 'convert', name: '의사코드 → 순서도' },
  { route: 'editor', name: '순서도 편집기' },
  { route: 'problem', name: '문제' },
  { route: 'help', name: '도움말 · 예제' },
];

// GitHub Pages에서 새로고침해도 404가 나지 않도록 해시 주소(#/editor)를 쓴다
function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  return TABS.some((t) => t.route === r) ? (r as Route) : 'convert';
}

/** #/problem?d=… 의 d 값 (학생용 문제 링크) */
function readProblem(): string | null {
  return new URLSearchParams(location.hash.split('?')[1] ?? '').get('d');
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [problemData, setProblemData] = useState<string | null>(readProblem);
  const [code, setCode] = useState<string>(() => load('code', EXAMPLES[1].code));
  const [incoming, setIncoming] = useState<FlowDocument | null>(null);
  const [projector, setProjector] = useState<boolean>(() => load('projector', false));

  useEffect(() => save('projector', projector), [projector]);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setProblemData(readProblem());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => save('code', code), 300);
    return () => clearTimeout(t);
  }, [code]);

  const go = (r: Route) => {
    location.hash = `/${r}`;
  };

  const clearIncoming = useCallback(() => setIncoming(null), []);

  return (
    <div className={`app${projector ? ' projector' : ''}`}>
      <header className="app-header">
        <h1>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
          draw_flow
        </h1>
        <nav>
          {TABS.map((t) => (
            <a key={t.route} href={`#/${t.route}`} className={route === t.route ? 'active' : ''}>
              {t.name}
            </a>
          ))}
        </nav>
        <span className="header-spacer" />
        <label className="toggle" title="교실 프로젝터용: 글자와 선을 크고 진하게 표시합니다">
          <input type="checkbox" checked={projector} onChange={(e) => setProjector(e.target.checked)} />
          크게 보기
        </label>
      </header>
      <main>
        {route === 'convert' && (
          <ConverterPage
            code={code}
            onCodeChange={setCode}
            onSendToEditor={(graph, pseudocode) => {
              setIncoming(toDocument(graph, '의사코드 순서도', pseudocode));
              go('editor');
            }}
          />
        )}
        {route === 'editor' && (
          <EditorPage
            incoming={incoming}
            onIncomingConsumed={clearIncoming}
            onOpenCode={(c) => {
              if (code.trim() && c !== code && !confirm('의사코드 화면의 내용을 이 코드로 바꿀까요?')) return;
              setCode(c);
              go('convert');
            }}
          />
        )}
        {route === 'problem' && <ProblemPage key={problemData ?? 'author'} encoded={problemData} />}
        {route === 'help' && (
          <HelpPage
            onOpenExample={(c) => {
              setCode(c);
              go('convert');
            }}
          />
        )}
      </main>
      <footer className="app-footer">ⓒjunghwan with claude</footer>
    </div>
  );
}

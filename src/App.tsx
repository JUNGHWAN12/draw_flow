import { useCallback, useEffect, useState } from 'react';
import { ConverterPage } from './pages/ConverterPage';
import { EditorPage } from './pages/EditorPage';
import { HelpPage } from './pages/HelpPage';
import type { FlowDocument } from './core/types';
import { EXAMPLES } from './examples';
import { load, save } from './io/storage';
import { toDocument } from './io/files';

type Route = 'convert' | 'editor' | 'help';

const TABS: { route: Route; name: string }[] = [
  { route: 'convert', name: '의사코드 → 순서도' },
  { route: 'editor', name: '순서도 편집기' },
  { route: 'help', name: '도움말 · 예제' },
];

// GitHub Pages에서 새로고침해도 404가 나지 않도록 해시 주소(#/editor)를 쓴다
function readRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '');
  return TABS.some((t) => t.route === r) ? (r as Route) : 'convert';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [code, setCode] = useState<string>(() => load('code', EXAMPLES[1].code));
  const [incoming, setIncoming] = useState<FlowDocument | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
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
    <div className="app">
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
        {route === 'editor' && <EditorPage incoming={incoming} onIncomingConsumed={clearIncoming} />}
        {route === 'help' && (
          <HelpPage
            onOpenExample={(c) => {
              setCode(c);
              go('convert');
            }}
          />
        )}
      </main>
    </div>
  );
}

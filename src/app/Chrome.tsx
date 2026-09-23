import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { PARTY_NAME } from '../core/content';

export type Tab = { id: string; label: string };

/**
 * Bottom tabs on a phone, a single row of tabs under the masthead on a laptop.
 * They are links rather than buttons because they change what the page is about.
 */
export function Chrome({
  tabs,
  active,
  onNavigate,
  banner,
  children,
}: {
  tabs: Tab[];
  active: string;
  onNavigate: (id: string) => void;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const strip = useRef<HTMLUListElement>(null);

  // Nine tabs do not fit on a 390px phone, so the strip scrolls. Anything that
  // changes the tab from elsewhere (the Today screen does) has to bring the new
  // tab into view, or the nav silently lies about where you are.
  useEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    });
  }, [active]);

  return (
    <div className="shell">
      <header className="masthead">
        <p className="masthead-mark" aria-hidden="true">
          GG
        </p>
        <h1>{PARTY_NAME}</h1>
      </header>

      {banner}

      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>

      <nav className="tabs" aria-label="Sections">
        <ul ref={strip}>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <a
                href={`#${tab.id}`}
                aria-current={tab.id === active ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(tab.id);
                }}
              >
                {tab.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

import type { ReactNode } from 'react';
import { PARTY_NAME } from '../core/content';

export type Tab = { id: string; label: string };

/**
 * Bottom tabs on a phone, a single row of tabs under the masthead on a laptop.
 * They are links rather than buttons because they change what the page is about.
 *
 * Six tabs is the most a 390px phone holds without scrolling, so the seventh
 * place, You, lives in the masthead as the name of whoever holds the phone.
 * That is also where you look to answer "who am I playing as right now".
 */
export function Chrome({
  tabs,
  active,
  onNavigate,
  holder,
  banner,
  children,
}: {
  tabs: Tab[];
  active: string;
  onNavigate: (id: string) => void;
  holder: { name: string; color: string };
  banner?: ReactNode;
  children: ReactNode;
}) {
  const link = (id: string) => ({
    href: `#${id}`,
    'aria-current': id === active ? ('page' as const) : undefined,
    onClick: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      onNavigate(id);
    },
  });

  return (
    <div className="shell">
      <header className="masthead">
        <p className="masthead-mark" aria-hidden="true">
          GG
        </p>
        <h1>{PARTY_NAME}</h1>
        <a className={`holder holder-${holder.color}`} aria-label={`You: ${holder.name}`} {...link('you')}>
          <span className="holder-dot" aria-hidden="true" />
          <span className="holder-name">{holder.name}</span>
        </a>
      </header>

      {banner}

      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>

      <nav className="tabs" aria-label="Sections">
        <ul>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <a {...link(tab.id)}>{tab.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

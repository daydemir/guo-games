import type { ReactNode } from 'react';

/**
 * The visual kit. Every screen is built from these five pieces, which is what
 * keeps a nine-screen app looking like one object: a trading card with a
 * printed band across the top and a hairline rule under the title.
 */

export function Card({
  band,
  title,
  note,
  tone = 'plain',
  children,
  footer,
}: {
  band?: ReactNode;
  title?: ReactNode;
  note?: ReactNode;
  tone?: 'plain' | 'live' | 'settled' | 'void';
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className={`card card-${tone}`}>
      {band ? <p className="card-band">{band}</p> : null}
      {title ? <h3 className="card-title">{title}</h3> : null}
      {note ? <p className="card-note">{note}</p> : null}
      {children}
      {footer ? <div className="card-foot">{footer}</div> : null}
    </article>
  );
}

export function Screen({ title, lede, children }: { title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="screen" aria-labelledby={`${slug(title)}-heading`}>
      <header className="screen-head">
        <h2 id={`${slug(title)}-heading`}>{title}</h2>
        {lede ? <p className="lede">{lede}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A short, monospaced tally. The only place the app nods at a betting board. */
export function Tally({ yes, no }: { yes: number; no: number }) {
  return (
    <p className="tally" aria-label={`${yes} for yes, ${no} for no`}>
      <span className="tally-yes">{yes} yes</span>
      <span aria-hidden="true"> / </span>
      <span className="tally-no">{no} no</span>
    </p>
  );
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

import { useState } from 'react';
import type { FormEvent } from 'react';
import { COLORS, GUARDRAILS, IDENTITIES, ORGANIZERS, PARTY_CODE, PARTY_NAME } from '../core/content';
import type { Color, Identity } from '../core/content';

/**
 * The whole setup cost of the product. Six of seven people will do this once,
 * on a beach, on someone else's phone, so the code is pre-filled and the only
 * required choice is who you are.
 */
export function JoinScreen({
  onJoin,
  problem,
}: {
  onJoin: (code: string, who: Identity, name: string, color: Color) => void;
  problem: string | null;
}) {
  // Prefilled: six of seven people will do this once, on a beach, on someone
  // else's phone. The field stays so the code is visible and can be corrected.
  const [code, setCode] = useState(PARTY_CODE);
  const [who, setWho] = useState<Identity>('Kevin');
  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('sea');

  function submit(event: FormEvent) {
    event.preventDefault();
    onJoin(code, who, name.trim() || who, color);
  }

  return (
    <main className="join" id="main">
      <header className="join-head">
        <p className="masthead-mark" aria-hidden="true">
          GG
        </p>
        <h1>{PARTY_NAME}</h1>
        <p className="lede">
          The rest of the weekend, lightly organized. A few calls, one quiet act, a fish under official
          investigation, and a long dinner where it all gets settled.
        </p>
      </header>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="code">Party code</label>
          <input
            id="code"
            name="code"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder={PARTY_CODE}
            onChange={(event) => setCode(event.target.value)}
          />
          <p className="hint">
            Filled in for you. This demo party is <strong>{PARTY_CODE}</strong>.
          </p>
        </div>

        <div className="field">
          <label htmlFor="who">Who are you</label>
          <select id="who" value={who} onChange={(event) => setWho(event.target.value as Identity)}>
            {IDENTITIES.map((identity) => (
              <option key={identity} value={identity}>
                {identity}
                {ORGANIZERS.includes(identity as never) ? ' (organizer)' : ''}
              </option>
            ))}
          </select>
          <p className="hint">
            Pick your own name. Spectator is a real choice too: watch the whole day and never pick a thing.
          </p>
        </div>

        <div className="field">
          <label htmlFor="name">Name on your cards</label>
          <input
            id="name"
            name="name"
            value={name}
            maxLength={24}
            autoComplete="off"
            placeholder={who}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <fieldset className="field">
          <legend>Your color</legend>
          <div className="swatches">
            {COLORS.map((option) => (
              <label key={option} className={`swatch swatch-${option}`}>
                <input
                  type="radio"
                  name="color"
                  value={option}
                  checked={color === option}
                  onChange={() => setColor(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {problem ? (
          <p className="alert" role="alert">
            {problem}
          </p>
        ) : null}

        <button className="primary" type="submit">
          Join the party
        </button>
      </form>

      <section className="card" aria-labelledby="guardrails-heading">
        <h2 id="guardrails-heading" className="card-title">
          How this stays fun
        </h2>
        <ul className="rules">
          {GUARDRAILS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <p className="fineprint">
        Everything you enter stays in this browser. Only the Wedding Markets leave this phone, shared with
        everyone on the party link. There is no account. Anyone holding this device can read anything saved on
        it, so treat it like a shared notebook.
      </p>
    </main>
  );
}

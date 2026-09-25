import { useEffect, useRef, useState } from 'react';
import { isReadOnly } from '../core/time';
import { useParty } from './useParty';
import { Chrome } from './Chrome';
import type { Tab } from './Chrome';
import { JoinScreen } from './JoinScreen';
import { Recovery } from './Recovery';
import { downloadText } from './download';
import { backupFilename } from '../core/backup';
import { Today } from './screens/Today';
import { Picks } from './screens/Picks';
import { Bounties } from './screens/Bounties';
import { Mission } from './screens/Mission';
import { Vault } from './screens/Vault';
import { Dinner } from './screens/Dinner';
import { You } from './screens/You';
import { Bench } from './Bench';
import { HOME, parseHash } from './route';

/** In the order the day runs. You is reached from the masthead. */
const TABS: Tab[] = [
  { id: 'today', label: 'Today' },
  { id: 'picks', label: 'Picks' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'mission', label: 'Mission' },
  { id: 'vault', label: 'Vault' },
  { id: 'dinner', label: 'Dinner' },
];

const clearHash = () => history.replaceState(null, '', `${location.pathname}${location.search}`);

/**
 * The whole app. State lives in one hook, rules live in core, and this file
 * only decides which screen is on and where messages go.
 */
export function App() {
  const party = useParty();
  // A link from the group chat, such as #card/exhibit-a, is read before join and
  // survives it, so whoever taps it lands where the memo pointed.
  const [route, setRoute] = useState(() => parseHash(location.hash) ?? HOME);
  const { tab, anchor } = route;
  const { state, problem, note, dismiss, run, signIn, reset, now, recovery, unsaved } = party;
  const locked = isReadOnly(state, now);

  // A message is about the thing you just did, so it should not follow you to
  // the next screen. It must not run on mount, though: that used to wipe the
  // "your save is unreadable" warning before anybody could read it.
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    dismiss();
  }, [tab, dismiss]);

  // Changing view swaps the whole page under the user. Without this, a keyboard
  // or screen reader lands back on <body> with nothing announced, which is the
  // single easiest way to make an app like this unusable without a mouse.
  const signedIn = Boolean(state.session);
  const mounted = useRef(false);
  useEffect(() => {
    // Not on first render, unless a memo link pointed at a section.
    if (!mounted.current) {
      mounted.current = true;
      if (!anchor) return;
    }
    // The Bench moves focus to its own card.
    if (!signedIn || tab === 'bench') return;
    const target = (anchor && document.getElementById(anchor)) || document.getElementById('main');
    target?.focus();
    if (anchor) target?.scrollIntoView({ block: 'start' });
  }, [signedIn, tab, anchor]);

  // Links tapped while the app is already open. Anything that is not a route,
  // such as the in-page jump to the Dock Draft, is left to the browser.
  // A link is read once, then the address goes clean, so a reload or relaunch
  // starts on Today. Only the Bench keeps its card in the hash.
  useEffect(() => {
    const consume = () => {
      const next = parseHash(location.hash);
      if (next && next.tab !== 'bench') clearHash();
      return next;
    };
    const onHash = () => {
      const next = consume();
      // Once the Bench is up it owns its place in the deck, whatever the hash says.
      if (next) setRoute((current) => (current.tab === 'bench' && next.tab === 'bench' ? current : next));
    };
    consume();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (recovery) {
    return (
      <Recovery
        // A failed import is the newer, more useful sentence; fall back to the
        // reason the save was unreadable in the first place.
        message={problem ?? recovery.message}
        onDownload={() => downloadText(backupFilename(), party.exportBackup())}
        onImport={party.importBackup}
        onReset={reset}
      />
    );
  }

  if (!state.session) {
    return <JoinScreen onJoin={signIn} problem={problem ?? unsaved} />;
  }

  function go(next: string, section: string | null = null) {
    setRoute({ tab: next, anchor: section });
    clearHash();
  }

  const banner = (
    <div className="banners">
      {locked ? (
        <p className="banner banner-closed" role="status">
          The trip has closed. This is a read-only recap, and nothing can be changed.
        </p>
      ) : null}
      {unsaved ? (
        <p className="banner banner-closed" role="status">
          {unsaved}
        </p>
      ) : null}
      {problem ? (
        <p className="banner banner-problem" role="alert">
          {problem}
          <button type="button" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      ) : null}
      {note && !problem ? (
        <p className="banner banner-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );

  if (tab === 'bench') {
    // Keyed so a new #card link, or convening again, starts the deck afresh.
    return <Bench key={anchor ?? 'bench'} state={state} run={run} start={anchor} onGo={go} banner={banner} />;
  }

  return (
    <Chrome
      tabs={TABS}
      active={tab}
      onNavigate={go}
      holder={{ name: state.session.name, color: state.session.color }}
      banner={banner}
    >
      {tab === 'today' ? <Today state={state} now={now} locked={locked} run={run} onGo={go} /> : null}
      {tab === 'picks' ? <Picks state={state} locked={locked} run={run} /> : null}
      {tab === 'bounties' ? <Bounties state={state} locked={locked} run={run} /> : null}
      {tab === 'mission' ? <Mission state={state} locked={locked} run={run} /> : null}
      {tab === 'vault' ? (
        <Vault state={state} locked={locked} now={now} run={run} onProblem={party.fail} />
      ) : null}
      {tab === 'dinner' ? <Dinner state={state} locked={locked} now={now} run={run} /> : null}
      {tab === 'you' ? (
        <You
          state={state}
          locked={locked}
          run={run}
          signIn={signIn}
          reset={reset}
          exportBackup={party.exportBackup}
          importBackup={party.importBackup}
        />
      ) : null}
    </Chrome>
  );
}

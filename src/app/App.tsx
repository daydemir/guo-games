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
import { Predictions } from './screens/Predictions';
import { Draft } from './screens/Draft';
import { Bounties } from './screens/Bounties';
import { Mission } from './screens/Mission';
import { Vault } from './screens/Vault';
import { Dinner } from './screens/Dinner';
import { Feed } from './screens/Feed';
import { You } from './screens/You';

const TABS: Tab[] = [
  { id: 'today', label: 'Today' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'draft', label: 'Draft' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'mission', label: 'Mission' },
  { id: 'vault', label: 'Vault' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'feed', label: 'Feed' },
  { id: 'you', label: 'You' },
];

/**
 * The whole app. State lives in one hook, rules live in core, and this file
 * only decides which screen is on and where messages go.
 */
export function App() {
  const party = useParty();
  const [tab, setTab] = useState('today');
  const { state, problem, note, dismiss, run, signIn, reset, now, recovery } = party;
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
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (signedIn) document.getElementById('main')?.focus();
  }, [signedIn, tab]);

  if (recovery) {
    return (
      <Recovery
        message={recovery.message}
        onDownload={() => downloadText(backupFilename(), party.exportBackup())}
        onImport={party.importBackup}
        onReset={reset}
      />
    );
  }

  if (!state.session) {
    return <JoinScreen onJoin={signIn} problem={problem} />;
  }

  function go(next: string) {
    setTab(next);
  }

  return (
    <Chrome
      tabs={TABS}
      active={tab}
      onNavigate={go}
      banner={
        <div className="banners">
          {locked ? (
            <p className="banner banner-closed" role="status">
              The trip has closed. This is a read-only recap, and nothing can be changed.
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
      }
    >
      {tab === 'today' ? <Today state={state} now={now} onGo={go} /> : null}
      {tab === 'predictions' ? <Predictions state={state} locked={locked} run={run} /> : null}
      {tab === 'draft' ? <Draft state={state} locked={locked} run={run} /> : null}
      {tab === 'bounties' ? <Bounties state={state} locked={locked} run={run} /> : null}
      {tab === 'mission' ? <Mission state={state} locked={locked} run={run} /> : null}
      {tab === 'vault' ? (
        <Vault state={state} locked={locked} now={now} run={run} onProblem={party.fail} />
      ) : null}
      {tab === 'dinner' ? <Dinner state={state} locked={locked} now={now} run={run} /> : null}
      {tab === 'feed' ? <Feed state={state} now={now} /> : null}
      {tab === 'you' ? <You
          state={state}
          locked={locked}
          run={run}
          signIn={signIn}
          reset={reset}
          exportBackup={party.exportBackup}
          importBackup={party.importBackup}
        /> : null}
    </Chrome>
  );
}

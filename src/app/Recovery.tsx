import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { PARTY_NAME } from '../core/content';
import { backupFilename } from '../core/backup';
import { Card } from '../ui/primitives';

/**
 * Shown instead of the game when this device holds a save the app cannot read.
 *
 * The app refuses to write anything while this is up, so the player is never
 * one tap away from silently destroying a vault. Both ways out are explicit:
 * take the bytes with you, or delete them on purpose.
 */
export function Recovery({
  message,
  onDownload,
  onImport,
  onReset,
}: {
  message: string;
  onDownload: () => void;
  onImport: (text: string) => void;
  onReset: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then(onImport);
    event.target.value = '';
  }

  return (
    <main className="join" id="main">
      <header className="join-head">
        <p className="masthead-mark" aria-hidden="true">
          GG
        </p>
        <h1>{PARTY_NAME}</h1>
      </header>

      <Card band="Saved party" title="This device has a party the app cannot read" tone="live">
        <p role="alert">{message}</p>
        <p>
          Nothing has been deleted, and nothing will be written over it until you pick one of these. The
          game stays locked in the meantime.
        </p>

        <div className="admin">
          <button className="primary" type="button" onClick={onDownload}>
            Download the unreadable save
          </button>
        </div>
        <p className="hint">
          Saves the raw bytes as a file. Worth doing first, even if you never open it, because it is the
          only copy that exists.
        </p>
      </Card>

      <Card band="Restore" title="Load a backup instead">
        <div className="field">
          <label htmlFor="recover-file">Backup file</label>
          <input id="recover-file" ref={fileInput} type="file" accept="application/json,.json" onChange={pick} />
          <p className="hint">A {backupFilename()} style file exported from the You page.</p>
        </div>
      </Card>

      <Card band="Start over" title="Delete it and begin again">
        <p>Wipes the unreadable save and puts the demo party back. There is no undo.</p>
        <button className="danger" type="button" onClick={onReset}>
          Delete and start fresh
        </button>
      </Card>
    </main>
  );
}

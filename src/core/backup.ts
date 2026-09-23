import { parseSavedParty } from './storage';
import { STATE_VERSION } from './state';
import type { State } from './state';

/**
 * A backup file. localStorage is not durable storage: iOS evicts it after a
 * stretch of not opening the site, and clearing site data wipes it with no
 * warning. A file the player holds themselves is the only real answer, and it
 * doubles as the escape hatch when a save on the device goes unreadable.
 */
export const BACKUP_APP = 'guo-games';

type BackupFile = { app: string; savedAt: string; version: number; party: unknown };

export function writeBackup(state: State): string {
  const file: BackupFile = {
    app: BACKUP_APP,
    savedAt: new Date().toISOString(),
    version: STATE_VERSION,
    party: state,
  };
  // Indented so a curious person can open it in any text editor and read it.
  return JSON.stringify(file, null, 2);
}

export function readBackup(text: string): State {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read. Pick the .json backup this app gave you.');
  }

  if (typeof file !== 'object' || file === null || (file as BackupFile).app !== BACKUP_APP) {
    throw new Error('That is not a Guo Games backup file.');
  }

  assertComplete((file as BackupFile).party);

  const party = parseSavedParty((file as BackupFile).party);
  if (!party) {
    throw new Error('That backup was written by a newer version of the app and cannot be read here.');
  }
  return party;
}

/**
 * Every field a current-version party carries. The schema gives all of them a
 * default, so a truncated v3 file would otherwise parse cleanly into an empty
 * party and restoring it would quietly wipe the vault it was meant to rescue.
 *
 * Older versions are exempt on purpose: filling in fields that did not exist
 * yet is exactly what migration is for.
 */
const REQUIRED_V3_KEYS = [
  'session',
  'settings',
  'dinner',
  'picks',
  'results',
  'draft',
  'bounties',
  'missions',
  'vault',
  'future',
  'feed',
] as const;

function assertComplete(party: unknown): void {
  if (typeof party !== 'object' || party === null) {
    throw new Error('That backup does not contain a party.');
  }
  if ((party as { version?: unknown }).version !== STATE_VERSION) return;

  const missing = REQUIRED_V3_KEYS.filter((key) => !Object.hasOwn(party, key));
  if (missing.length > 0) {
    throw new Error(
      `That backup is incomplete and was not restored, so nothing on this device changed. Missing: ${missing.join(', ')}.`,
    );
  }
}

/** A filename that sorts by date and says what it is. */
export function backupFilename(now: Date = new Date()): string {
  return `guo-games-backup-${now.toISOString().slice(0, 10)}.json`;
}

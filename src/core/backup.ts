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
 * What a saved party looks like at each version this app can read.
 *
 * Every field in the schema carries a default, so a truncated file parses into
 * a perfectly valid *empty* party. Restoring that would wipe the vault the
 * backup was meant to rescue, and the settings block is the same trap one
 * level down: an empty `settings` silently resets the organizer's closing
 * date. So a backup has to arrive complete for the version it claims to be.
 *
 * Only fields genuinely introduced later are allowed to be absent, which is
 * the whole job of migration. This strictness is deliberately scoped to
 * backup files. A save already sitting on the device still migrates leniently,
 * because there the alternative to a defaulted field is losing the save.
 */
const V2_PARTY_KEYS = [
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
] as const;

const V2_SETTINGS_KEYS = ['hideRankings', 'awards'] as const;

/** Version 3 added the shared activity feed and the configurable closing date. */
const SHAPES: Record<number, { party: readonly string[]; settings: readonly string[] }> = {
  2: { party: V2_PARTY_KEYS, settings: V2_SETTINGS_KEYS },
  3: {
    party: [...V2_PARTY_KEYS, 'feed'],
    settings: [...V2_SETTINGS_KEYS, 'expiresAt'],
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function incomplete(missing: string[]): Error {
  return new Error(
    `That backup is incomplete and was not restored, so nothing on this device changed. Missing: ${missing.join(', ')}.`,
  );
}

function assertComplete(party: unknown): void {
  if (!isRecord(party)) {
    throw new Error('That backup does not contain a party.');
  }

  const shape = SHAPES[party.version as number];
  // An unrecognised version is not incomplete, it is unreadable. Let the
  // schema say so, so the message matches the actual problem.
  if (!shape) return;

  const missing = shape.party.filter((key) => !Object.hasOwn(party, key));
  if (missing.length > 0) throw incomplete(missing);

  if (!isRecord(party.settings)) throw incomplete(['settings']);
  const missingSettings = shape.settings.filter((key) => !Object.hasOwn(party.settings as object, key));
  if (missingSettings.length > 0) {
    throw incomplete(missingSettings.map((key) => `settings.${key}`));
  }
}

/** A filename that sorts by date and says what it is. */
export function backupFilename(now: Date = new Date()): string {
  return `guo-games-backup-${now.toISOString().slice(0, 10)}.json`;
}

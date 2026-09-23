import { DEFAULT_SETTINGS, STATE_VERSION, demoState, emptyState, stateSchema } from './state';
import type { State } from './state';

export const STORAGE_KEY = 'guo-games/party';

/** The slice of the Storage API this app needs. Keeps tests free of a DOM. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type Loaded = {
  state: State;
  /** A sentence to show the player when their save could not be used, else null. */
  problem: string | null;
};

const UNREADABLE =
  'The saved party on this device could not be read by this version of the app. Nothing has been deleted. Reset below to start a fresh party.';

/**
 * Reads the party off the device.
 *
 * Three outcomes, and the third is the one that matters: nothing saved yet
 * gives a seeded demo party, a readable save is migrated forward, and a save
 * this build cannot understand is reported rather than overwritten. Silently
 * destroying somebody's vault because a schema moved would be the worst bug
 * this app could have.
 */
export function load(storage: StorageLike, now: number = Date.now()): Loaded {
  const raw = readRaw(storage);
  if (raw === null) return { state: demoState(now), problem: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: emptyState(), problem: UNREADABLE };
  }

  const migrated = migrate(parsed);
  if (!migrated) return { state: emptyState(), problem: UNREADABLE };

  const result = stateSchema.safeParse(migrated);
  if (!result.success) return { state: emptyState(), problem: UNREADABLE };

  return { state: result.data, problem: null };
}

/**
 * Brings an older save up to the current shape. Version 2 predates the shared
 * feed and the configurable closing date, so both get defaults. Anything newer
 * than this build returns null and is left alone on disk.
 */
function migrate(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const save = parsed as Record<string, unknown>;

  if (save.version === STATE_VERSION) return save;

  if (save.version === 2) {
    const settings = typeof save.settings === 'object' && save.settings !== null ? save.settings : {};
    return { ...save, version: STATE_VERSION, settings: { ...DEFAULT_SETTINGS, ...settings }, feed: [] };
  }

  return null;
}

/** Writes the party back. The only failure worth naming is a full device. */
export function save(storage: StorageLike, state: State): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (isQuotaError(error)) {
      throw new Error('Device storage is full. Withdraw a memory with a photo or voice note, then try again.', {
        cause: error,
      });
    }
    throw error;
  }
}

export function clear(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY);
}

/** Private browsing can make even reading throw. A demo party is a fine answer. */
function readRaw(storage: StorageLike): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.code === 22;
  }
  return error instanceof Error && /quota/i.test(error.message);
}

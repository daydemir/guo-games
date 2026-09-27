import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, join } from '../core/actions';
import type { Action } from '../core/actions';
import { STORAGE_KEY, clear, load, save } from '../core/storage';
import type { Loaded, StorageLike } from '../core/storage';
import { readBackup, writeBackup } from '../core/backup';
import type { Color, Identity } from '../core/content';
import { demoState } from '../core/state';
import type { State } from '../core/state';

export type Party = {
  state: State;
  /** The last thing that went wrong, phrased for a player. */
  problem: string | null;
  /**
   * Set, for the whole session, when the browser will not store anything.
   * It is not a `problem`: those clear on the next success, and this does not.
   */
  unsaved: string | null;
  /** Confirmation of the last thing that worked. */
  note: string | null;
  dismiss: () => void;
  /** Report a problem a screen caught before it ever reached the reducer. */
  fail: (message: string) => void;
  /** Confirm something that happened outside the reducer, such as a trade. */
  tell: (message: string) => void;
  /**
   * Set when this device holds a save the app cannot read. Until the player
   * resolves it, every write is refused so their data is not overwritten.
   */
  recovery: Recovery | null;
  /** The unreadable bytes, as a downloadable backup-shaped file. */
  exportBackup: () => string;
  importBackup: (text: string) => void;
  /**
   * True when the command was applied and saved, false when it was refused.
   * The note may be worked out from the saved party, such as a case number.
   */
  run: (action: Action, note?: Note) => boolean;
  signIn: (code: string, who: Identity, name: string, color: Color) => boolean;
  reset: () => void;
  /** Ticks about once a minute so relative times and the 4pm spark stay honest. */
  now: number;
};

export type Recovery = { message: string; raw: string };
export type Note = string | ((next: State) => string);

/**
 * Even touching `localStorage` throws when a browser blocks site data, and at
 * module scope that would blank the page. No storage is an answer, not a crash.
 */
function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const NOT_SAVING =
  'This browser is not saving anything for this site, so the party will be gone when the tab closes.';

/**
 * Holds the party for the whole app: one state, one dispatcher, one place that
 * turns a thrown rule into a sentence on screen.
 *
 * Writing to storage is a consequence of a command rather than a reaction to a
 * render. That keeps a failed load from being overwritten on mount, and keeps
 * a full disk reportable at the moment it happens.
 */
export function useParty(storage: StorageLike | null = browserStorage()): Party {
  // A device that could not even be read may still hold a party, so it is
  // never written to either: this session plays from memory and says so.
  const { initial, store } = useMemo((): { initial: Loaded; store: StorageLike | null } => {
    const fresh: Loaded = { state: demoState(), problem: null, unreadable: false, raw: null };
    if (!storage) return { initial: fresh, store: null };
    try {
      return { initial: load(storage), store: storage };
    } catch {
      return { initial: fresh, store: null };
    }
  }, [storage]);
  const [state, setState] = useState(initial.state);
  const [problem, setProblem] = useState<string | null>(initial.problem);
  const [recovery, setRecovery] = useState<Recovery | null>(
    initial.unreadable && initial.raw !== null ? { message: initial.problem ?? '', raw: initial.raw } : null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** Mirrors `state` so a command can read the latest without a stale closure. */
  const latest = useRef(state);
  /** The bytes this tab last read or wrote. Anything else in storage came from another tab. */
  const seen = useRef(initial.raw);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * True when this device is holding a save the app could not read. Every path
   * that would write has to ask first: overwriting it would destroy the only
   * copy of somebody's vault.
   */
  const blocked = useCallback(() => {
    if (!recovery) return false;
    setProblem('There is an unreadable party saved on this device. Rescue or reset it before playing.');
    setNote(null);
    return true;
  }, [recovery]);

  /**
   * Catches up with the device save. A memo link often opens a second tab, and
   * both tabs share one save: without this, whichever wrote last would silently
   * erase the other's work and hand out the same case number twice. False when
   * the save has become unreadable, which puts this tab into recovery too.
   */
  const sync = useCallback((): boolean => {
    if (!store || store.getItem(STORAGE_KEY) === seen.current) return true;
    const loaded = load(store);
    seen.current = loaded.raw;
    if (loaded.unreadable && loaded.raw !== null) {
      setRecovery({ message: loaded.problem ?? '', raw: loaded.raw });
      setProblem(loaded.problem);
      return false;
    }
    latest.current = loaded.state;
    setState(loaded.state);
    setRecovery(null);
    return true;
  }, [store]);

  // Another tab's write, reset or restore shows up here without a reload.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      try {
        sync();
      } catch {
        // A read that throws leaves this tab as it was; its next command reports it.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [sync]);

  /**
   * Runs a command and saves the result, or turns the rule it broke into a
   * message. The screen only moves on once the write has landed: showing a
   * memory that never reached storage would lose it on the next reload.
   */
  const attempt = useCallback(
    (compute: (current: State) => State, confirmation?: Note): boolean => {
      // Checked before the reducer runs, not after. Otherwise a rescued empty
      // party throws its own "join first" complaint and the real reason the
      // app is refusing never reaches the player.
      if (blocked()) return false;
      try {
        // Always on the save as it is now, never on this tab's older copy.
        if (!sync()) return false;
        const next = compute(latest.current);
        if (store) seen.current = save(store, next);
        latest.current = next;
        setState(next);
        setProblem(null);
        setNote(typeof confirmation === 'function' ? confirmation(next) : (confirmation ?? null));
        return true;
      } catch (error) {
        setProblem(messageFrom(error));
        setNote(null);
        return false;
      }
    },
    [store, blocked, sync],
  );

  const run = useCallback(
    (action: Action, confirmation?: Note) => attempt((current) => act(current, action), confirmation),
    [attempt],
  );

  const signIn = useCallback(
    (code: string, who: Identity, name: string, color: Color) =>
      attempt(
        (current) => join(current, code, who, name, color),
        who === 'Spectator' ? 'You are watching.' : `You are playing as ${who}.`,
      ),
    [attempt],
  );

  const reset = useCallback(() => {
    if (store) clear(store);
    seen.current = null;
    const fresh = store ? load(store).state : demoState();
    latest.current = fresh;
    setState(fresh);
    setRecovery(null);
    setProblem(null);
    setNote('This device is back to the demo party.');
  }, [store]);

  /**
   * The bytes to hand the player as a file. When the device save is unreadable
   * this is the raw text exactly as found, because a backup of the rescued
   * empty state would be worse than useless.
   */
  const exportBackup = useCallback(
    () => (recovery ? recovery.raw : writeBackup(latest.current)),
    [recovery],
  );

  const importBackup = useCallback(
    (text: string) => {
      try {
        const restored = readBackup(text);
        if (store) seen.current = save(store, restored);
        latest.current = restored;
        setState(restored);
        setRecovery(null);
        setProblem(null);
        setNote('Backup restored to this device.');
      } catch (error) {
        setProblem(messageFrom(error));
        setNote(null);
      }
    },
    [store],
  );

  const tell = useCallback((message: string) => {
    setProblem(null);
    setNote(message);
  }, []);

  const dismiss = useCallback(() => {
    setProblem(null);
    setNote(null);
  }, []);

  return {
    state,
    problem,
    unsaved: store ? null : NOT_SAVING,
    note,
    dismiss,
    fail: setProblem,
    tell,
    recovery,
    exportBackup,
    importBackup,
    run,
    signIn,
    reset,
    now,
  };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

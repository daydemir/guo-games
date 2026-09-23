import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, join } from '../core/actions';
import type { Action } from '../core/actions';
import { clear, load, save } from '../core/storage';
import type { Loaded, StorageLike } from '../core/storage';
import { readBackup, writeBackup } from '../core/backup';
import type { Color, Identity } from '../core/content';
import { demoState } from '../core/state';
import type { State } from '../core/state';

export type Party = {
  state: State;
  /** The last thing that went wrong, phrased for a player. */
  problem: string | null;
  /** Confirmation of the last thing that worked. */
  note: string | null;
  dismiss: () => void;
  /** Report a problem a screen caught before it ever reached the reducer. */
  fail: (message: string) => void;
  /**
   * Set when this device holds a save the app cannot read. Until the player
   * resolves it, every write is refused so their data is not overwritten.
   */
  recovery: Recovery | null;
  /** The unreadable bytes, as a downloadable backup-shaped file. */
  exportBackup: () => string;
  importBackup: (text: string) => void;
  run: (action: Action, note?: string) => void;
  signIn: (code: string, who: Identity, name: string, color: Color) => void;
  reset: () => void;
  /** Ticks about once a minute so relative times and the 4pm spark stay honest. */
  now: number;
};

export type Recovery = { message: string; raw: string };

const localStore: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage;

/**
 * Holds the party for the whole app: one state, one dispatcher, one place that
 * turns a thrown rule into a sentence on screen.
 *
 * Writing to storage is a consequence of a command rather than a reaction to a
 * render. That keeps a failed load from being overwritten on mount, and keeps
 * a full disk reportable at the moment it happens.
 */
export function useParty(storage: StorageLike | null = localStore): Party {
  const initial: Loaded = useMemo(
    () => (storage ? load(storage) : { state: demoState(), problem: null, unreadable: false, raw: null }),
    [storage],
  );
  const [state, setState] = useState(initial.state);
  const [problem, setProblem] = useState<string | null>(initial.problem);
  const [recovery, setRecovery] = useState<Recovery | null>(
    initial.unreadable && initial.raw !== null ? { message: initial.problem ?? '', raw: initial.raw } : null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** Mirrors `state` so a command can read the latest without a stale closure. */
  const latest = useRef(state);

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

  const commit = useCallback(
    (next: State, confirmation?: string) => {
      if (blocked()) return;
      latest.current = next;
      setState(next);
      setNote(confirmation ?? null);
      try {
        if (storage) save(storage, next);
        setProblem(null);
      } catch (error) {
        setProblem(messageFrom(error));
      }
    },
    [storage, blocked],
  );

  /** Runs a command, or turns the rule it broke into a message. */
  const attempt = useCallback(
    (compute: (current: State) => State, confirmation?: string) => {
      // Checked before the reducer runs, not after. Otherwise a rescued empty
      // party throws its own "join first" complaint and the real reason the
      // app is refusing never reaches the player.
      if (blocked()) return;
      try {
        commit(compute(latest.current), confirmation);
      } catch (error) {
        setProblem(messageFrom(error));
        setNote(null);
      }
    },
    [commit, blocked],
  );

  const run = useCallback(
    (action: Action, confirmation?: string) => attempt((current) => act(current, action), confirmation),
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
    if (storage) clear(storage);
    const fresh = storage ? load(storage).state : demoState();
    latest.current = fresh;
    setState(fresh);
    setRecovery(null);
    setProblem(null);
    setNote('This device is back to the demo party.');
  }, [storage]);

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
        if (storage) save(storage, restored);
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
    [storage],
  );

  const dismiss = useCallback(() => {
    setProblem(null);
    setNote(null);
  }, []);

  return {
    state,
    problem,
    note,
    dismiss,
    fail: setProblem,
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

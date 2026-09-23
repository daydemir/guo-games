import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, join } from '../core/actions';
import type { Action } from '../core/actions';
import { clear, load, save } from '../core/storage';
import type { StorageLike } from '../core/storage';
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
  run: (action: Action, note?: string) => void;
  signIn: (code: string, who: Identity, name: string, color: Color) => void;
  reset: () => void;
  /** Ticks about once a minute so relative times and the 4pm spark stay honest. */
  now: number;
};

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
  const initial = useMemo(() => (storage ? load(storage) : { state: demoState(), problem: null }), [storage]);
  const [state, setState] = useState(initial.state);
  const [problem, setProblem] = useState<string | null>(initial.problem);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  /** Mirrors `state` so a command can read the latest without a stale closure. */
  const latest = useRef(state);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const commit = useCallback(
    (next: State, confirmation?: string) => {
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
    [storage],
  );

  /** Runs a command, or turns the rule it broke into a message. */
  const attempt = useCallback(
    (compute: (current: State) => State, confirmation?: string) => {
      try {
        commit(compute(latest.current), confirmation);
      } catch (error) {
        setProblem(messageFrom(error));
        setNote(null);
      }
    },
    [commit],
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
    setProblem(null);
    setNote('This device is back to the demo party.');
  }, [storage]);

  const dismiss = useCallback(() => {
    setProblem(null);
    setNote(null);
  }, []);

  return { state, problem, note, dismiss, fail: setProblem, run, signIn, reset, now };
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { PARTY_KEY, ledgerSchema } from '../core/market';
import type { Command, Ledger } from '../core/market';
import type { Attendee } from '../core/content';

/**
 * The Wedding Markets, live. Unlike the rest of the app, the markets are not
 * kept on this device: a small server holds them for everyone on the party
 * link, and this hook asks it for news every few seconds while the app is on
 * screen. The server is the only place a trade happens, so when it cannot be
 * reached nothing is bought here either; the hook says so and keeps trying.
 */
export type Live = {
  /** The party this device trades on, from the party link. */
  key: string | null;
  /** The markets as the server last reported them. */
  ledger: Ledger | null;
  /**
   * off: no party link yet. connecting: waiting on the first answer. live:
   * the last answer came back. down: it did not. unknown: the server does not
   * know this link.
   */
  status: 'off' | 'connecting' | 'live' | 'down' | 'unknown';
  /** A command is on its way, so the buttons wait for it. */
  busy: boolean;
  /** The link that brings someone else onto this party. */
  invite: string | null;
  /** Takes the key out of a party link. */
  adopt: (key: string) => void;
  /** Starts a new party on the server and trades on it from now on. */
  start: () => Promise<boolean>;
  /** True once the server has applied the command. */
  send: (who: Attendee, command: Command, note?: LiveNote) => Promise<boolean>;
};

export type LiveNote = string | ((ledger: Ledger) => string);

/** Where the server is. A build can point elsewhere with VITE_MARKETS_URL. */
export const DEFAULT_MARKETS_URL = 'https://guo-games-markets.onrender.com';
export const LIVE_KEY = 'guo-games/live';
export const POLL_MS = 2_500;
const TIMEOUT_MS = 8_000;
/** Attempts at one command when the network drops it. Ids make a repeat harmless. */
const ATTEMPTS = 3;

const OFFLINE = 'Can’t reach the market, so that may not have gone through. It reconnects by itself; check the board then.';

const base = (): string => (import.meta.env.VITE_MARKETS_URL as string | undefined) || DEFAULT_MARKETS_URL;

/** Local storage can throw outright when a browser blocks site data. The link still works for this visit. */
function stored(): string | null {
  try {
    const key = localStorage.getItem(LIVE_KEY);
    return key && PARTY_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

function remember(key: string): void {
  try {
    localStorage.setItem(LIVE_KEY, key);
  } catch {
    // Kept in memory for this visit; the link brings it back next time.
  }
}

/** One request, given up after a few seconds so a dead signal cannot hang a button. */
async function call(method: 'GET' | 'POST', path: string, key: string | null, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (key) headers['x-party-key'] = key;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return await fetch(`${base()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** The sentence a refusal carries, or a plain one when it carries none. */
async function reason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Not JSON: a proxy page, most likely.
  }
  return 'The market refused that. Try again.';
}

export function useMarkets({
  initialKey,
  onProblem,
  onNote,
}: {
  /** A key from the link that opened the app, which wins over the one saved here. */
  initialKey: string | null;
  onProblem: (message: string) => void;
  onNote: (message: string) => void;
}): Live {
  const [key, setKey] = useState<string | null>(() => {
    if (initialKey && PARTY_KEY.test(initialKey)) {
      remember(initialKey);
      return initialKey;
    }
    return stored();
  });
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [status, setStatus] = useState<Live['status']>(key ? 'connecting' : 'off');
  const [busy, setBusy] = useState(false);
  /** Mirrors, so a slow answer can tell whether it is still wanted. */
  const keyRef = useRef(key);
  const ledgerRef = useRef(ledger);

  /** Never steps backwards: a slow poll can land after a newer command's answer. */
  const accept = useCallback((next: Ledger) => {
    const current = ledgerRef.current;
    if (current && next.version < current.version) return;
    ledgerRef.current = next;
    setLedger(next);
  }, []);

  const adopt = useCallback((next: string) => {
    if (!PARTY_KEY.test(next) || next === keyRef.current) return;
    remember(next);
    keyRef.current = next;
    ledgerRef.current = null;
    setKey(next);
    setLedger(null);
    setStatus('connecting');
  }, []);

  const refresh = useCallback(async () => {
    const asked = keyRef.current;
    if (!asked) return;
    const since = ledgerRef.current?.version;
    try {
      const response = await call('GET', since === undefined ? '/party' : `/party?since=${since}`, asked);
      if (keyRef.current !== asked) return;
      if (response.status === 404) return setStatus('unknown');
      if (response.status === 204) return setStatus('live');
      if (!response.ok) return setStatus('down');
      accept(ledgerSchema.parse(await response.json()));
      setStatus('live');
    } catch {
      if (keyRef.current === asked) setStatus('down');
    }
  }, [accept]);

  // Polls while the app is on screen, and at once when it comes back.
  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== 'hidden') await refresh();
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    const wake = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    void tick();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [key, refresh]);

  const send = useCallback(
    async (who: Attendee, command: Command, note?: LiveNote): Promise<boolean> => {
      const asked = keyRef.current;
      if (!asked) return false;
      setBusy(true);
      try {
        for (let attempt = 1; ; attempt += 1) {
          let response: Response;
          try {
            response = await call('POST', '/party', asked, { who, command });
          } catch {
            // Dropped on the way. The same command id is safe to send again.
            if (attempt < ATTEMPTS) continue;
            setStatus('down');
            onProblem(OFFLINE);
            return false;
          }
          if (!response.ok) {
            if (response.status === 404) setStatus('unknown');
            onProblem(await reason(response));
            return false;
          }
          const next = ledgerSchema.parse(await response.json());
          accept(next);
          setStatus('live');
          if (note) onNote(typeof note === 'function' ? note(next) : note);
          return true;
        }
      } catch {
        onProblem('The market sent back something this app cannot read. Reload and try again.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accept, onNote, onProblem],
  );

  const start = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await call('POST', '/parties', null);
      if (!response.ok) {
        onProblem(await reason(response));
        return false;
      }
      const body = (await response.json()) as { key: string };
      adopt(body.key);
      await refresh();
      onNote('The markets are live. Share the party link in the group chat.');
      return true;
    } catch {
      onProblem(OFFLINE);
      return false;
    } finally {
      setBusy(false);
    }
  }, [adopt, refresh, onNote, onProblem]);

  return {
    key,
    ledger,
    status,
    busy,
    invite: key ? `${location.origin}${import.meta.env.BASE_URL}#live/${key}` : null,
    adopt,
    start,
    send,
  };
}

import { useEffect } from 'react';

/**
 * Keeps the Bench phone awake while it sits face up on the table. Browsers drop
 * the lock whenever the page is hidden, so it is asked for again on return.
 * Where the API is missing or refuses, the screen just sleeps as usual.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;

    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (live) lock = next;
        else void next.release();
      } catch {
        // Low battery, a hidden page, or a browser that says no. All fine.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
    };
  }, []);
}

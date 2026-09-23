/** @vitest-environment happy-dom */
import { expect, it, vi } from 'vitest';
import { REVOKE_AFTER_MS, downloadText } from './download';

function harness() {
  const revoked: string[] = [];
  const scheduled: { fn: () => void; ms: number }[] = [];
  return {
    revoked,
    scheduled,
    deps: {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: (url: string) => void revoked.push(url),
      schedule: (fn: () => void, ms: number) => void scheduled.push({ fn, ms }),
    },
  };
}

it('clicks a link with the filename and cleans the element up straight away', () => {
  const { deps } = harness();
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  downloadText('party.json', '{}', deps);

  expect(clicks).toHaveBeenCalledTimes(1);
  expect(document.querySelectorAll('a')).toHaveLength(0);
  vi.restoreAllMocks();
});

it('keeps the object URL alive long enough for WebKit to start the download', () => {
  const { revoked, scheduled, deps } = harness();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  downloadText('party.json', '{}', deps);

  // Revoking in the same tick cancels the download in Safari and iOS.
  expect(revoked).toEqual([]);
  expect(scheduled[0].ms).toBe(REVOKE_AFTER_MS);

  scheduled[0].fn();
  expect(revoked).toEqual(['blob:stub']);
  vi.restoreAllMocks();
});

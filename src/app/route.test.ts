import { expect, it } from 'vitest';
import { HOME, parseHash } from './route';
import { ACTS, ACT_NUMBERS } from '../core/bureau';

it('reads every route form', () => {
  expect(parseHash('#today')).toEqual({ tab: 'today', anchor: null });
  expect(parseHash('#picks/dock-draft')).toEqual({ tab: 'picks', anchor: 'dock-draft' });
  expect(parseHash('#bench')).toEqual({ tab: 'bench', anchor: null });
  expect(parseHash('#card/exhibit-a')).toEqual({ tab: 'bench', anchor: 'exhibit-a' });
});

it('ignores anything that is not a route, so the app can fall back to Today', () => {
  for (const hash of ['', '#', '#nowhere', '#card/not-a-card', '#dock-draft']) {
    expect(parseHash(hash)).toBeNull();
  }
  expect(parseHash('#picks/<script>')).toEqual({ tab: 'picks', anchor: null });
  expect(HOME).toEqual({ tab: 'today', anchor: null });
});

it('only ever links a Dispatch memo to a real route', () => {
  for (const act of ACT_NUMBERS) {
    const memo = ACTS[act].memo('https://guo.test/');
    const hashes = memo.match(/#[a-z/-]+/g) ?? [];
    expect(hashes.length, memo).toBe(1);
    expect(parseHash(hashes[0] ?? ''), memo).not.toBeNull();
  }
});

it('reads a party link, keeping the key exactly as written', () => {
  expect(parseHash('#live/Ab_9-xYzAb_9-xYzAb_9-x')).toEqual({ tab: 'picks', anchor: 'markets', key: 'Ab_9-xYzAb_9-xYzAb_9-x' });
  expect(parseHash('#live/<script>')).toBeNull();
});

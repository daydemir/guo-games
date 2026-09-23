/** @vitest-environment happy-dom */
import { expect, it } from 'vitest';
import { act as reactAct, renderHook } from '@testing-library/react';
import { useParty } from './useParty';
import { STORAGE_KEY } from '../core/storage';
import type { StorageLike } from '../core/storage';

function device(seed?: string) {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(STORAGE_KEY, seed);
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
  return { storage, read: () => values.get(STORAGE_KEY) ?? null };
}

it('reports an unreadable save rather than quietly starting over', () => {
  const { storage } = device('{{{');
  const { result } = renderHook(() => useParty(storage));

  expect(result.current.recovery?.raw).toBe('{{{');
  expect(result.current.problem).toMatch(/saved party/i);
});

it('refuses every write while an unreadable save is unresolved', () => {
  const { storage, read } = device('{{{');
  const { result } = renderHook(() => useParty(storage));

  reactAct(() => result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  expect(result.current.state.session).toBeNull();
  expect(read()).toBe('{{{');

  reactAct(() => result.current.run({ type: 'draft', fish: 'ono' }));
  expect(result.current.problem).toMatch(/unreadable party/i);
  expect(read()).toBe('{{{');
});

it('hands back the raw bytes, not a backup of the rescued empty party', () => {
  const { storage } = device('{{{ half a vault');
  const { result } = renderHook(() => useParty(storage));

  expect(result.current.exportBackup()).toBe('{{{ half a vault');
});

it('clears the block once the player resets, and plays normally after', () => {
  const { storage, read } = device('{{{');
  const { result } = renderHook(() => useParty(storage));

  reactAct(() => result.current.reset());
  expect(result.current.recovery).toBeNull();
  expect(read()).toBeNull();

  reactAct(() => result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  expect(result.current.state.session?.attendee).toBe('Kevin');
  expect(read()).toContain('Kevin');
});

it('writes normally when the device save is fine', () => {
  const { storage, read } = device();
  const { result } = renderHook(() => useParty(storage));

  expect(result.current.recovery).toBeNull();
  reactAct(() => result.current.signIn('GUO27', 'Nick', 'Nick', 'sea'));
  expect(read()).toContain('Nick');
});

it('leaves a healthy device untouched when a truncated backup is imported', () => {
  const { storage, read } = device();
  const { result } = renderHook(() => useParty(storage));
  reactAct(() => result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  const before = read();

  for (const party of [{ version: 2 }, { version: 3 }, { version: 2, session: null, draft: {} }]) {
    reactAct(() => result.current.importBackup(JSON.stringify({ app: 'guo-games', party })));
    expect(result.current.problem).toMatch(/incomplete/i);
    expect(result.current.state.session?.attendee).toBe('Kevin');
    expect(read()).toBe(before);
  }
});

it('keeps the last saved state on screen when a write fails, so nothing appears saved that is not', () => {
  const { storage, read } = device();
  const { result } = renderHook(() => useParty(storage));
  reactAct(() => void result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  const before = read();

  storage.setItem = () => {
    throw new DOMException('quota', 'QuotaExceededError');
  };
  let ok = true;
  reactAct(() => {
    ok = result.current.run({ type: 'draft', fish: 'mahimahi' });
  });

  expect(ok).toBe(false);
  expect(result.current.problem).toMatch(/storage is full/i);
  expect(result.current.state.draft.Kevin).toBeUndefined();
  expect(read()).toBe(before);
});

it('reports whether a command worked, so a form knows when it may clear', () => {
  const { storage } = device();
  const { result } = renderHook(() => useParty(storage));
  let joined = false;
  reactAct(() => {
    joined = result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea');
  });
  expect(joined).toBe(true);

  let sealed = true;
  reactAct(() => {
    sealed = result.current.run({ type: 'sealFuture', text: '' });
  });
  expect(sealed).toBe(false);
});

it('keeps saying so when the browser will not store anything, even after things work', () => {
  const { result } = renderHook(() => useParty(null));
  expect(result.current.unsaved).toMatch(/not saving/i);
  expect(result.current.recovery).toBeNull();

  reactAct(() => void result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  reactAct(() => result.current.dismiss());
  expect(result.current.state.session?.attendee).toBe('Kevin');
  expect(result.current.unsaved).toMatch(/not saving/i);
});

it('never writes to a device it could not read, in case a party is hiding there', () => {
  const { storage, read } = device('{"version":3,"a real":"party"}');
  const writes: string[] = [];
  const flaky: StorageLike = {
    getItem: () => {
      throw new DOMException('denied', 'SecurityError');
    },
    setItem: (_key, value) => void writes.push(value),
    removeItem: storage.removeItem,
  };
  const { result } = renderHook(() => useParty(flaky));

  reactAct(() => void result.current.signIn('GUO27', 'Kevin', 'Kevin', 'sea'));
  expect(result.current.state.session?.attendee).toBe('Kevin');
  expect(writes).toEqual([]);
  expect(read()).toBe('{"version":3,"a real":"party"}');
  expect(result.current.unsaved).toMatch(/not saving/i);
});

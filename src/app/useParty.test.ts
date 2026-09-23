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

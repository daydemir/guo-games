/**
 * Where parties live: one JSON file each, in one directory on a persistent
 * disk. Every party is held in memory and written through on every change,
 * atomically (a temporary file, flushed, then renamed over the old one), so a
 * crash mid-write leaves the previous version intact rather than half a file.
 *
 * A file is named by a hash of its party key, never the key itself, so a
 * directory listing does not hand anyone a way in.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { PARTY_KEY, emptyLedger, ledgerSchema } from '../src/core/market.ts';
import type { Ledger } from '../src/core/market.ts';

export type Party = { id: string; createdAt: number; ledger: Ledger };

export type Store = {
  /** The party a key opens, or null for a key that opens nothing. */
  find(key: string): Party | null;
  /** A new, empty party and the key that opens it. The key is never stored. */
  create(now: number): { key: string; party: Party };
  /** Writes the new ledger to disk, then to memory. Throws, changing nothing, if the disk refuses. */
  commit(party: Party, ledger: Ledger): void;
  count(): number;
};

const fileSchema = z.object({ id: z.string(), createdAt: z.number(), ledger: ledgerSchema });

const idFor = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 32);

export function openStore(dir: string): Store {
  mkdirSync(dir, { recursive: true });
  const parties = new Map<string, Party>();

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const party = fileSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8')));
      parties.set(party.id, party);
    } catch (error) {
      // Refusing to start keeps the previous deploy serving, and never shows
      // players an empty board that tempts a Clerk into starting over.
      throw new Error(`Party file ${name} cannot be read by this version of the server. Nothing was changed.`, { cause: error });
    }
  }

  function write(party: Party): void {
    const path = join(dir, `${party.id}.json`);
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(party), { flush: true });
    renameSync(temporary, path);
    // The rename itself is only durable once the directory is flushed too.
    const handle = openSync(dir, 'r');
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
  }

  return {
    find(key) {
      return PARTY_KEY.test(key) ? (parties.get(idFor(key)) ?? null) : null;
    },
    create(now) {
      const key = randomBytes(16).toString('base64url');
      const id = idFor(key);
      if (parties.has(id) || existsSync(join(dir, `${id}.json`))) throw new Error('Party id collision.');
      const party = { id, createdAt: now, ledger: emptyLedger() };
      write(party);
      parties.set(id, party);
      return { key, party };
    },
    commit(party, ledger) {
      write({ ...party, ledger });
      party.ledger = ledger;
    },
    count() {
      return parties.size;
    },
  };
}

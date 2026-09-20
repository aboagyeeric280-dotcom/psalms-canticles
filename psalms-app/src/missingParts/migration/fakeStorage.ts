/* A storage double for the migration tests.
 *
 * Test support only; nothing in the reader imports it. Real localStorage
 * cannot be made to run out of room on demand, and a rollback that has never
 * been seen to fire is a rollback nobody should trust.
 */

import { guarded, type MigrationStorage } from './storageIo';

export interface FakeStorage extends MigrationStorage {
  /** Make the next write to any matching key throw a quota error. */
  failOn(match: (key: string) => boolean, times?: number): void;
  /** Every write attempted, in order, including the ones that threw. */
  readonly writes: string[];
  readonly removals: string[];
  raw: Map<string, string>;
}

class QuotaExceeded extends Error {
  constructor() {
    super('The quota has been exceeded.');
    this.name = 'QuotaExceededError';
  }
}

export function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const raw = new Map(Object.entries(initial));
  const writes: string[] = [];
  const removals: string[] = [];
  let failMatch: ((key: string) => boolean) | null = null;
  let failTimes = 0;

  const base: MigrationStorage = {
    getItem: (key) => (raw.has(key) ? raw.get(key)! : null),
    keys: () => [...raw.keys()],
    setItem(key, value) {
      writes.push(key);
      if (failMatch && failTimes > 0 && failMatch(key)) {
        failTimes -= 1;
        throw new QuotaExceeded();
      }
      raw.set(key, value);
    },
    removeItem(key) {
      removals.push(key);
      raw.delete(key);
    },
  };

  const wrapped = guarded(base);
  return {
    ...wrapped,
    raw,
    writes,
    removals,
    failOn(match, times = 1) {
      failMatch = match;
      failTimes = times;
    },
  };
}

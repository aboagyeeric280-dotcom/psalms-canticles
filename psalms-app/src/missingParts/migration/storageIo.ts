/* The storage surface migration is allowed to touch.
 *
 * Injected rather than reached for, so a test can make a write fail on demand
 * — a quota exhaustion that cannot be arranged against a real localStorage is
 * the difference between believing the rollback works and knowing it does.
 *
 * ── D8: THE LEGACY KEY IS READ-ONLY ─────────────────────────────────────────
 * `guarded()` wraps any store so that a write aimed at the separate Missing
 * Parts app's key throws instead of succeeding. Migration copies; it never
 * moves. The guard is belt and braces beside the architecture test: the test
 * proves no such call is written, the guard proves none can run.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { LEGACY_STORAGE_KEY } from '../data/storage';

export interface MigrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export class LegacyKeyWriteError extends Error {
  constructor(operation: string) {
    super(`Refusing to ${operation} ${LEGACY_STORAGE_KEY}: the legacy store is read-only.`);
    this.name = 'LegacyKeyWriteError';
  }
}

/** Wrap a store so nothing can write the legacy key through it. */
export function guarded(store: MigrationStorage): MigrationStorage {
  return {
    getItem: (key) => store.getItem(key),
    keys: () => store.keys(),
    setItem(key, value) {
      if (key === LEGACY_STORAGE_KEY) throw new LegacyKeyWriteError('write');
      store.setItem(key, value);
    },
    removeItem(key) {
      if (key === LEGACY_STORAGE_KEY) throw new LegacyKeyWriteError('remove');
      store.removeItem(key);
    },
  };
}

/** The browser's localStorage, guarded. Returns null where it is unavailable. */
export function browserStorage(): MigrationStorage | null {
  try {
    const probe = '__dpc_mp_io_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    return null;
  }
  return guarded({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
    keys: () => Object.keys(window.localStorage),
  });
}

/** True when a thrown error is the browser saying it is out of room. */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || /quota/i.test(error.message)
  );
}

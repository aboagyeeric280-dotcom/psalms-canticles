/* Local storage access for missing-parts material.
 *
 * ── D8: THE LEGACY KEY IS READ-ONLY ─────────────────────────────────────────
 * `the-missing-parts-entries-v1` belongs to the separate Missing Parts app,
 * which shares this origin. This module READS it and nothing else. There is no
 * code path anywhere in this tree that writes it, clears it or removes it —
 * migration copies, it never moves. A test asserts this, so that the legacy
 * app remains a working rollback indefinitely.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Preferences are not handled here: the app already has its own in
 * `src/utils/storage.ts` under the `dpc.` prefix, and this feature adds none.
 */

import { migrateStore, CURRENT_SCHEMA_VERSION, type MigrationReport } from './migrate';
import type { StoreFile } from './types';

/** Where the integrated app keeps its material. */
export const STORAGE_KEY = 'dpc.missing-parts.v1';

/** The separate Missing Parts app's key. READ ONLY — never written. */
export const LEGACY_STORAGE_KEY = 'the-missing-parts-entries-v1';

/** Prefix for quarantined copies of text that could not be parsed. */
export const QUARANTINE_PREFIX = 'dpc.missing-parts.unreadable-';

export interface LoadResult {
  file: StoreFile;
  report: MigrationReport;
  /** Set when stored data could not be parsed; a copy is kept under this key. */
  quarantineKey?: string;
  available: boolean;
}

function storage(): Storage | null {
  try {
    const probe = '__dpc_mp_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function emptyStore(): StoreFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entries: [],
    meta: { createdAt: new Date().toISOString() },
  };
}

/**
 * Read the legacy app's raw stored text.
 *
 * Returns the exact string, unparsed and unaltered, or null. This is the only
 * function in the codebase that touches the legacy key, and it only reads.
 */
export function readLegacyRaw(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Keep unreadable text under a timestamped key. Never overwrites the source. */
function quarantine(store: Storage, raw: string): string | undefined {
  const key = `${QUARANTINE_PREFIX}${new Date().toISOString()}`;
  try {
    store.setItem(key, raw);
    return key;
  } catch {
    // Out of space. The source key is still untouched, which is what matters.
    return undefined;
  }
}

export function loadStore(): LoadResult {
  const store = storage();
  if (!store) {
    return { file: emptyStore(), report: migrateStore(null).report, available: false };
  }

  const raw = store.getItem(STORAGE_KEY);
  if (raw === null) {
    return { file: emptyStore(), report: migrateStore(null).report, available: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Keep the unreadable text. Nothing is ever discarded silently.
    const quarantineKey = quarantine(store, raw);
    return {
      file: emptyStore(),
      report: migrateStore(null).report,
      quarantineKey,
      available: true,
    };
  }

  const { file, report } = migrateStore(parsed);
  return { file, report, available: true };
}

export function saveStore(file: StoreFile): { ok: boolean; error?: string } {
  const store = storage();
  if (!store) return { ok: false, error: 'This browser is not allowing the app to save data.' };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(file));
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'QuotaExceededError'
        ? 'This browser has run out of space for saved data. Export a backup, then remove some entries.'
        : 'Saving failed. Your existing saved material has not been changed.';
    return { ok: false, error: message };
  }
}

/** Approximate the space this feature is using, in UTF-16 code units. */
export function approximateStoredSize(): number {
  const store = storage();
  if (!store) return 0;
  let total = 0;
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (!key) continue;
    if (key !== STORAGE_KEY && !key.startsWith(QUARANTINE_PREFIX)) continue;
    total += key.length + (store.getItem(key)?.length ?? 0);
  }
  return total;
}

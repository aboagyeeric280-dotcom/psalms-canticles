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
 * ── BUNDLED ("published") ENTRIES ───────────────────────────────────────────
 * `publishedEntries.json` ships with the app and is merged in on every load.
 * It is never written to the device as-is, so a new bundle always wins over
 * an old copy. But the reader's own changes must win over the bundle:
 *   - a bundled entry the reader edits, reviews or acknowledges is saved as
 *     their own (same id, origin 'personal'), and from then on the bundled
 *     copy with that id is skipped;
 *   - a bundled entry the reader deletes is remembered in
 *     `meta.dismissedPublished`, so it does not come back on the next load.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Preferences are not handled here: the app already has its own in
 * `src/utils/storage.ts` under the `dpc.` prefix, and this feature adds none.
 */

import { migrateStore, CURRENT_SCHEMA_VERSION, type MigrationReport } from './migrate';
import type { StoreFile, Entry } from './types';
import publishedEntriesData from './publishedEntries.json';

export const STORAGE_KEY = 'dpc.missing-parts.v1';
export const LEGACY_STORAGE_KEY = 'the-missing-parts-entries-v1';
export const QUARANTINE_PREFIX = 'dpc.missing-parts.unreadable-';

const PUBLISHED_ENTRIES: Entry[] = publishedEntriesData as Entry[];
const PUBLISHED_BY_ID = new Map(PUBLISHED_ENTRIES.map((e) => [e.id, JSON.stringify(e)]));

export interface LoadResult {
  file: StoreFile;
  report: MigrationReport;
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

export function readLegacyRaw(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function quarantine(store: Storage, raw: string): string | undefined {
  const key = `${QUARANTINE_PREFIX}${new Date().toISOString()}`;
  try {
    store.setItem(key, raw);
    return key;
  } catch {
    return undefined;
  }
}

/** Merge bundled entries, skipping any the reader has made their own or deleted. */
function mergePublished(personal: Entry[], dismissed: readonly string[] = []): Entry[] {
  const skip = new Set([...personal.map((e) => e.id), ...dismissed]);
  return [...personal, ...PUBLISHED_ENTRIES.filter((e) => !skip.has(e.id))];
}

/** What of a file in memory belongs on the device. See the note at the top. */
export function personalPart(file: StoreFile): StoreFile {
  const present = new Set(file.entries.map((e) => e.id));
  const dismissed = new Set(file.meta.dismissedPublished ?? []);
  for (const id of PUBLISHED_BY_ID.keys()) if (!present.has(id)) dismissed.add(id);

  const entries: Entry[] = [];
  for (const entry of file.entries) {
    if (entry.origin !== 'published') { entries.push(entry); continue; }
    const bundled = PUBLISHED_BY_ID.get(entry.id);
    if (bundled !== undefined && bundled === JSON.stringify(entry)) continue; // untouched
    entries.push({ ...entry, origin: 'personal' }); // changed by the reader: theirs now
  }
  const meta = { ...file.meta };
  if (dismissed.size) meta.dismissedPublished = [...dismissed].sort();
  else delete meta.dismissedPublished;
  return { ...file, entries, meta };
}

export function loadStore(): LoadResult {
  const store = storage();
  if (!store) {
    const file = { ...emptyStore(), entries: [...PUBLISHED_ENTRIES] };
    return { file, report: migrateStore(null).report, available: false };
  }

  const raw = store.getItem(STORAGE_KEY);
  if (raw === null) {
    const file = { ...emptyStore(), entries: [...PUBLISHED_ENTRIES] };
    return { file, report: migrateStore(null).report, available: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const quarantineKey = quarantine(store, raw);
    const file = { ...emptyStore(), entries: [...PUBLISHED_ENTRIES] };
    return { file, report: migrateStore(null).report, quarantineKey, available: true };
  }

  const { file, report } = migrateStore(parsed);
  file.entries = mergePublished(file.entries, file.meta.dismissedPublished);
  return { file, report, available: true };
}

export function saveStore(file: StoreFile): { ok: boolean; error?: string } {
  const store = storage();
  if (!store) return { ok: false, error: 'This browser is not allowing the app to save data.' };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(personalPart(file)));
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'QuotaExceededError'
        ? 'This browser has run out of space for saved data. Export a backup, then remove some entries.'
        : 'Saving failed. Your existing saved material has not been changed.';
    return { ok: false, error: message };
  }
}

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

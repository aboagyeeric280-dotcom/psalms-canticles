import { migrateStore, CURRENT_SCHEMA_VERSION, type MigrationReport } from './migrate';
import type { StoreFile, Entry } from './types';
import publishedEntriesData from './publishedEntries.json';

export const STORAGE_KEY = 'dpc.missing-parts.v1';
export const LEGACY_STORAGE_KEY = 'the-missing-parts-entries-v1';
export const QUARANTINE_PREFIX = 'dpc.missing-parts.unreadable-';

const PUBLISHED_ENTRIES: Entry[] = publishedEntriesData as Entry[];

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

/** Merge published entries, skipping any whose id already exists in personal entries. */
function mergePublished(personal: Entry[]): Entry[] {
  const personalIds = new Set(personal.map((e) => e.id));
  const newPublished = PUBLISHED_ENTRIES.filter((e) => !personalIds.has(e.id));
  return [...personal, ...newPublished];
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
  file.entries = mergePublished(file.entries);
  return { file, report, available: true };
}

export function saveStore(file: StoreFile): { ok: boolean; error?: string } {
  const store = storage();
  if (!store) return { ok: false, error: 'This browser is not allowing the app to save data.' };
  try {
    // Never persist published entries to localStorage — they come from the bundle.
    const personal: StoreFile = {
      ...file,
      entries: file.entries.filter((e) => e.origin !== 'published'),
    };
    store.setItem(STORAGE_KEY, JSON.stringify(personal));
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

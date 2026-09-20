/* Application state for missing-parts material.
 *
 * A single module-level store so every screen sees the same entries, with
 * `useSyncExternalStore` for React. Every mutation writes through to
 * localStorage immediately and reports failure rather than losing the change.
 *
 * ── THE TEXT RULE (§F) ──────────────────────────────────────────────────────
 * `saveSection` writes what it is given, exactly. The implementation this is
 * ported from trimmed every field on the way in, which meant the live editing
 * path quietly stripped the reader's leading and trailing whitespace on every
 * save. That trim is gone.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Preferences and example seed material are deliberately absent: the app has
 * its own preferences under `dpc.`, and no placeholder liturgical or
 * scriptural wording ships in the production reader (D10).
 *
 * Headless on purpose. The React binding lives next door in useAppState.ts,
 * which is the only module in this tree allowed to import React; a test
 * enforces that, so the store and the resolver stay usable and testable
 * without a renderer.
 */

import type { ISODate } from '../data/iso';
import type { Hour, PsalterWeek, Season } from '../data/day';
import { newId, type MigrationReport } from '../data/migrate';
import { loadStore, saveStore } from '../data/storage';
import {
  EMPTY_CONTENT,
  SECTIONS,
  SECTION_META,
  entryIsEmpty,
  keyId,
  sectionHasContent,
  type CalendarScope,
  type CelebrationRank,
  type Entry,
  type EntryContent,
  type KeyType,
  type SectionId,
  type StoreFile,
} from '../data/types';
import { applyImport, type ImportOptions, type ImportPreview, type ImportSummary } from '../data/backup';

export interface AppState {
  file: StoreFile;
  storageAvailable: boolean;
  quarantineKey?: string;
  migration: MigrationReport;
  saveError?: string;
}

function initialState(): AppState {
  const loaded = loadStore();
  return {
    file: loaded.file,
    storageAvailable: loaded.available,
    quarantineKey: loaded.quarantineKey,
    migration: loaded.report,
  };
}

let state: AppState = initialState();
const listeners = new Set<() => void>();

function emit(next: Partial<AppState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/* Writing through reports whether it worked, so nothing above this can
   announce a save that did not happen. */
function commit(file: StoreFile): { ok: boolean; error?: string } {
  const result = saveStore(file);
  emit({ file, saveError: result.ok ? undefined : result.error });
  return result;
}

/** What a write attempt did. `ok` is false when storage refused it. */
export interface WriteResult {
  ok: boolean;
  entry?: Entry;
  error?: string;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): AppState {
  return state;
}

/** Reload from storage. Used by tests and after a migration. */
export function reloadFromStorage(): void {
  state = initialState();
  for (const listener of listeners) listener();
}

export function dismissSaveError(): void {
  emit({ saveError: undefined });
}

export interface EntryKeyInput {
  keyType: KeyType;
  hour: Hour;
  season?: Season;
  psalterWeek?: PsalterWeek;
  weekday?: number;
  weekOfSeason?: number;
  celebrationId?: string;
  celebrationName?: string;
  celebrationRank?: CelebrationRank;
  calendarScope?: CalendarScope;
  celebrationMonth?: number;
  celebrationDay?: number;
  date?: ISODate;
}

function keyFields(key: EntryKeyInput): Partial<Entry> {
  switch (key.keyType) {
    case 'date':
      return { keyType: 'date', hour: key.hour, date: key.date };
    case 'celebration':
      return {
        keyType: 'celebration',
        hour: key.hour,
        celebrationId: key.celebrationId,
        celebrationName: key.celebrationName,
        celebrationRank: key.celebrationRank,
        calendarScope: key.calendarScope,
        celebrationMonth: key.celebrationMonth,
        celebrationDay: key.celebrationDay,
      };
    case 'week':
      return { keyType: 'week', hour: key.hour, season: key.season, weekOfSeason: key.weekOfSeason };
    case 'psalter':
    default:
      return {
        keyType: 'psalter',
        hour: key.hour,
        season: key.season,
        psalterWeek: key.psalterWeek,
        weekday: key.weekday,
      };
  }
}

export function findByKey(key: EntryKeyInput): Entry | undefined {
  const target = keyId(key as Entry);
  return state.file.entries.find((entry) => keyId(entry) === target);
}

/**
 * Write one section against one key, creating the record if needed and leaving
 * every other section of that record untouched.
 *
 * The text arrives and is stored exactly as given (§F).
 */
export function saveSection(
  key: EntryKeyInput,
  section: SectionId,
  content: Partial<EntryContent>,
): WriteResult {
  const now = new Date().toISOString();
  const fields = SECTION_META[section].fields;
  const patch: Partial<EntryContent> = {};
  for (const field of fields) patch[field] = content[field] ?? '';

  const existing = findByKey(key);

  if (existing) {
    const updated: Entry = { ...existing, ...patch, updatedAt: now };
    delete updated.needsReview;
    delete updated.reviewNote;
    /* A record emptied of every section is KEPT and flagged, not dropped. It
       may still carry the reader's note and fields a later version wrote, and
       the data contract is that nothing is discarded without being said. */
    if (entryIsEmpty(updated)) flagAsContentFree(updated);
    const entries = state.file.entries.map((entry) => (entry.id === existing.id ? updated : entry));
    const result = commit({ ...state.file, entries });
    return { ok: result.ok, entry: result.ok ? updated : undefined, error: result.error };
  }

  const created: Entry = {
    ...EMPTY_CONTENT,
    ...keyFields(key),
    ...patch,
    id: newId(),
    keyType: key.keyType,
    hour: key.hour,
    origin: 'personal',
    createdAt: now,
    updatedAt: now,
  } as Entry;

  if (entryIsEmpty(created)) {
    return { ok: false, error: 'There was nothing in the box, so nothing was saved.' };
  }
  const result = commit({ ...state.file, entries: [...state.file.entries, created] });
  return { ok: result.ok, entry: result.ok ? created : undefined, error: result.error };
}

/** The note left on a record whose every section has been cleared. */
export const CONTENT_FREE_NOTE =
  'Every section of this record has been cleared. It has been kept rather than discarded, in case its key or note is still wanted.';

function flagAsContentFree(entry: Entry): void {
  entry.needsReview = true;
  entry.reviewNote = CONTENT_FREE_NOTE;
}

/**
 * Clear one section of a record, leaving its other sections alone.
 *
 * A record left with nothing in any section is kept and flagged. Dropping it
 * would discard the reader's note, its key and anything a later version of
 * the app had written into it, without ever saying so.
 */
export function clearSection(entryId: string, section: SectionId): WriteResult {
  const existing = state.file.entries.find((entry) => entry.id === entryId);
  if (!existing) return { ok: false, error: 'That record is no longer here.' };
  const patch: Partial<EntryContent> = {};
  for (const field of SECTION_META[section].fields) patch[field] = '';
  const updated: Entry = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  if (entryIsEmpty(updated)) flagAsContentFree(updated);
  else { delete updated.needsReview; delete updated.reviewNote; }
  const entries = state.file.entries.map((entry) => (entry.id === entryId ? updated : entry));
  const result = commit({ ...state.file, entries });
  return { ok: result.ok, entry: result.ok ? updated : undefined, error: result.error };
}

/** Full-record save, used by the entry editor in the Library. */
export function saveEntry(entry: Entry): void {
  const now = new Date().toISOString();
  const exists = state.file.entries.some((item) => item.id === entry.id);
  const cleaned: Entry = { ...entry, updatedAt: now };
  delete cleaned.needsReview;
  delete cleaned.reviewNote;
  const entries = exists
    ? state.file.entries.map((item) => (item.id === entry.id ? cleaned : item))
    : [...state.file.entries, { ...cleaned, createdAt: cleaned.createdAt || now }];
  commit({ ...state.file, entries });
}

export function deleteEntry(id: string): void {
  commit({ ...state.file, entries: state.file.entries.filter((entry) => entry.id !== id) });
}

export function duplicateEntry(id: string): Entry | undefined {
  const source = state.file.entries.find((entry) => entry.id === id);
  if (!source) return undefined;
  const now = new Date().toISOString();
  /* The copy deliberately keeps the same key: the Library flags it as sharing
     a key until the reader gives it one of its own. */
  const copy: Entry = { ...source, id: newId(), createdAt: now, updatedAt: now };
  commit({ ...state.file, entries: [...state.file.entries, copy] });
  return copy;
}

export function markExported(at = new Date().toISOString()): void {
  commit({ ...state.file, meta: { ...state.file.meta, lastExportAt: at } });
}

export function commitImport(preview: ImportPreview, options: ImportOptions): ImportSummary {
  const { entries, summary } = applyImport(state.file.entries, preview, options);
  commit({ ...state.file, entries });
  return summary;
}

export function sectionCount(entry: Entry): number {
  return SECTIONS.filter((section) => sectionHasContent(entry, section)).length;
}

/* ------------------------------------------------- editing a known record */

/**
 * Write one section of ONE record, named by its own id.
 *
 * The Library and the Review screen edit a record the reader has picked out
 * of a list, and two records can share a key — so finding by key would edit
 * whichever happened to come first. Everything else about the record is left
 * exactly as it was: its other sections, its key, its note, and any field a
 * later version of the app wrote that this one does not understand.
 *
 * The review flag is deliberately NOT cleared here. Editing the wording of a
 * record does not resolve a duplicate key or an unknown celebration, and a
 * flag that disappears when you touch the record is a flag that hides things.
 * Acknowledging is its own explicit action below.
 */
export function saveSectionOn(
  entryId: string,
  section: SectionId,
  content: Partial<EntryContent>,
): WriteResult {
  const existing = state.file.entries.find((entry) => entry.id === entryId);
  if (!existing) return { ok: false, error: 'That record is no longer here.' };

  const patch: Partial<EntryContent> = {};
  for (const field of SECTION_META[section].fields) patch[field] = content[field] ?? '';

  const updated: Entry = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  if (entryIsEmpty(updated)) flagAsContentFree(updated);

  const entries = state.file.entries.map((entry) => (entry.id === entryId ? updated : entry));
  const result = commit({ ...state.file, entries });
  return { ok: result.ok, entry: result.ok ? updated : undefined, error: result.error };
}

/**
 * Record that the reader has looked at a flagged record.
 *
 * The explanation is kept, a timestamp is added, and the flag comes off. It
 * can be put back. Problems worked out from the data itself — a shared key,
 * a celebration this calendar does not carry — are untouched by this and go
 * on being reported until the data changes.
 */
export function acknowledgeReview(entryId: string, at = new Date().toISOString()): WriteResult {
  const existing = state.file.entries.find((entry) => entry.id === entryId);
  if (!existing) return { ok: false, error: 'That record is no longer here.' };
  const updated: Entry = { ...existing, reviewedAt: at };
  delete updated.needsReview;
  const entries = state.file.entries.map((entry) => (entry.id === entryId ? updated : entry));
  const result = commit({ ...state.file, entries });
  return { ok: result.ok, entry: result.ok ? updated : undefined, error: result.error };
}

/** Put a review flag back, for a reader who acknowledged too quickly. */
export function unacknowledgeReview(entryId: string): WriteResult {
  const existing = state.file.entries.find((entry) => entry.id === entryId);
  if (!existing) return { ok: false, error: 'That record is no longer here.' };
  const updated: Entry = { ...existing, needsReview: true };
  delete updated.reviewedAt;
  const entries = state.file.entries.map((entry) => (entry.id === entryId ? updated : entry));
  const result = commit({ ...state.file, entries });
  return { ok: result.ok, entry: result.ok ? updated : undefined, error: result.error };
}

/* JSON backup: export, validation, preview and import.
 *
 * Import is a two-step operation on purpose. `analyseImport` only reads and
 * reports; nothing is written until `applyImport` is called with the user's
 * choice. If validation fails the caller has nothing to apply, so the current
 * data cannot be touched.
 *
 * ── THE TEXT RULE (§F) ──────────────────────────────────────────────────────
 * `sectionText` compares wording EXACTLY. The implementation this is ported
 * from trimmed each field before comparing, which meant two records differing
 * only in leading or trailing whitespace were treated as identical and one was
 * silently kept over the other. Comparison is now byte-for-byte, and a
 * difference that is only whitespace is reported as its own kind of conflict
 * so the reader is told without being alarmed.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { CURRENT_SCHEMA_VERSION, newId, normaliseEntry } from './migrate';
import {
  SECTIONS,
  SECTION_META,
  keyId,
  sectionHasContent,
  type Entry,
  type EntryContent,
  type SectionId,
  type StoreFile,
} from './types';
import { describeKey } from './resolve';

/** What this app writes into its own exports. */
export const BACKUP_APP_ID = 'psalms-canticles-missing-parts';

/** Exports from the separate Missing Parts app, accepted without complaint. */
export const LEGACY_BACKUP_APP_ID = 'the-missing-parts';

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  entryCount: number;
  entries: Entry[];
}

export function buildBackup(file: StoreFile, now = new Date()): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    entryCount: file.entries.length,
    entries: file.entries,
  };
}

export function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `missing-parts-backup-${stamp}.json`;
}

/**
 * The text of one section, for comparing two records.
 *
 * Exact. No trimming: see the text rule above.
 */
export function sectionText(entry: Pick<Entry, keyof EntryContent>, section: SectionId): string {
  return SECTION_META[section].fields
    .map((field) => String(entry[field] ?? ''))
    .join('\u0001');
}

/** Collapse runs of blank space, for asking whether a difference is visible. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** How two versions of one section differ. */
export type SectionComparison = 'identical' | 'whitespace-only' | 'wording';

/**
 * Compare one section of two records. Pure, and the ONE implementation.
 *
 * Both import and migration classify with this, so the two cannot drift into
 * disagreeing about what counts as a conflict.
 *
 * Compared field by field on purpose. The fields are joined with a separator
 * for equality testing, and that separator is not whitespace, so trailing
 * space at the end of one field would read as an internal difference once
 * joined.
 */
export function classifySection(
  a: Pick<Entry, keyof EntryContent>,
  b: Pick<Entry, keyof EntryContent>,
  section: SectionId,
): SectionComparison {
  let sawDifference = false;
  let visibleDifference = false;
  for (const field of SECTION_META[section].fields) {
    const left = String(a[field] ?? '');
    const right = String(b[field] ?? '');
    if (left === right) continue;
    sawDifference = true;
    if (collapseWhitespace(left) !== collapseWhitespace(right)) visibleDifference = true;
  }
  if (!sawDifference) return 'identical';
  return visibleDifference ? 'wording' : 'whitespace-only';
}

/** The overall kind of a set of per-section comparisons. */
export function classifyConflict(comparisons: SectionComparison[]): ConflictKind {
  return comparisons.every((c) => c === 'whitespace-only') ? 'whitespace-only' : 'wording';
}

function copySection(from: Entry, to: Entry, section: SectionId): void {
  for (const field of SECTION_META[section].fields) {
    (to as unknown as Record<string, unknown>)[field] = from[field];
  }
}

export type ConflictKind = 'wording' | 'whitespace-only';

export interface ImportConflict {
  key: string;
  description: string;
  /** Every section whose stored text differs. */
  sections: SectionId[];
  /** The subset of those differing only in blank space. */
  whitespaceOnlySections: SectionId[];
  /** 'whitespace-only' when every difference is invisible. */
  kind: ConflictKind;
  existing: Entry;
  incoming: Entry;
}

export interface ImportPreview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  entries: Entry[];
  skipped: number;
  duplicatesInFile: number;
  exportedAt?: string;
  schemaVersion?: number;
  conflicts: ImportConflict[];
  /** Records whose key is not already present. */
  newRecords: number;
  /** Records that would add sections to an existing record. */
  enrichedRecords: number;
  unchangedRecords: number;
}

export function analyseImport(text: string, existing: Entry[]): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyPreview(['This file is not valid JSON, so nothing can be read from it.']);
  }

  let rawEntries: unknown[] | null = null;
  let exportedAt: string | undefined;
  let schemaVersion: number | undefined;

  if (Array.isArray(parsed)) {
    rawEntries = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.entries)) rawEntries = record.entries;
    if (typeof record.exportedAt === 'string') exportedAt = record.exportedAt;
    if (typeof record.schemaVersion === 'number') schemaVersion = record.schemaVersion;
    if (
      typeof record.app === 'string' &&
      record.app !== BACKUP_APP_ID &&
      record.app !== LEGACY_BACKUP_APP_ID
    ) {
      warnings.push(`This backup says it came from “${record.app}”, which is not an app this reader knows.`);
    }
  }

  if (!rawEntries) {
    return emptyPreview([
      'No list of entries was found in this file. A backup from this app has an “entries” list.',
    ]);
  }

  if (schemaVersion !== undefined && schemaVersion > CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `This backup was made by a newer version of the app (schema ${schemaVersion}). Anything this version does not understand is kept but not shown.`,
    );
  }

  const entries: Entry[] = [];
  const seen = new Map<string, Entry>();
  let skipped = 0;
  let duplicatesInFile = 0;

  rawEntries.forEach((raw, index) => {
    const { entry, problems } = normaliseEntry(raw, `Entry ${index + 1}`);
    if (!entry || problems.length > 0) {
      skipped += 1;
      warnings.push(...problems.slice(0, 1));
      if (!entry) return;
      if (problems.some((problem) => problem.includes('no reading'))) return;
    }
    const key = keyId(entry);
    const previous = seen.get(key);
    if (previous) {
      duplicatesInFile += 1;
      // Fold a duplicate inside the file into the first record, section by section.
      for (const section of SECTIONS) {
        if (!sectionHasContent(previous, section) && sectionHasContent(entry, section)) {
          copySection(entry, previous, section);
        }
      }
      return;
    }
    seen.set(key, entry);
    entries.push(entry);
  });

  if (entries.length === 0) {
    return emptyPreview(
      ['This file contains no usable entries, so there is nothing to import.'],
      warnings,
    );
  }

  if (duplicatesInFile > 0) {
    warnings.push(`${duplicatesInFile} record(s) in the file share a key; they were combined.`);
  }
  if (skipped > 0) {
    warnings.push(`${skipped} record(s) could not be read and will be left out.`);
  }

  const existingByKey = new Map(existing.map((entry) => [keyId(entry), entry]));
  const conflicts: ImportConflict[] = [];
  let newRecords = 0;
  let enrichedRecords = 0;
  let unchangedRecords = 0;

  for (const incoming of entries) {
    const match = existingByKey.get(keyId(incoming));
    if (!match) {
      newRecords += 1;
      continue;
    }
    const differing: SectionId[] = [];
    const whitespaceOnly: SectionId[] = [];
    let adds = false;
    for (const section of SECTIONS) {
      const hasIncoming = sectionHasContent(incoming, section);
      const hasExisting = sectionHasContent(match, section);
      if (hasIncoming && !hasExisting) {
        adds = true;
        continue;
      }
      const comparison = classifySection(incoming, match, section);
      if (comparison === 'identical') continue;
      // Both sides may be visibly empty yet hold different blank space.
      if (!hasIncoming && !hasExisting) {
        differing.push(section);
        whitespaceOnly.push(section);
        continue;
      }
      if (hasIncoming && hasExisting) {
        differing.push(section);
        if (comparison === 'whitespace-only') whitespaceOnly.push(section);
      }
    }
    if (differing.length > 0) {
      conflicts.push({
        key: keyId(incoming),
        description: describeKey(incoming),
        sections: differing,
        whitespaceOnlySections: whitespaceOnly,
        kind: whitespaceOnly.length === differing.length ? 'whitespace-only' : 'wording',
        existing: match,
        incoming,
      });
    } else if (adds) {
      enrichedRecords += 1;
    } else {
      unchangedRecords += 1;
    }
  }

  return {
    ok: true,
    errors,
    warnings,
    entries,
    skipped,
    duplicatesInFile,
    exportedAt,
    schemaVersion,
    conflicts,
    newRecords,
    enrichedRecords,
    unchangedRecords,
  };
}

function emptyPreview(errors: string[], warnings: string[] = []): ImportPreview {
  return {
    ok: false,
    errors,
    warnings,
    entries: [],
    skipped: 0,
    duplicatesInFile: 0,
    conflicts: [],
    newRecords: 0,
    enrichedRecords: 0,
    unchangedRecords: 0,
  };
}

export type ImportMode = 'merge' | 'replace';
export type ConflictWinner = 'existing' | 'imported';

export interface ImportSummary {
  mode: ImportMode;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  conflicts: number;
  conflictWinner: ConflictWinner;
  total: number;
}

export interface ImportOptions {
  mode: ImportMode;
  conflictWinner: ConflictWinner;
}

/**
 * Produce the new entry list. Pure: the caller decides whether to commit it.
 * Merge keeps every existing record and fills in sections it does not have.
 */
export function applyImport(
  existing: Entry[],
  preview: ImportPreview,
  options: ImportOptions,
): { entries: Entry[]; summary: ImportSummary } {
  const now = new Date().toISOString();

  if (options.mode === 'replace') {
    const entries = preview.entries.map((entry) => ({ ...entry, updatedAt: entry.updatedAt || now }));
    return {
      entries,
      summary: {
        mode: 'replace',
        added: entries.length,
        updated: 0,
        unchanged: 0,
        removed: existing.length,
        conflicts: preview.conflicts.length,
        conflictWinner: options.conflictWinner,
        total: entries.length,
      },
    };
  }

  const result = existing.map((entry) => ({ ...entry }));
  const byKey = new Map(result.map((entry) => [keyId(entry), entry]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of preview.entries) {
    const match = byKey.get(keyId(incoming));
    if (!match) {
      const copy: Entry = { ...incoming, id: byId(result, incoming.id) ? newId() : incoming.id };
      result.push(copy);
      byKey.set(keyId(copy), copy);
      added += 1;
      continue;
    }
    let touched = false;
    for (const section of SECTIONS) {
      const hasIncoming = sectionHasContent(incoming, section);
      if (!hasIncoming) continue;
      const hasExisting = sectionHasContent(match, section);
      if (!hasExisting) {
        copySection(incoming, match, section);
        touched = true;
      } else if (
        sectionText(incoming, section) !== sectionText(match, section) &&
        options.conflictWinner === 'imported'
      ) {
        copySection(incoming, match, section);
        touched = true;
      }
    }
    if (touched) {
      match.updatedAt = now;
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  return {
    entries: result,
    summary: {
      mode: 'merge',
      added,
      updated,
      unchanged,
      removed: 0,
      conflicts: preview.conflicts.length,
      conflictWinner: options.conflictWinner,
      total: result.length,
    },
  };
}

function byId(entries: Entry[], id: string): Entry | undefined {
  return entries.find((entry) => entry.id === id);
}

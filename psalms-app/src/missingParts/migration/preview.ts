/* Reading the legacy store and reporting what migrating it would do.
 *
 * ── PURE ────────────────────────────────────────────────────────────────────
 * Nothing in this module writes, removes or mutates anything. It reads the two
 * stores, works entirely in memory, and returns a report. Not one byte is
 * committed until `commitMigration` is called with the reader's explicit
 * confirmation and evidence that a backup exists. Even unreadable data is only
 * REPORTED here; quarantining it is a write, so it happens at commit.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { liturgicalToday } from '../../utils/generalCalendar';
import { buildCelebrationIndex, resolveCelebrationId } from '../adapter/celebrationIds';
import { missingPartsDay } from '../adapter/day';
import type { MissingPartsDay } from '../data/day';
import { entryMatchesDay } from '../data/resolve';
import { CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION, migrateStore } from '../data/migrate';
import type { MigrationReport } from '../data/migrate';
import { SECTIONS, keyId, sectionHasContent, type Entry, type SectionId } from '../data/types';
import { describeKey } from '../data/resolve';
import {
  classifyConflict, classifySection,
  type ImportConflict, type SectionComparison,
} from '../data/backup';
import type { ISODate } from '../data/iso';
import { legacyDayFor } from './legacyPsalter';
import { checksum, DESTINATION_KEY, IN_PROGRESS_KEY, RECEIPT_KEY, SOURCE_KEY,
  type InProgressMarker, type MigrationReceipt } from './keys';
import type { MigrationStorage } from './storageIo';

/** How far ahead to look when asking whether a record still applies. */
export const RESOLUTION_WINDOW_DAYS = 365 * 3;

export interface MigrationSource {
  key: string;
  raw: string;
  checksum: string;
}

export type Resolvability = 'resolves' | 'never' | 'past';

export interface RecordPreview {
  entry: Entry;
  description: string;
  /** Against what is already in the destination. */
  status: 'new' | 'enriched' | 'unchanged' | 'conflict';
  reKeyed: boolean;
  holyWeekConverted: boolean;
  celebrationIdChanged?: { from: string; to: string };
  ambiguousCelebration?: string[];
  unknownCelebration?: string;
  /** Dates this record used to apply on, and now does not, and vice versa. */
  coverageChanged?: { lost: ISODate[]; gained: ISODate[] };
  resolvable: Resolvability;
  needsReview: boolean;
  reviewNote?: string;
}

export interface QuotaEstimate {
  /** UTF-16 code units the destination, snapshot and receipt would occupy. */
  neededChars: number;
  /** What this feature's keys already occupy. */
  currentChars: number;
}

export interface MigrationTotals {
  found: number;
  unchanged: number;
  reKeyed: number;
  coverageChanged: number;
  needsReview: number;
  conflicts: number;
  wouldNotResolve: number;
  pastDates: number;
  holyWeekConverted: number;
  celebrationsReKeyed: number;
  celebrationsAmbiguous: number;
  celebrationsUnknown: number;
  contentFreeKept: number;
}

export interface MigrationPreview {
  ok: boolean;
  errors: string[];
  warnings: string[];
  source?: MigrationSource;
  fromSchemaVersion: number;
  toSchemaVersion: number;
  entries: Entry[];
  records: RecordPreview[];
  conflicts: ImportConflict[];
  totals: MigrationTotals;
  quota: QuotaEstimate;
  report?: MigrationReport;
  /** The source is unreadable. Commit will quarantine it; preview will not. */
  corrupt: boolean;
  /** The source declares a schema this version does not understand. */
  futureSchema: boolean;
  /** A receipt already records this exact source. */
  alreadyMigrated: boolean;
  /** An earlier attempt did not finish. */
  interrupted?: InProgressMarker;
}

export interface PreviewOptions {
  /** Reference date for the resolution window. Defaults to today. */
  now?: Date;
  /** Narrower window for tests. The three-year default is the real one. */
  windowDays?: number;
  /** Seam for tests: how a date becomes a liturgical day. */
  dayResolver?: DayResolver;
}

/** Read the legacy store without touching it. */
export function detectLegacyData(store: MigrationStorage): MigrationSource | null {
  const raw = store.getItem(SOURCE_KEY);
  if (raw === null || raw === '') return null;
  return { key: SOURCE_KEY, raw, checksum: checksum(raw) };
}

function readJson<T>(store: MigrationStorage, key: string): T | undefined {
  const raw = store.getItem(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function currentUsage(store: MigrationStorage): number {
  let total = 0;
  for (const key of store.keys()) {
    if (!key.startsWith('dpc.missing-parts')) continue;
    total += key.length + (store.getItem(key)?.length ?? 0);
  }
  return total;
}

function isoOf(date: Date): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** One day of the comparison window, worked out once and reused. */
export interface CoverageDay {
  iso: ISODate;
  day: MissingPartsDay;
  legacy: ReturnType<typeof legacyDayFor>;
}

export type DayResolver = (when: Date) => MissingPartsDay;

const defaultDayResolver: DayResolver = (when) => missingPartsDay(liturgicalToday(when));

/**
 * Work the window out ONCE per preview.
 *
 * The liturgical day for a date does not depend on which record is asking, so
 * computing it per record multiplied the calendar work by the number of
 * records — three years of calendar for every psalter entry in the store. The
 * window is now built once and every record reads from it, which makes the
 * cost proportional to the window rather than to window times records.
 */
export function buildCoverageWindow(
  from: Date,
  windowDays: number,
  resolveDay: DayResolver = defaultDayResolver,
): CoverageDay[] {
  const window: CoverageDay[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const when = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    window.push({ iso: isoOf(when), day: resolveDay(when), legacy: legacyDayFor(when) });
  }
  return window;
}

/**
 * Which dates a record applies on under each rule.
 *
 * The book's rule governs; the legacy rule is only the yardstick for saying
 * what moved. Compared over a window rather than for ever, because a psalter
 * key recurs indefinitely and three years is enough to show any difference.
 */
function coverageFor(entry: Entry, window: CoverageDay[]) {
  const production: ISODate[] = [];
  const legacy: ISODate[] = [];
  for (const { iso, day, legacy: legacyDay } of window) {
    if (entryMatchesDay(entry, day, entry.hour)) production.push(iso);
    if (
      entry.keyType === 'psalter'
      && entry.season === legacyDay.season
      && entry.psalterWeek === legacyDay.psalterWeek
      && entry.weekday === legacyDay.weekday
    ) {
      legacy.push(iso);
    }
  }
  return { production, legacy };
}

/**
 * Read the legacy store and report, exactly, what migrating would do.
 *
 * Writes nothing. The returned entries are the normalised, schema-4 form the
 * reader would get; they exist in memory only until the commit is confirmed.
 */
export function previewMigration(
  store: MigrationStorage,
  options: PreviewOptions = {},
): MigrationPreview {
  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? RESOLUTION_WINDOW_DAYS;
  const errors: string[] = [];
  const warnings: string[] = [];

  const emptyTotals: MigrationTotals = {
    found: 0, unchanged: 0, reKeyed: 0, coverageChanged: 0, needsReview: 0,
    conflicts: 0, wouldNotResolve: 0, pastDates: 0, holyWeekConverted: 0,
    celebrationsReKeyed: 0, celebrationsAmbiguous: 0, celebrationsUnknown: 0,
    contentFreeKept: 0,
  };
  const quota: QuotaEstimate = { neededChars: 0, currentChars: currentUsage(store) };

  const receipt = readJson<MigrationReceipt>(store, RECEIPT_KEY);
  const interrupted = readJson<InProgressMarker>(store, IN_PROGRESS_KEY);

  const source = detectLegacyData(store);
  if (!source) {
    return {
      ok: false, errors: ['There is no material from the separate Missing Parts app on this device.'],
      warnings, fromSchemaVersion: 0, toSchemaVersion: CURRENT_SCHEMA_VERSION,
      entries: [], records: [], conflicts: [], totals: emptyTotals, quota,
      corrupt: false, futureSchema: false, alreadyMigrated: false, interrupted,
    };
  }

  const alreadyMigrated = Boolean(receipt && receipt.sourceChecksum === source.checksum);

  let parsed: unknown;
  try {
    parsed = JSON.parse(source.raw);
  } catch {
    return {
      ok: false,
      errors: ['The material saved by the separate Missing Parts app cannot be read as JSON. Nothing has been changed, and nothing will be: confirming will keep a copy of the unreadable text under its own key and leave the original exactly where it is.'],
      warnings, source, fromSchemaVersion: 0, toSchemaVersion: CURRENT_SCHEMA_VERSION,
      entries: [], records: [], conflicts: [], totals: emptyTotals, quota,
      corrupt: true, futureSchema: false, alreadyMigrated, interrupted,
    };
  }

  const declaredVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Number((parsed as Record<string, unknown>).schemaVersion) || 0
    : 0;

  /* A schema from the future is a blocking condition, not a warning.
     Normalising it would mean interpreting fields this version cannot see,
     and writing the result back — even under its own higher version number —
     would be a rewrite. So nothing is normalised: the preview stops here,
     carrying the raw source so a verbatim backup can still be taken. */
  if (declaredVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`This material was written by a newer version of the app (schema ${declaredVersion}). This version does not understand it and will not change it. You can still export a byte-for-byte copy.`],
      warnings, source, fromSchemaVersion: declaredVersion, toSchemaVersion: CURRENT_SCHEMA_VERSION,
      entries: [], records: [], conflicts: [], totals: emptyTotals, quota,
      corrupt: false, futureSchema: true, alreadyMigrated, interrupted,
    };
  }

  const index = buildCelebrationIndex();
  const { file, report } = migrateStore(parsed, {
    resolveCelebration: (value) => resolveCelebrationId(value, index),
  });
  warnings.push(...report.problems);

  const coverageWindow = buildCoverageWindow(now, windowDays, options.dayResolver);

  // What is already in the destination, so nothing is silently overwritten.
  const existing = readJson<{ entries?: Entry[] }>(store, DESTINATION_KEY)?.entries ?? [];
  const existingByKey = new Map(existing.map((entry) => [keyId(entry), entry]));

  const conflicts: ImportConflict[] = [];
  const records: RecordPreview[] = [];
  const totals: MigrationTotals = { ...emptyTotals, found: report.entriesIn };

  for (const entry of file.entries) {
    const match = existingByKey.get(keyId(entry));
    let status: RecordPreview['status'] = 'new';
    if (match) {
      /* Classified with the same pure comparator import uses, so the two
         cannot drift into disagreeing about what counts as a conflict. */
      const differing: SectionId[] = [];
      const whitespaceOnly: SectionId[] = [];
      const comparisons: SectionComparison[] = [];
      let adds = false;
      for (const section of SECTIONS) {
        const hasIncoming = sectionHasContent(entry, section);
        const hasExisting = sectionHasContent(match, section);
        if (hasIncoming && !hasExisting) { adds = true; continue; }
        if (!hasIncoming && !hasExisting) continue;
        const comparison = classifySection(entry, match, section);
        if (comparison === 'identical') continue;
        differing.push(section);
        comparisons.push(comparison);
        if (comparison === 'whitespace-only') whitespaceOnly.push(section);
      }
      if (differing.length > 0) {
        status = 'conflict';
        conflicts.push({
          key: keyId(entry), description: describeKey(entry), sections: differing,
          whitespaceOnlySections: whitespaceOnly, kind: classifyConflict(comparisons),
          existing: match, incoming: entry,
        });
      } else {
        status = adds ? 'enriched' : 'unchanged';
      }
    }

    const { production, legacy } = coverageFor(entry, coverageWindow);
    const lost = legacy.filter((iso) => !production.includes(iso));
    const gained = production.filter((iso) => !legacy.includes(iso));
    const coverageChanged = entry.keyType === 'psalter' && (lost.length > 0 || gained.length > 0)
      ? { lost: lost.slice(0, 4), gained: gained.slice(0, 4) }
      : undefined;

    let resolvable: Resolvability = production.length > 0 ? 'resolves' : 'never';
    if (resolvable === 'never' && entry.keyType === 'date' && entry.date && entry.date < isoOf(now)) {
      resolvable = 'past';
    }

    const holyWeekConverted = entry.season === 'holyweek'
      && Boolean(entry.reviewNote?.includes('Lent, week 6'));

    const record: RecordPreview = {
      entry,
      description: describeKey(entry),
      status,
      reKeyed: holyWeekConverted,
      holyWeekConverted,
      coverageChanged,
      resolvable,
      needsReview: Boolean(entry.needsReview),
      reviewNote: entry.reviewNote,
    };
    records.push(record);

    if (status === 'unchanged') totals.unchanged += 1;
    if (record.reKeyed) totals.reKeyed += 1;
    if (coverageChanged) totals.coverageChanged += 1;
    if (record.needsReview) totals.needsReview += 1;
    if (resolvable === 'never') totals.wouldNotResolve += 1;
    if (resolvable === 'past') totals.pastDates += 1;
    if (holyWeekConverted) totals.holyWeekConverted += 1;
  }

  totals.conflicts = conflicts.length;
  totals.celebrationsReKeyed = report.celebrationsReKeyed;
  totals.celebrationsAmbiguous = report.celebrationsAmbiguous;
  totals.celebrationsUnknown = report.celebrationsUnknown;
  totals.contentFreeKept = report.contentFreeKept;
  totals.reKeyed += report.celebrationsReKeyed;

  const projected = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, entries: file.entries, meta: file.meta });
  quota.neededChars = projected.length + source.raw.length + 512;

  return {
    ok: true,
    errors,
    warnings,
    source,
    fromSchemaVersion: declaredVersion || LEGACY_SCHEMA_VERSION,
    toSchemaVersion: CURRENT_SCHEMA_VERSION,
    entries: file.entries,
    records,
    conflicts,
    totals,
    quota,
    report,
    corrupt: false,
    futureSchema: false,
    alreadyMigrated,
    interrupted,
  };
}

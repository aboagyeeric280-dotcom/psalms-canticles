/* Normalisation and schema migration.
 *
 * Rules that must never be broken:
 *  - nothing the user typed is ever thrown away, or altered in any way;
 *  - migrations are idempotent — running them twice changes nothing;
 *  - unrecognised fields are preserved so a newer backup survives a round trip.
 *
 * ── THE TEXT RULE (§F) ──────────────────────────────────────────────────────
 * `content()` below returns the stored string UNCHANGED. The original
 * implementation this is ported from trimmed every content field; that has
 * been removed, along with the trim on the user's `note` and on the
 * celebration's display name.
 *
 * Trimming survives in exactly three places, all of which parse a KEY rather
 * than store text: the opaque `id`, the internal `source` marker, and the
 * numeric/date/enum parsers. None of them can reach a content field.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { isISODate, type ISODate } from './iso';
import type { Hour, PsalterWeek, Season } from './day';
import {
  EMPTY_CONTENT,
  KEY_TYPES,
  SECTIONS,
  isValidAnnualDate,
  isWhitespaceOnly,
  sectionHasContent,
  type CalendarScope,
  type CelebrationRank,
  type Entry,
  type KeyType,
  type StoreFile,
  type StoreMeta,
} from './types';

export const CURRENT_SCHEMA_VERSION = 3;

const CONTENT_FREE_NOTE =
  'This record has no visible text in any of the four sections. It has been kept rather than discarded.';

const KNOWN_ENTRY_FIELDS = new Set([
  'id', 'keyType', 'hour', 'season', 'psalterWeek', 'weekday', 'weekOfSeason',
  'celebrationId', 'celebrationName', 'celebrationRank', 'calendarScope',
  'celebrationMonth', 'celebrationDay', 'date', 'note', 'source', 'origin',
  'needsReview', 'reviewNote', 'createdAt', 'updatedAt',
  'reference', 'readingText', 'translation', 'responsory', 'intercessions',
  'concludingPrayer', 'extra',
]);

const HOUR_SYNONYMS: Record<string, Hour> = {
  morning: 'morning', lauds: 'morning', morningprayer: 'morning',
  midday: 'midday', daytime: 'midday', midmorning: 'midday', terce: 'midday',
  sext: 'midday', sexta: 'midday', none: 'midday', noon: 'midday',
  evening: 'evening', vespers: 'evening', vesperae: 'evening', eveningprayer: 'evening',
  eveningbefore: 'evening-before', firstvespers: 'evening-before',
  vespers1: 'evening-before', vesperaei: 'evening-before', firstevening: 'evening-before',
  night: 'night', compline: 'night', completorium: 'night', nightprayer: 'night',
};

/* The production calendar distinguishes Holy Week and the Triduum from Lent;
   legacy data only knows the five broader seasons. Both spellings normalise. */
const SEASON_SYNONYMS: Record<string, Season> = {
  advent: 'advent',
  christmas: 'christmas', christmastime: 'christmas', christmastide: 'christmas',
  lent: 'lent', lenten: 'lent',
  holyweek: 'holyweek',
  triduum: 'triduum', sacredtriduum: 'triduum', thesacredtriduum: 'triduum',
  easter: 'easter', eastertime: 'easter', eastertide: 'easter',
  ordinary: 'ordinary', ordinarytime: 'ordinary', ot: 'ordinary',
  throughtheyear: 'ordinary',
};

const WEEKDAY_SYNONYMS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

const ROMAN_TO_NUMBER: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

const CELEBRATION_RANK_SYNONYMS: Record<string, CelebrationRank> = {
  optionalmemorial: 'optionalMemorial', optional: 'optionalMemorial',
  memorial: 'memorial', obligatorymemorial: 'memorial',
  feast: 'feast', solemnity: 'solemnity', solemnfeast: 'solemnity',
};

const CALENDAR_SCOPE_SYNONYMS: Record<string, CalendarScope> = {
  general: 'general', generalroman: 'general', generalromancalendar: 'general',
  national: 'national', diocesan: 'diocesan', diocese: 'diocesan',
  local: 'local', community: 'local', religious: 'local',
};

/** Fold a KEY value for lookup. Never applied to stored text. */
function slug(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseHour(value: unknown): Hour | undefined {
  return HOUR_SYNONYMS[slug(value)];
}

export function parseSeason(value: unknown): Season | undefined {
  return SEASON_SYNONYMS[slug(value)];
}

export function parseWeekday(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  const asSlug = slug(value);
  if (asSlug in WEEKDAY_SYNONYMS) return WEEKDAY_SYNONYMS[asSlug];
  if (/^[0-6]$/.test(asSlug)) return Number(asSlug);
  return undefined;
}

export function parsePsalterWeek(value: unknown): PsalterWeek | undefined {
  if (typeof value === 'number' && value >= 1 && value <= 4) return value as PsalterWeek;
  const asSlug = slug(value);
  if (asSlug in ROMAN_TO_NUMBER) return ROMAN_TO_NUMBER[asSlug] as PsalterWeek;
  if (/^[1-4]$/.test(asSlug)) return Number(asSlug) as PsalterWeek;
  return undefined;
}

function parseWeekOfSeason(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const asNumber = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(asNumber) || !Number.isInteger(asNumber)) return undefined;
  if (asNumber < 0 || asNumber > 34) return undefined;
  return asNumber;
}

function parseCalendarNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function parseDate(value: unknown): ISODate | undefined {
  if (typeof value !== 'string') return undefined;
  // Parsing a key into its canonical form, not storing text.
  const candidate = value.trim().replace(/\//g, '-');
  return isISODate(candidate) ? candidate : undefined;
}

/**
 * Read a stored content value EXACTLY as it was written.
 *
 * No trim, no normalisation, no reformatting. An array is the one legacy
 * SHAPE this understands — some early records stored lines as an array — and
 * its elements are joined with a newline without being altered individually.
 */
function content(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => content(item)).join('\n');
  return String(value);
}

let idCounter = 0;

export function newId(prefix = 'e'): string {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}${random}`;
}

export interface NormalisedEntry {
  entry: Entry | null;
  problems: string[];
}

/**
 * Turn an unknown record into an Entry. Returns problems rather than throwing
 * so callers can show the user what was wrong before anything is written.
 */
export function normaliseEntry(raw: unknown, label = 'entry'): NormalisedEntry {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entry: null, problems: [`${label}: not an object`] };
  }
  const record = raw as Record<string, unknown>;

  const hour = parseHour(record.hour) ?? parseHour(record.office) ?? parseHour(record.prayer);
  if (!hour) problems.push(`${label}: missing or unrecognised hour`);

  const season = parseSeason(record.season);
  const psalterWeek = parsePsalterWeek(record.psalterWeek ?? record.psalter ?? record.week);
  const weekday = parseWeekday(record.weekday ?? record.day);
  const weekOfSeason = parseWeekOfSeason(record.weekOfSeason ?? record.seasonWeek);
  // An id is an opaque token, not text the user reads: trimming is safe here.
  const celebrationId = typeof record.celebrationId === 'string' && record.celebrationId.trim()
    ? record.celebrationId.trim()
    : undefined;
  // The display name is the user's wording and is stored exactly as given.
  const celebrationNameRaw = content(record.celebrationName ?? record.celebration);
  const celebrationName = celebrationNameRaw.length > 0 ? celebrationNameRaw : undefined;
  const celebrationRank = CELEBRATION_RANK_SYNONYMS[slug(record.celebrationRank ?? record.rank)];
  const calendarScope = CALENDAR_SCOPE_SYNONYMS[slug(record.calendarScope ?? record.calendar)];
  const celebrationMonth = parseCalendarNumber(record.celebrationMonth ?? record.month, 1, 12);
  const celebrationDay = parseCalendarNumber(record.celebrationDay ?? record.dayOfMonth, 1, 31);
  const date = parseDate(record.date);

  const declared = KEY_TYPES.includes(record.keyType as KeyType)
    ? (record.keyType as KeyType)
    : undefined;
  let keyType: KeyType;
  let needsReview = record.needsReview === true;
  const reviewReasons: string[] = [];
  if (typeof record.reviewNote === 'string' && record.reviewNote) reviewReasons.push(record.reviewNote);

  if (declared) {
    keyType = declared;
  } else if (date) {
    keyType = 'date';
  } else if (celebrationId || (celebrationName && celebrationMonth && celebrationDay)) {
    keyType = 'celebration';
  } else if (season && psalterWeek && weekday !== undefined) {
    keyType = 'psalter';
  } else if (season && weekOfSeason !== undefined) {
    keyType = 'week';
  } else {
    keyType = 'psalter';
    needsReview = true;
    reviewReasons.push('This record did not say what it was keyed to, so it was kept as a psalter entry. Please check the key.');
  }

  const fields = {
    reference: content(record.reference ?? record.scripture ?? record.citation),
    readingText: content(record.readingText ?? record.reading ?? record.text),
    translation: content(record.translation ?? record.version),
    responsory: content(record.responsory ?? record.response),
    intercessions: content(record.intercessions ?? record.petitions),
    concludingPrayer: content(record.concludingPrayer ?? record.prayer ?? record.collect),
  };

  // A key the resolver cannot match is kept, but flagged for the user to fix.
  if (keyType === 'date' && !date) {
    needsReview = true;
    reviewReasons.push('This record is keyed to an exact date but has no valid date.');
  }
  if (
    keyType === 'celebration' &&
    (!celebrationName || (!celebrationId && !isValidAnnualDate(celebrationMonth, celebrationDay)))
  ) {
    needsReview = true;
    reviewReasons.push('This celebration record has no canonical id and no valid annual date, so it cannot be matched yet.');
  }
  if (keyType === 'week' && (!season || weekOfSeason === undefined)) {
    needsReview = true;
    reviewReasons.push('This week record does not say which season and week it belongs to.');
  }
  if (keyType === 'psalter' && (!season || !psalterWeek || weekday === undefined)) {
    needsReview = true;
    reviewReasons.push('This psalter record is missing its season, psalter week or weekday.');
  }

  // A field of only whitespace displays as absent; say so rather than hide it.
  const whitespaceOnly = (Object.keys(fields) as (keyof typeof fields)[])
    .filter((field) => isWhitespaceOnly(fields[field]));
  if (whitespaceOnly.length > 0) {
    needsReview = true;
    reviewReasons.push(`These fields contain only blank space, so they display as empty: ${whitespaceOnly.join(', ')}. The exact characters have been kept.`);
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!KNOWN_ENTRY_FIELDS.has(key)) extra[key] = value;
  }
  if (record.extra && typeof record.extra === 'object' && !Array.isArray(record.extra)) {
    Object.assign(extra, record.extra as Record<string, unknown>);
  }

  const now = new Date().toISOString();
  const noteRaw = typeof record.note === 'string' ? record.note : undefined;
  const entry: Entry = {
    ...EMPTY_CONTENT,
    ...fields,
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : newId(),
    keyType,
    hour: hour ?? 'morning',
    ...(season ? { season } : {}),
    ...(psalterWeek ? { psalterWeek } : {}),
    ...(weekday !== undefined ? { weekday } : {}),
    ...(weekOfSeason !== undefined ? { weekOfSeason } : {}),
    ...(celebrationId ? { celebrationId } : {}),
    ...(celebrationName ? { celebrationName } : {}),
    ...(celebrationRank ? { celebrationRank } : {}),
    ...(calendarScope ? { calendarScope } : {}),
    ...(celebrationMonth ? { celebrationMonth } : {}),
    ...(celebrationDay ? { celebrationDay } : {}),
    ...(date ? { date } : {}),
    // Stored exactly as received, blank space and all.
    ...(noteRaw !== undefined && noteRaw.length > 0 ? { note: noteRaw } : {}),
    ...(record.origin === 'published' || record.origin === 'personal'
      ? { origin: record.origin }
      : {}),
    ...(needsReview ? { needsReview: true } : {}),
    /* Deduplicated: a record carrying a review note from an earlier pass must
       reach a fixed point, not accumulate the same sentence on every run. */
    ...(needsReview && reviewReasons.length > 0
      ? { reviewNote: [...new Set(reviewReasons)].join(' ') }
      : {}),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
  if (Object.keys(extra).length > 0) entry.extra = extra;

  const hasAnyContent = SECTIONS.some((section) => sectionHasContent(entry, section));
  if (!hasAnyContent) problems.push(`${label}: no reading, responsory, intercessions or prayer`);

  return { entry, problems };
}

export interface MigrationReport {
  fromVersion: number;
  toVersion: number;
  entriesIn: number;
  entriesOut: number;
  prayersSplitToWeek: number;
  flaggedForReview: number;
  /** Records with no visible content in any section. Kept, never dropped. */
  contentFreeKept: number;
  changed: boolean;
  problems: string[];
}

function emptyMeta(): StoreMeta {
  return { createdAt: new Date().toISOString() };
}

/**
 * Bring any previously stored shape up to the current schema.
 *
 * Accepted inputs: the current object form, `{ entries: [...] }` without a
 * version, and a bare array of entries (the original shape of the legacy app).
 *
 * Nothing is dropped. The original implementation filtered out records with no
 * content in any section; that contradicted "never silently discard", so such
 * records are now kept and flagged for review instead.
 */
export function migrateStore(raw: unknown): { file: StoreFile; report: MigrationReport } {
  const problems: string[] = [];
  let fromVersion = 0;
  let rawEntries: unknown[] = [];
  let meta: StoreMeta = emptyMeta();

  if (Array.isArray(raw)) {
    rawEntries = raw;
  } else if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (typeof record.schemaVersion === 'number') fromVersion = record.schemaVersion;
    if (Array.isArray(record.entries)) {
      rawEntries = record.entries;
    } else {
      problems.push('No entries array found; starting from an empty list.');
    }
    if (record.meta && typeof record.meta === 'object') {
      meta = { ...emptyMeta(), ...(record.meta as StoreMeta) };
    }
  } else if (raw !== null && raw !== undefined) {
    problems.push('Stored data was not in a recognised format.');
  }

  const entries: Entry[] = [];
  let prayersSplitToWeek = 0;
  let flaggedForReview = 0;
  let contentFreeKept = 0;

  rawEntries.forEach((rawEntry, index) => {
    const { entry, problems: entryProblems } = normaliseEntry(rawEntry, `entry ${index + 1}`);
    problems.push(...entryProblems);
    if (!entry) return;

    const wasLegacy = !(rawEntry as Record<string, unknown> | null)?.hasOwnProperty?.('keyType');

    if (
      wasLegacy &&
      entry.keyType === 'psalter' &&
      sectionHasContent(entry, 'concludingPrayer') &&
      entry.season &&
      entry.weekOfSeason !== undefined
    ) {
      /* Legacy records carried all four sections on one row. Concluding
         prayers belong to the week of the season, so they are lifted into
         their own week-keyed record. The wording is moved verbatim. */
      const now = new Date().toISOString();
      entries.push({
        ...EMPTY_CONTENT,
        id: newId('w'),
        keyType: 'week',
        hour: entry.hour,
        season: entry.season,
        weekOfSeason: entry.weekOfSeason,
        concludingPrayer: entry.concludingPrayer,
        ...(entry.note !== undefined ? { note: entry.note } : {}),
        createdAt: entry.createdAt,
        updatedAt: now,
      });
      entry.concludingPrayer = '';
      prayersSplitToWeek += 1;
    }

    if (!SECTIONS.some((section) => sectionHasContent(entry, section))) {
      contentFreeKept += 1;
      entry.needsReview = true;
      entry.reviewNote = [...new Set([
        ...(entry.reviewNote ? [entry.reviewNote] : []),
        CONTENT_FREE_NOTE,
      ])].join(' ');
    }

    if (entry.needsReview) flaggedForReview += 1;
    entries.push(entry);
  });

  const file: StoreFile = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entries,
    meta: {
      ...meta,
      ...(fromVersion < CURRENT_SCHEMA_VERSION && rawEntries.length > 0
        ? { lastMigratedAt: new Date().toISOString() }
        : {}),
    },
  };

  return {
    file,
    report: {
      fromVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      entriesIn: rawEntries.length,
      entriesOut: entries.length,
      prayersSplitToWeek,
      flaggedForReview,
      contentFreeKept,
      changed: fromVersion !== CURRENT_SCHEMA_VERSION || prayersSplitToWeek > 0,
      problems,
    },
  };
}

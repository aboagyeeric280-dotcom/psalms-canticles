/* The stored shape of missing-parts material.
 *
 * ── THE TEXT RULE (approved plan §F) ────────────────────────────────────────
 * The six content fields and the user's `note` are stored EXACTLY as received.
 * No trimming, no Unicode normalisation, no line-ending conversion, no quote
 * replacement, no whitespace collapsing, no reformatting — anywhere, ever.
 *
 * `sectionHasContent` below inspects a temporary trimmed COPY to decide
 * whether a field is visibly empty. It never writes that copy back. That is
 * the one and only place a trimmed value may be computed in this tree, and it
 * is a predicate, not a transformation.
 * ───────────────────────────────────────────────────────────────────────────
 */

import type { Hour, PsalterWeek, Season } from './day';
import type { ISODate } from './iso';

export type { Hour, PsalterWeek, Season };

export type KeyType = 'psalter' | 'week' | 'celebration' | 'date';
export type SectionId = 'reading' | 'responsory' | 'intercessions' | 'concludingPrayer';
export type CelebrationRank = 'optionalMemorial' | 'memorial' | 'feast' | 'solemnity';
export type CalendarScope = 'general' | 'national' | 'diocesan' | 'local';

/** First Vespers is its own hour and never inherits Evening Prayer (D6). */
export const HOURS: Hour[] = ['morning', 'midday', 'evening', 'evening-before', 'night'];

export interface HourMeta {
  id: Hour;
  label: string;
  traditional: string;
  description: string;
}

export const HOUR_META: Record<Hour, HourMeta> = {
  morning: { id: 'morning', label: 'Morning', traditional: 'Laudes', description: 'Morning Prayer' },
  midday: { id: 'midday', label: 'Midday', traditional: 'Sexta', description: 'Midday Prayer' },
  evening: { id: 'evening', label: 'Evening', traditional: 'Vesperae', description: 'Evening Prayer' },
  'evening-before': {
    id: 'evening-before', label: 'Evening Before', traditional: 'Vesperae I',
    description: 'First Vespers, the evening before',
  },
  night: { id: 'night', label: 'Night', traditional: 'Completorium', description: 'Compline' },
};

/** Display wording for the production calendar's seasons. */
export const SEASON_LABELS: Record<Season, string> = {
  advent: 'Advent',
  christmas: 'Christmastide',
  lent: 'Lent',
  holyweek: 'Holy Week',
  triduum: 'the Sacred Triduum',
  easter: 'Eastertide',
  ordinary: 'Through the Year',
};

export const KEY_TYPES: KeyType[] = ['psalter', 'week', 'celebration', 'date'];

export const KEY_TYPE_LABELS: Record<KeyType, string> = {
  psalter: 'Psalter',
  week: 'Week',
  celebration: 'Celebration',
  date: 'Exact date',
};

/** Higher number wins. Exact date beats celebration, week and psalter. */
export const KEY_TYPE_PRIORITY: Record<KeyType, number> = {
  psalter: 1,
  week: 2,
  celebration: 3,
  date: 4,
};

export const CELEBRATION_RANKS: CelebrationRank[] = [
  'optionalMemorial', 'memorial', 'feast', 'solemnity',
];

export const CELEBRATION_RANK_LABELS: Record<CelebrationRank, string> = {
  optionalMemorial: 'Optional Memorial',
  memorial: 'Memorial',
  feast: 'Feast',
  solemnity: 'Solemnity',
};

export const CALENDAR_SCOPES: CalendarScope[] = ['general', 'national', 'diocesan', 'local'];

export const CALENDAR_SCOPE_LABELS: Record<CalendarScope, string> = {
  general: 'General Roman Calendar',
  national: 'National calendar',
  diocesan: 'Diocesan calendar',
  local: 'Local or community calendar',
};

/** Validates an annual month/day pair, allowing 29 February. */
export function isValidAnnualDate(month: number | undefined, day: number | undefined): boolean {
  if (!month || !day) return false;
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const SECTIONS: SectionId[] = ['reading', 'responsory', 'intercessions', 'concludingPrayer'];

export interface SectionMeta {
  id: SectionId;
  label: string;
  shortLabel: string;
  defaultKeyType: KeyType;
  /** Content fields an entry uses for this section. */
  fields: (keyof EntryContent)[];
  placeholder: string;
  /** The HOUR_SHAPE item in src/data/ordinary.ts this section fills. */
  ordinaryItemId: string;
}

export const SECTION_META: Record<SectionId, SectionMeta> = {
  reading: {
    id: 'reading',
    label: 'Short reading',
    shortLabel: 'Reading',
    defaultKeyType: 'psalter',
    fields: ['reference', 'readingText', 'translation'],
    placeholder: 'Type or paste the short reading exactly as it is printed.',
    ordinaryItemId: 'reading',
  },
  responsory: {
    id: 'responsory',
    label: 'Responsory',
    shortLabel: 'Responsory',
    defaultKeyType: 'psalter',
    fields: ['responsory'],
    placeholder: 'Type the responsory, keeping the versicle and response on separate lines.',
    ordinaryItemId: 'responsory',
  },
  intercessions: {
    id: 'intercessions',
    label: 'Intercessions',
    shortLabel: 'Intercessions',
    defaultKeyType: 'psalter',
    fields: ['intercessions'],
    placeholder: 'Type the intercessions, one petition per line.',
    ordinaryItemId: 'petitions',
  },
  concludingPrayer: {
    id: 'concludingPrayer',
    label: 'Concluding prayer',
    shortLabel: 'Prayer',
    defaultKeyType: 'week',
    fields: ['concludingPrayer'],
    placeholder: 'Type the concluding prayer.',
    ordinaryItemId: 'collect',
  },
};

export interface EntryContent {
  reference: string;
  readingText: string;
  translation: string;
  responsory: string;
  intercessions: string;
  concludingPrayer: string;
}

export const EMPTY_CONTENT: EntryContent = {
  reference: '',
  readingText: '',
  translation: '',
  responsory: '',
  intercessions: '',
  concludingPrayer: '',
};

/** The content fields, which the text rule above protects absolutely. */
export const CONTENT_FIELDS: (keyof EntryContent)[] = [
  'reference', 'readingText', 'translation', 'responsory', 'intercessions', 'concludingPrayer',
];

export interface Entry extends EntryContent {
  id: string;
  keyType: KeyType;
  hour: Hour;
  /** psalter and week keys */
  season?: Season;
  /** psalter key */
  psalterWeek?: PsalterWeek;
  /** psalter key: 0 = Sunday ... 6 = Saturday */
  weekday?: number;
  /** week key */
  weekOfSeason?: number;
  /* celebration key: the canonical id of a celebration in the production
     calendar. Never derived from a display name at runtime (D2). */
  celebrationId?: string;
  /** celebration key: wording shown to the user. Never used for matching. */
  celebrationName?: string;
  /** celebration key */
  celebrationRank?: CelebrationRank;
  /** celebration key */
  calendarScope?: CalendarScope;
  /* celebration key: a fixed annual date, for an observance the built-in
     calendar does not carry. The user supplies this identity themselves; it is
     not a canonical id and is not derived from the calendar. */
  celebrationMonth?: number;
  celebrationDay?: number;
  /** date key */
  date?: ISODate;
  /** Free-text note from the user. Never displayed as part of the office. */
  note?: string;
  /** Provenance. 'published' material comes from the book (D7). */
  origin?: 'personal' | 'published';
  /** Set when a record could not be keyed confidently, or needs a human eye. */
  needsReview?: boolean;
  /** Plain-language explanation of why review is needed. */
  reviewNote?: string;
  /* When the reader said they had looked at this. The note above is KEPT, so
     the diagnostic history survives being acknowledged, and the flag can be
     put back. Derived problems — a duplicate key, a key that matches no day —
     are recomputed from the data and cannot be dismissed by a button. */
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Anything a newer version wrote that this one does not understand. */
  extra?: Record<string, unknown>;
}

export interface StoreFile {
  schemaVersion: number;
  entries: Entry[];
  meta: StoreMeta;
}

export interface StoreMeta {
  createdAt: string;
  lastExportAt?: string;
  lastMigratedAt?: string;
}

/**
 * Whether a section is visibly empty.
 *
 * THE ONE PLACE a trimmed value may be computed (§F). It reads a temporary
 * copy to answer the question; the stored value is not touched, and this
 * function never writes anything. A field holding only whitespace therefore
 * displays as absent while its exact bytes remain in storage — such a record
 * is flagged for review so it can never become invisible.
 */
export function sectionHasContent(
  entry: Pick<Entry, keyof EntryContent>,
  section: SectionId,
): boolean {
  if (section === 'reading') return String(entry.readingText ?? '').trim().length > 0;
  const field = SECTION_META[section].fields[0];
  return String(entry[field] ?? '').trim().length > 0;
}

/** True when a field holds characters but none of them are visible. */
export function isWhitespaceOnly(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && value.trim().length === 0;
}

export function entryIsEmpty(entry: Entry): boolean {
  return SECTIONS.every((section) => !sectionHasContent(entry, section));
}

export function sectionsPresent(entry: Entry): SectionId[] {
  return SECTIONS.filter((section) => sectionHasContent(entry, section));
}

/**
 * Stable identity of an entry's key. Two entries sharing it are duplicates.
 *
 * The celebration branch prefers the canonical id. The fallback identifies a
 * user-defined annual observance by the scope, date and name the user gave it
 * — that is the user's own identity for a celebration the calendar does not
 * carry, not a canonical id derived from a calendar display name.
 */
export function keyId(
  entry: Pick<
    Entry,
    | 'keyType' | 'hour' | 'season' | 'psalterWeek' | 'weekday' | 'weekOfSeason'
    | 'celebrationId' | 'celebrationName' | 'calendarScope'
    | 'celebrationMonth' | 'celebrationDay' | 'date'
  >,
): string {
  switch (entry.keyType) {
    case 'date':
      return `date|${entry.date ?? '?'}|${entry.hour}`;
    case 'celebration': {
      const identity = entry.celebrationId
        ? `id:${entry.celebrationId}`
        : `annual:${entry.calendarScope ?? '?'}|${entry.celebrationMonth ?? '?'}-${
            entry.celebrationDay ?? '?'
          }|${(entry.celebrationName ?? '?').toLowerCase()}`;
      return `celebration|${identity}|${entry.hour}`;
    }
    case 'week':
      return `week|${entry.season ?? '?'}|${entry.weekOfSeason ?? '?'}|${entry.hour}`;
    case 'psalter':
    default:
      return `psalter|${entry.season ?? '?'}|${entry.psalterWeek ?? '?'}|${entry.weekday ?? '?'}|${entry.hour}`;
  }
}

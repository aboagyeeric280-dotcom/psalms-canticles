/* Matching and resolution.
 *
 * The four sections resolve INDEPENDENTLY. For each section the most specific
 * record that actually contains that section wins:
 *
 *     exact date  >  celebration  >  week of season  >  psalter
 *
 * A more specific record overrides only the sections it contains. It never
 * hides the other sections coming from a more general record, and it never
 * deletes them — they carry on appearing on every other day they match.
 *
 * Calendar-independent: the day arrives as a MissingPartsDay from the adapter.
 * Nothing here imports from src/utils/.
 */

import {
  CELEBRATION_RANK_LABELS,
  HOUR_META,
  SEASON_LABELS,
  SECTIONS,
  sectionHasContent,
  type Entry,
  type Hour,
  type KeyType,
  type Season,
  type SectionId,
} from './types';
import type { MissingPartsDay } from './day';
import {
  ROMAN_WEEK,
  WEEKDAY_NAMES,
  dayOfMonthOf,
  formatAnnualDate,
  formatDateOnly,
  monthOf,
} from './iso';

export interface SectionResolution {
  section: SectionId;
  present: boolean;
  entry?: Entry;
  keyType?: KeyType;
  /** Records that also supply this section but lost on precedence. */
  overridden: Entry[];
  /** Records sharing the winner's key that also supply this section. */
  duplicates: Entry[];
}

export interface ResolvedOffice {
  day: MissingPartsDay;
  hour: Hour;
  sections: Record<SectionId, SectionResolution>;
  candidates: Record<KeyType, Entry[]>;
}

/**
 * Whether one record applies to this day and hour.
 *
 * D4: a celebration-keyed record is matched against the day's COMPLETE
 * celebration list, not only the one the day is named after, so material for
 * the Baptism of the Lord still resolves on a day the calendar leads with the
 * Sunday. Because the adapter deduplicates by canonical id, two source rows
 * describing one observance match once (D2a).
 *
 * D5: a week-keyed record cannot apply where the calendar has no week for the
 * day, or where a week key is not permitted at all.
 */
export function entryMatchesDay(entry: Entry, day: MissingPartsDay, hour: Hour): boolean {
  if (entry.hour !== hour) return false;
  switch (entry.keyType) {
    case 'date':
      return Boolean(entry.date) && entry.date === day.date;
    case 'celebration':
      if (entry.celebrationId) {
        return day.celebrations.some((celebration) => celebration.id === entry.celebrationId);
      }
      // A user-defined observance on a fixed annual date.
      return (
        entry.celebrationMonth === monthOf(day.date) &&
        entry.celebrationDay === dayOfMonthOf(day.date)
      );
    case 'week':
      if (!day.allowsWeekKey || day.weekOfSeason === null) return false;
      return entry.season === day.season && entry.weekOfSeason === day.weekOfSeason;
    case 'psalter':
      return (
        entry.season === day.season &&
        entry.psalterWeek === day.psalterWeek &&
        entry.weekday === day.weekday
      );
    default:
      return false;
  }
}

function byRecency(a: Entry, b: Entry): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
}

const PRIORITY_ORDER: KeyType[] = ['date', 'celebration', 'week', 'psalter'];

export function resolveOffice(
  entries: Entry[],
  day: MissingPartsDay,
  hour: Hour,
): ResolvedOffice {
  const candidates: Record<KeyType, Entry[]> = { date: [], celebration: [], week: [], psalter: [] };
  for (const entry of entries) {
    if (entryMatchesDay(entry, day, hour)) candidates[entry.keyType].push(entry);
  }
  for (const keyType of PRIORITY_ORDER) candidates[keyType].sort(byRecency);

  const sections = {} as Record<SectionId, SectionResolution>;
  for (const section of SECTIONS) {
    let winner: Entry | undefined;
    let winnerKeyType: KeyType | undefined;
    const overridden: Entry[] = [];
    const duplicates: Entry[] = [];

    for (const keyType of PRIORITY_ORDER) {
      for (const entry of candidates[keyType]) {
        // A record only competes for a section it actually supplies.
        if (!sectionHasContent(entry, section)) continue;
        if (!winner) {
          winner = entry;
          winnerKeyType = keyType;
        } else if (keyType === winnerKeyType) {
          duplicates.push(entry);
        } else {
          overridden.push(entry);
        }
      }
    }

    sections[section] = {
      section,
      present: Boolean(winner),
      entry: winner,
      keyType: winnerKeyType,
      overridden,
      duplicates,
    };
  }

  return { day, hour, sections, candidates };
}

/* ------------------------------------------------------------- describing */

function seasonLabel(season?: Season): string {
  return season ? SEASON_LABELS[season] : 'No season set';
}

/** Short badge text, e.g. "Psalter I · Monday". */
export function keyBadge(entry: Entry): string {
  switch (entry.keyType) {
    case 'date':
      return entry.date ? formatDateOnly(entry.date) : 'Exact date';
    case 'celebration':
      return entry.celebrationName || 'Celebration';
    case 'week':
      return entry.weekOfSeason === undefined ? 'Week' : `Week ${entry.weekOfSeason}`;
    case 'psalter':
    default:
      return `Psalter ${ROMAN_WEEK[entry.psalterWeek ?? 1]}${
        entry.weekday === undefined ? '' : ` · ${WEEKDAY_NAMES[entry.weekday]}`
      }`;
  }
}

function celebrationRankLabel(entry: Entry): string {
  return entry.celebrationRank ? CELEBRATION_RANK_LABELS[entry.celebrationRank] : 'Celebration';
}

/** Full description of what an entry is keyed to. */
export function describeKey(entry: Entry): string {
  const hour = HOUR_META[entry.hour].label;
  switch (entry.keyType) {
    case 'date':
      return `${entry.date ? formatDateOnly(entry.date) : 'No date set'} · ${hour}`;
    case 'celebration':
      return `${entry.celebrationName || 'Unnamed celebration'} · ${celebrationRankLabel(entry)} · ${hour}`;
    case 'week':
      return `${seasonLabel(entry.season)} · ${
        entry.weekOfSeason === undefined ? 'No week set' : `week ${entry.weekOfSeason}`
      } · ${hour}`;
    case 'psalter':
    default:
      return `${seasonLabel(entry.season)} · Psalter week ${ROMAN_WEEK[entry.psalterWeek ?? 1]} · ${
        entry.weekday === undefined ? 'No weekday set' : WEEKDAY_NAMES[entry.weekday]
      } · ${hour}`;
  }
}

export interface ExplainOptions {
  season?: Season;
  psalterWeek?: number;
  weekday?: number;
  weekOfSeason?: number;
  celebrationId?: string;
  celebrationName?: string;
  celebrationMonth?: number;
  celebrationDay?: number;
  date?: string;
  hour: Hour;
}

/** Plain-language sentence describing when a key applies. Used in the editor. */
export function explainKey(keyType: KeyType, options: ExplainOptions): string {
  const hour = HOUR_META[options.hour].label;
  switch (keyType) {
    case 'psalter': {
      const weekday = options.weekday === undefined ? 'that weekday' : WEEKDAY_NAMES[options.weekday];
      const season = options.season ? SEASON_LABELS[options.season] : 'that season';
      return `This will repeat every four weeks on ${weekday} at ${hour}, in ${season}.`;
    }
    case 'week': {
      if (!options.season || options.weekOfSeason === undefined) {
        return `This will apply to one week of the season at ${hour}.`;
      }
      return `This applies only to week ${options.weekOfSeason} of ${
        SEASON_LABELS[options.season]
      }, at ${hour}.`;
    }
    case 'celebration': {
      const name = options.celebrationName?.trim() || 'this celebration';
      if (options.celebrationId) {
        return `This follows ${name} whenever it occurs, at ${hour}.`;
      }
      if (options.celebrationMonth && options.celebrationDay) {
        return `This repeats every year for ${name} on ${formatAnnualDate(
          options.celebrationMonth,
          options.celebrationDay,
        )}, at ${hour}.`;
      }
      return `This repeats each year for ${name}, at ${hour}.`;
    }
    case 'date':
    default:
      return `This applies only to ${
        options.date ? formatDateOnly(options.date) : 'one calendar date'
      }, at ${hour}.`;
  }
}

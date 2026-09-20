/* Saying, in words, where a section came from and what it repeats on.
 *
 * Pure and testable, and never carried by colour alone: every badge has text
 * beside it that says the same thing. A reader who cannot see the badge still
 * learns that this responsory belongs to Psalter II on Tuesdays.
 */

import {
  CELEBRATION_RANK_LABELS, SEASON_LABELS, HOUR_META,
  type Entry, type Hour, type SectionId, SECTION_META,
} from '../data/types';
import { ROMAN_WEEK, WEEKDAY_NAMES, formatAnnualDate, formatDateOnly } from '../data/iso';

export interface Provenance {
  /** Short label, e.g. "Psalter II · Tuesday". */
  badge: string;
  /** What it repeats on, in plain words. */
  detail: string;
}

export function provenanceOf(entry: Entry): Provenance {
  switch (entry.keyType) {
    case 'date':
      return {
        badge: `Exact date · ${entry.date ? formatDateOnly(entry.date) : 'not set'}`,
        detail: 'This date only — it does not repeat.',
      };
    case 'celebration': {
      const rank = entry.celebrationRank ? CELEBRATION_RANK_LABELS[entry.celebrationRank] : 'Celebration';
      const name = entry.celebrationName || 'this celebration';
      const repeats = entry.celebrationId
        ? `Follows ${name} whenever it is kept.`
        : entry.celebrationMonth && entry.celebrationDay
          ? `Repeats every year on ${formatAnnualDate(entry.celebrationMonth, entry.celebrationDay)}.`
          : `Repeats every year for ${name}.`;
      return { badge: `${rank} · ${name}`, detail: repeats };
    }
    case 'week': {
      const season = entry.season ? SEASON_LABELS[entry.season] : 'the season';
      const week = entry.weekOfSeason === undefined ? 'a week' : `Week ${entry.weekOfSeason}`;
      return { badge: `${week} · ${season}`, detail: `Repeats in that week of ${season} each year.` };
    }
    case 'psalter':
    default: {
      const weekday = entry.weekday === undefined ? '' : ` · ${WEEKDAY_NAMES[entry.weekday]}`;
      const season = entry.season ? SEASON_LABELS[entry.season] : 'the season';
      return {
        badge: `Psalter ${ROMAN_WEEK[entry.psalterWeek ?? 1]}${weekday}`,
        detail: `Repeats every four weeks in ${season}.`,
      };
    }
  }
}

/** "Overrides Psalter II · Tuesday, which still appears on its own days." */
export function overrideSentence(overridden: Entry[]): string {
  if (overridden.length === 0) return '';
  const names = overridden.map((entry) => provenanceOf(entry).badge).join('; ');
  const plural = overridden.length === 1 ? 'that record' : 'those records';
  return `This is more specific than ${names}, so it is shown here instead. Nothing has been deleted — ${plural} still appears on every other day it belongs to.`;
}

/** The accessible name of the control that adds a missing section. */
export function addLabel(section: SectionId, hour: Hour, dayTitle: string): string {
  return `Add the ${SECTION_META[section].label.toLowerCase()} for ${HOUR_META[hour].description}, ${dayTitle}`;
}

/** The accessible name of the control that edits a section already stored. */
export function editLabel(section: SectionId, hour: Hour): string {
  return `Edit the ${SECTION_META[section].label.toLowerCase()} for ${HOUR_META[hour].description}`;
}

/** The accessible name of the control that removes a section. */
export function deleteLabel(section: SectionId, hour: Hour): string {
  return `Delete the ${SECTION_META[section].label.toLowerCase()} for ${HOUR_META[hour].description}`;
}

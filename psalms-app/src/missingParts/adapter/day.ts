/* The bridge between the production calendar and the missing-parts resolver.
 *
 * This is the ONLY place the two meet. The resolver knows nothing but the
 * MissingPartsDay contract, so a change to the production calendar breaks
 * here, loudly, in one file — rather than drifting quietly through matching.
 *
 * Read-only in both directions: nothing here writes storage, and nothing here
 * alters what the reader displays.
 */

import { liturgicalToday, type LiturgicalToday, type TodayOptions } from '../../utils/generalCalendar';
import { DAY_KEYS } from '../../utils/liturgicalCalendar';
import type { CanonicalCelebration, Hour, MissingPartsDay } from '../data/day';
import { christmasWeekFor } from './christmasWeek';
import { HOLY_WEEK_WEEK_OF_SEASON } from './holyWeek';

/* The Triduum takes no week-keyed material.
 *
 * It is not a stretch of ordinary weeks: every one of its days has proper
 * texts, and the production calendar numbers no week there. Material for
 * those days belongs to an exact date or to the celebration itself.
 *
 * Holy Week is different. It is one week, it recurs every year, and material
 * for it must keep recurring — so it is given its own canonical week number
 * here rather than being pushed onto exact dates. */
const SEASONS_WITHOUT_WEEK_KEYS: readonly string[] = ['triduum'];

/**
 * The celebrations of the day that may carry missing-parts material.
 *
 * Every celebration the day keeps, not merely the one it is named after
 * (D4) — so material filed under the Baptism of the Lord still resolves on a
 * day the calendar leads with the Sunday.
 *
 * Two are left out on purpose:
 *
 *  · the temporal day of the season, which has no canonical id and is keyed
 *    by season, week and psalter instead;
 *  · an optional memorial the reader has not elected, because on that day the
 *    weekday is what is being kept. Electing the memorial in the reader makes
 *    its material appear.
 *
 * Deduplicated by canonical id, which collapses an observance the calendar
 * lists on two rows into the single identity the reader sees.
 */
export function celebrationsFor(today: LiturgicalToday): CanonicalCelebration[] {
  const byId = new Map<string, CanonicalCelebration>();
  for (const celebration of today.celebrations) {
    if (celebration.temporal || !celebration.id) continue;
    if (celebration.rank === 'optional' && celebration.name !== today.observing) continue;
    if (!byId.has(celebration.id)) {
      byId.set(celebration.id, { id: celebration.id, name: celebration.name });
    }
  }
  return [...byId.values()];
}

/** Turn a liturgical day from the production calendar into the contract. */
export function missingPartsDay(today: LiturgicalToday): MissingPartsDay {
  const season = today.season;
  const weekOfSeason = season === 'christmas'
    ? christmasWeekFor(today.iso)
    : season === 'holyweek'
      ? HOLY_WEEK_WEEK_OF_SEASON
      : today.seasonWeek;

  return {
    date: today.iso,
    season,
    weekday: DAY_KEYS.indexOf(today.day),
    psalterWeek: today.week,
    weekOfSeason,
    allowsWeekKey: !SEASONS_WITHOUT_WEEK_KEYS.includes(season) && weekOfSeason !== null,
    celebrations: celebrationsFor(today),
  };
}

/**
 * The liturgical day an hour belongs to.
 *
 * First Vespers is prayed on the evening before, but it belongs to the day
 * that is coming: its material is the next day's, and it must never inherit
 * this evening's Evening Prayer (D6). Every other hour belongs to the day it
 * is prayed on.
 */
export function liturgicalDateForHour(when: Date, hour: Hour): Date {
  if (hour !== 'evening-before') return when;
  // Built from local parts rather than by adding milliseconds, so a daylight
  // saving change cannot land on the same date twice or skip one.
  return new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1);
}

/** The contract for the day and hour the reader is actually praying. */
export function missingPartsDayForHour(
  when: Date,
  hour: Hour,
  options: TodayOptions = {},
): MissingPartsDay {
  return missingPartsDay(liturgicalToday(liturgicalDateForHour(when, hour), options));
}

/**
 * The day and hour the reader is praying, with their own elections applied.
 *
 * The reader elects an optional memorial per calendar date, and the reader
 * interface keeps those elections keyed by local date. First Vespers belongs
 * to the day that is coming, so it must take THAT day's election, not
 * tonight's — which is why this resolves the date first and looks the
 * election up afterwards.
 *
 * Kept here rather than in the interface so that nothing above the adapter
 * needs to reach into the production calendar.
 */
export function missingPartsDayFor(
  when: Date,
  hour: Hour,
  observed: Record<string, string> = {},
): MissingPartsDay {
  const target = liturgicalDateForHour(when, hour);
  return missingPartsDay(liturgicalToday(target, { observe: observed[localDateKey(target)] ?? null }));
}

/** A local calendar date as `YYYY-MM-DD`, matching the reader's own keying. */
export function localDateKey(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

/* Which days a record actually applies on.
 *
 * The liturgical day for a date does not depend on which record is asking, so
 * the window is built once and shared. Computing it per record multiplied the
 * calendar work by the number of records.
 *
 * It lives in the adapter rather than beside the migration engine because
 * three things want it now — migration's preview, the Review screen's "does
 * this key resolve at all?", and the Library's date filter — and the
 * interface must never reach into the migration engine.
 */

import { liturgicalToday } from '../../utils/generalCalendar';
import { entryMatchesDay } from '../data/resolve';
import type { Entry } from '../data/types';
import type { MissingPartsDay } from '../data/day';
import type { ISODate } from '../data/iso';
import { missingPartsDay } from './day';

/** Three years: a psalter key recurs indefinitely, and that is enough to see. */
export const RESOLUTION_WINDOW_DAYS = 365 * 3;

export interface CoverageDay {
  iso: ISODate;
  day: MissingPartsDay;
}

export type DayResolver = (when: Date) => MissingPartsDay;

export const defaultDayResolver: DayResolver = (when) => missingPartsDay(liturgicalToday(when));

export function isoOf(date: Date): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Every day of the window, worked out once. */
export function buildCoverageWindow(
  from: Date,
  windowDays: number,
  resolveDay: DayResolver = defaultDayResolver,
): CoverageDay[] {
  const window: CoverageDay[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const when = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    window.push({ iso: isoOf(when), day: resolveDay(when) });
  }
  return window;
}

/** The dates in the window on which this record applies. */
export function matchingDates(entry: Entry, window: CoverageDay[]): ISODate[] {
  const dates: ISODate[] = [];
  for (const { iso, day } of window) {
    if (entryMatchesDay(entry, day, entry.hour)) dates.push(iso);
  }
  return dates;
}

/** Whether the record applies on any day of the window at all. */
export function resolvesWithin(entry: Entry, window: CoverageDay[]): boolean {
  return window.some(({ day }) => entryMatchesDay(entry, day, entry.hour));
}

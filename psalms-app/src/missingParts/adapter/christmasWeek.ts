/* Christmas-week numbering, derived at the adapter boundary.
 *
 * The production calendar numbers the weeks of Advent, Lent, Easter and
 * Ordinary Time, and returns null for Christmastide — the book has no
 * numbered weeks there. Week-keyed missing-parts material still has to land
 * somewhere in Christmastide, so the number is derived HERE, for that feature
 * alone. `seasonWeek` in src/utils/generalCalendar.ts is untouched and still
 * returns null; nothing the reader displays changes.
 *
 * The divisions are the ones the separate Missing Parts app used, so material
 * already keyed to a Christmas week keeps its meaning:
 *
 *   1  the octave, 25 December to 1 January
 *   2  2 January to the Epiphany on 6 January
 *   3  after the Epiphany, until the Baptism of the Lord closes the season
 */

import type { ISODate } from '../data/iso';
import { dayOfMonthOf, monthOf } from '../data/iso';

export type ChristmasWeek = 1 | 2 | 3;

export function christmasWeekFor(iso: ISODate): ChristmasWeek {
  const month = monthOf(iso);
  const dayOfMonth = dayOfMonthOf(iso);
  // 25-31 December, and 1 January, are the octave.
  if (month === 12) return 1;
  if (dayOfMonth <= 1) return 1;
  if (dayOfMonth <= 6) return 2;
  return 3;
}

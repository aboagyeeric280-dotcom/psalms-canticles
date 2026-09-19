/* The separate Missing Parts app's psalter rule, reproduced for comparison.
 *
 * NOTHING RESOLVES THROUGH THIS. It exists so migration can tell the reader,
 * honestly and in advance, which of their psalter-keyed records will apply on
 * different days once the book's own rule governs them.
 *
 * The two rules genuinely differ, and neither is a bug:
 *
 *   · This book restarts the four-week cycle at four points only — the first
 *     Sundays of Advent and Lent, Easter Sunday, and the first ordinary Sunday
 *     — and counts straight on in between (p. 437).
 *   · The legacy app derived the psalter week arithmetically from the week of
 *     the season: ((week - 1) mod 4) + 1.
 *
 * They agree through Advent, Lent, Easter and the first stretch of Ordinary
 * Time, and disagree through Christmastide and the stretch after Pentecost.
 * The production rule is authoritative; this is only the yardstick for saying
 * what moved.
 */

import { adventStart, easterSunday, utc } from '../../utils/liturgicalCalendar';

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const sundayOnOrBefore = (d: Date) => addDays(d, -d.getUTCDay());

export type LegacySeason = 'advent' | 'christmas' | 'lent' | 'easter' | 'ordinary';

export interface LegacyDay {
  season: LegacySeason;
  weekOfSeason: number;
  psalterWeek: 1 | 2 | 3 | 4;
  weekday: number;
}

/** 1 = the octave, 2 = up to the Epiphany, 3 = after it. */
function christmasWeek(date: Date, christmasYear: number): number {
  if (date <= utc(christmasYear + 1, 0, 1)) return 1;
  if (date <= utc(christmasYear + 1, 0, 6)) return 2;
  return 3;
}

function baptismOfTheLord(year: number): Date {
  const epiphany = utc(year, 0, 6);
  return addDays(epiphany, 7 - epiphany.getUTCDay());
}

function placeInSeason(date: Date): { season: LegacySeason; weekOfSeason: number } {
  const year = date.getUTCFullYear();
  const easter = easterSunday(year);
  const ashWednesday = addDays(easter, -46);
  const pentecost = addDays(easter, 49);
  const advent = adventStart(year);
  const baptism = baptismOfTheLord(year);
  const sunday = sundayOnOrBefore(date);

  if (date >= utc(year, 11, 25)) return { season: 'christmas', weekOfSeason: christmasWeek(date, year) };
  if (date >= advent) return { season: 'advent', weekOfSeason: 1 + diffDays(advent, sunday) / 7 };
  if (date <= baptism) return { season: 'christmas', weekOfSeason: christmasWeek(date, year - 1) };
  if (date >= ashWednesday && date < easter) {
    const lentFirstSunday = addDays(ashWednesday, 4);
    if (date < lentFirstSunday) return { season: 'lent', weekOfSeason: 0 };
    return { season: 'lent', weekOfSeason: 1 + diffDays(lentFirstSunday, sunday) / 7 };
  }
  if (date >= easter && date <= pentecost) {
    return { season: 'easter', weekOfSeason: 1 + diffDays(easter, sunday) / 7 };
  }
  if (date < ashWednesday) {
    return { season: 'ordinary', weekOfSeason: 1 + diffDays(baptism, sunday) / 7 };
  }
  const lastOrdinarySunday = addDays(advent, -7);
  return { season: 'ordinary', weekOfSeason: 34 - diffDays(sunday, lastOrdinarySunday) / 7 };
}

function legacyPsalterWeek(season: LegacySeason, weekOfSeason: number): 1 | 2 | 3 | 4 {
  if (season === 'lent' && weekOfSeason === 0) return 4;
  return ((((weekOfSeason - 1) % 4) + 4) % 4 + 1) as 1 | 2 | 3 | 4;
}

/** How the legacy app would have placed this date. */
export function legacyDayFor(date: Date): LegacyDay {
  const utcDate = utc(date.getFullYear(), date.getMonth(), date.getDate());
  const { season, weekOfSeason } = placeInSeason(utcDate);
  return {
    season,
    weekOfSeason,
    psalterWeek: legacyPsalterWeek(season, weekOfSeason),
    weekday: utcDate.getUTCDay(),
  };
}

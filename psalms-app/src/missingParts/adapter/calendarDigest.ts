/* A digest of everything the production calendar produces.
 *
 * Test support, not application code: nothing in the reader imports this.
 *
 * Phase 2 adds a canonical `id` to every celebration definition. That change
 * must be purely additive — no date, rank, colour, precedence, title or
 * office route may move. Hashing a rich serialisation of five years of the
 * calendar is how that is proved: the expected value was taken before the
 * ids were added, and any drift in existing behaviour changes it.
 *
 * The hash is FNV-1a over UTF-16 code units, which is plenty for detecting
 * an unintended change and needs no platform crypto in a jsdom test.
 */

import { liturgicalToday, isFestal, keepsFirstVespers } from '../../utils/generalCalendar';
import { officeForDay } from '../../utils/officeForDay';

const pad = (n: number) => String(n).padStart(2, '0');

/** One line per day, carrying everything the reader shows or routes on. */
export function serialiseCalendar(fromYear: number, toYear: number): string {
  const lines: string[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
        const when = new Date(year, month, dayOfMonth);
        if (when.getMonth() !== month) continue;
        const today = liturgicalToday(when);
        const firstVespers = keepsFirstVespers(when);
        const plan = officeForDay(today, { firstVespers });
        lines.push([
          `${year}-${pad(month + 1)}-${pad(dayOfMonth)}`,
          today.season, today.seasonWeek ?? '-', today.week, today.day,
          today.sundayCycle, today.weekdayCycle, today.colour,
          today.title,
          today.primary.name, today.primary.rank, today.primary.precedence,
          today.primary.temporal ? 'T' : 'C',
          today.celebrations.map((c) => c.name).join('~'),
          today.optionalMemorials.map((c) => c.name).join('~'),
          today.lateAdvent ? '1' : '0', today.antiphonLabel,
          isFestal(today) ? '1' : '0', firstVespers ? '1' : '0',
          plan.summary,
          plan.hours.map((h) => `${h.hour}:${h.source}:${h.route}`).join('~'),
        ].join('|'));
      }
    }
  }
  return lines.join('\n');
}

/** FNV-1a, rendered as length and hash so a truncation cannot pass. */
export function digest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${value.length}:${hash.toString(16).padStart(8, '0')}`;
}

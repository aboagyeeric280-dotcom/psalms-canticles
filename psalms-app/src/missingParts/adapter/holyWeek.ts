/* Holy Week's week number, derived at the adapter boundary.
 *
 * The production calendar separates Holy Week from Lent and numbers no weeks
 * inside it, so `seasonWeek` is null there. Missing-parts material for Holy
 * Week recurs every year — a Palm Sunday responsory is wanted every Palm
 * Sunday — so it must stay week-keyed rather than being pinned to dates.
 *
 * Holy Week is one week, so it is week 1 of its own season. That is the whole
 * rule. `seasonWeek` in src/utils/generalCalendar.ts still returns null and
 * nothing the reader displays changes.
 *
 * The Triduum is deliberately NOT given a week: it is not a stretch of
 * ordinary weeks, every one of its days has proper texts, and material there
 * belongs to an exact date or to the celebration itself.
 */

import { HOLY_WEEK_WEEK_OF_SEASON } from '../data/day';

export { HOLY_WEEK_WEEK_OF_SEASON };

export function holyWeekNumber(): typeof HOLY_WEEK_WEEK_OF_SEASON {
  return HOLY_WEEK_WEEK_OF_SEASON;
}

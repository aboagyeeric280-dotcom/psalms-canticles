/* Links out to the rest of the Hour.

   Our book prints the psalmody: antiphons, psalms and canticles. It does not
   print the short reading, the responsory, the intercessions or the concluding
   prayer, and every English translation of those is under copyright we do not
   hold. So the app does not carry them, and it must not: nothing here fetches,
   scrapes, caches, proxies, embeds or copies anything from Universalis. This
   module only builds a URL from a date and an hour. It makes no network call,
   and neither does anything that uses it — the link is a link, and it is the
   reader's own browser that follows it.

   Universalis ask to be linked to rather than copied from, and ask to be
   credited by name. Both are done, and both cost us nothing.               */

import type { HourKey } from '../types';

/** The local calendar the links ask Universalis for.

    Their slug for Nigeria, the larger half of the Province of St Joseph the
    Worker. Universalis publish no Ghana calendar; the general `africa`
    calendar is the alternative, and would lose the Nigerian proper days.
    Taken from their own URL format — do not invent a new one here without
    checking it against their link builder at universalis.com/n-link.htm. */
export const UNIVERSALIS_CALENDAR = 'africa.nigeria';

const BASE = 'https://universalis.com';

/** The hours Universalis serve, by the names their URLs use. */
export type UniversalisHour =
  | 'readings' | 'lauds' | 'i-lauds' | 'terce' | 'sext' | 'none' | 'vespers' | 'compline';

/** How each hour of our book stands to the hours Universalis publish.

    Midday Prayer is one office in our book where the Roman office has three;
    it is given Sext, the one it is actually prayed at, as `utils/hours.ts`
    does for the Latin names.

    Evening Prayer I — the book's "Evening Before" — is the Sunday's own
    Vespers, printed by Universalis on the Saturday. Hence the day before the
    day the Hour belongs to. Compline is complete in our book and wants no
    link, so it has no entry.                                               */
const HOURS: Record<HourKey, { hour: UniversalisHour; dayOffset: number }> = {
  morning: { hour: 'lauds', dayOffset: 0 },
  midday: { hour: 'sext', dayOffset: 0 },
  evening: { hour: 'vespers', dayOffset: 0 },
  'evening-before': { hour: 'vespers', dayOffset: -1 },
};

/** The Universalis hour slug for an hour of our book.

    The Invitatory is a separate text in our book, at `#/invitatory`, so the
    plain `lauds` is asked for and the reader is not sent the same psalm
    twice. `i-lauds` is here because their URLs offer it, and because a
    future setting may want it. */
export function universalisHour(hour: HourKey, invitatory = false): UniversalisHour {
  const slug = HOURS[hour].hour;
  return invitatory && slug === 'lauds' ? 'i-lauds' : slug;
}

/** A date as Universalis write it: yyyymmdd, by local parts.

    Local, not UTC: the reader's calendar day is the one the app has been
    showing him all along, and `toISOString` would hand back yesterday for
    anyone west of Greenwich. */
export function universalisDate(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** `d` moved by whole days, by local parts.

    The Date constructor normalises out-of-range days, so the month and year
    boundaries look after themselves — 1 January less a day is 31 December of
    the year before. Built at noon rather than midnight so that a clock going
    forward for summer time cannot land the result on the day before. */
function shiftDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12);
}

export interface UrlOptions {
  /** Ask for Morning Prayer with the Invitatory. Off: our book has its own. */
  invitatory?: boolean;
  /** Override the local calendar. Empty string asks for the General Calendar. */
  calendar?: string;
}

/** The Universalis page for an Hour, given the liturgical day it belongs to.

    `day` is the Hour's own day — for `evening-before`, the Sunday whose First
    Vespers it is, not the Saturday evening it is prayed on. `universalisUrlFor`
    is the one to call when what you hold is the day the reader is praying. */
export function universalisUrl(hour: HourKey, day: Date, opts: UrlOptions = {}): string {
  const { invitatory = false, calendar = UNIVERSALIS_CALENDAR } = opts;
  const date = universalisDate(shiftDays(day, HOURS[hour].dayOffset));
  const path = calendar ? `${calendar}/${date}` : date;
  return `${BASE}/${path}/${universalisHour(hour, invitatory)}.htm`;
}

/** The liturgical day an Hour belongs to, given the day it is prayed on.

    Every Hour is prayed on its own day except Evening Prayer I, which is
    prayed the evening before — so the day it belongs to is the next one. */
export function dayOfHour(hour: HourKey, prayedOn: Date): Date {
  return shiftDays(prayedOn, hour === 'evening-before' ? 1 : 0);
}

/** The Universalis page for an Hour, given the calendar day it is prayed on.

    This is what the reader's screen knows: the date the app is showing. For
    Evening Prayer I the two shifts cancel — the Saturday it is prayed on is
    the Saturday Universalis print it under — and that is not an accident to
    be tidied away: `dayOfHour` and `universalisUrl` each hold to their own
    contract, and this composes them. */
export function universalisUrlFor(hour: HourKey, prayedOn: Date, opts: UrlOptions = {}): string {
  return universalisUrl(hour, dayOfHour(hour, prayedOn), opts);
}

/* ------------------------------------------------------------- the window */

/** How far either side of today the free website can be relied on.

    Universalis publish about a week ahead on the web; the apps they sell go
    further. Our date picker will take any date at all, so a link to next
    year is well formed and still not what the reader expects to open. */
export const WINDOW_DAYS = 7;

/** Whether a date is far enough off that the page may not be there.

    Days, not milliseconds: both dates are reduced to their local calendar day
    first, so a link opened at one minute to midnight is not counted a day out. */
export function outsideWindow(day: Date, today: Date = new Date()): boolean {
  const a = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.abs(a - b) > WINDOW_DAYS * 86400000;
}

/* Plain-date helpers for stored keys.

   Liturgical arithmetic belongs to the production calendar in `src/utils/`.
   Nothing here computes a season, a week or a feast: these are string helpers
   for the `YYYY-MM-DD` values used as exact-date keys, kept in this tree so
   the data core stays calendar-independent.

   Dates are handled as UTC-backed strings so a reader in any timezone stores
   and matches the same key for the same calendar date.                      */

export type ISODate = string; // YYYY-MM-DD

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toISO(parsed) === value;
}

export function toISO(date: Date): ISODate {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromISO(iso: ISODate): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The month of an ISO date, 1-12. */
export function monthOf(iso: ISODate): number {
  return Number(iso.slice(5, 7));
}

/** The day of the month of an ISO date, 1-31. */
export function dayOfMonthOf(iso: ISODate): number {
  return Number(iso.slice(8, 10));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** e.g. "20 December 2026" */
export function formatDateOnly(iso: ISODate): string {
  const date = fromISO(iso);
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** e.g. "1 October" — for a celebration that recurs on an annual date. */
export function formatAnnualDate(month: number, day: number): string {
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export const ROMAN_WEEK = ['', 'I', 'II', 'III', 'IV'] as const;

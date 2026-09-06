/* The traditional Latin names of the hours.

   The book is English throughout and does not print these, so they are shown
   only in the Vellum & Rubric style, and only as a subtitle beside the English
   name the book itself uses. They name the hour, never the text.

   Midday Prayer stands for Terce, Sext and None together — the book prints one
   midday office rather than three — so it is given the middle of the three,
   which is the one it is actually prayed at. */

export const LATIN_HOURS: Record<string, string> = {
  readings: 'Matutinum',
  morning: 'Laudes',
  midday: 'Sexta',
  evening: 'Vesperae',
  'evening-before': 'Vesperae I',
  compline: 'Completorium',
};

/** The Latin name of an hour, or undefined if this text is not an hour. */
export function latinHour(hour: string | undefined): string | undefined {
  return hour ? LATIN_HOURS[hour] : undefined;
}

/** The order the hours are prayed in, for working out what is already past. */
export const HOUR_ORDER = ['readings', 'morning', 'midday', 'evening', 'compline'] as const;

/** Where an hour stands relative to the one due now: done, now, or still to come. */
export function hourState(hour: string, current: string): 'done' | 'now' | 'todo' {
  const a = HOUR_ORDER.indexOf(hour as typeof HOUR_ORDER[number]);
  const b = HOUR_ORDER.indexOf(current as typeof HOUR_ORDER[number]);
  if (a < 0 || b < 0) return 'todo';
  return a < b ? 'done' : a === b ? 'now' : 'todo';
}

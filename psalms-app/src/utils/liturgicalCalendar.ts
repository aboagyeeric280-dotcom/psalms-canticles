/* Liturgical calendar for the Roman rite with Dominican usage.

   The book states the rule for the psalter cycle itself (p. 437):
   "The psalms and canticles on Ferials and Memorials are from the four week
    cycle. This begins afresh on the first Sundays of Advent and Lent, Easter
    Sunday and the first ordinary Sunday of the year."
   Everything here follows from that plus the movable feasts.                */

import type { DayKey, HourKey, SeasonKey } from '../types';

const DAY = 86_400_000;

export const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};
export const HOUR_NAMES: Record<HourKey, string> = {
  'evening-before': 'Evening Before',
  morning: 'Morning Prayer',
  midday: 'Midday Prayer',
  evening: 'Evening Prayer',
};
export const SEASON_NAMES: Record<SeasonKey, string> = {
  advent: 'Advent',
  christmas: 'Christmastide',
  lent: 'Lent',
  holyweek: 'Holy Week',
  triduum: 'the Sacred Triduum',
  easter: 'Eastertide',
  ordinary: 'Through the Year',
};

/* ------------------------------------------------------------ date maths */
export const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const startOfDay = (d: Date) => utc(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);
/** Sunday on or before `d`. */
const sundayOnOrBefore = (d: Date) => addDays(d, -d.getUTCDay());

/** Anonymous Gregorian computus. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}

/** First Sunday of Advent: the fourth Sunday before Christmas Day. */
export function adventStart(year: number): Date {
  const christmas = utc(year, 11, 25);
  return addDays(sundayOnOrBefore(christmas), -21);
}

/** Baptism of the Lord — the first Sunday after Epiphany (6 January). */
function baptismOfTheLord(year: number): Date {
  const epiphany = utc(year, 0, 6);
  return addDays(epiphany, 7 - epiphany.getUTCDay());
}

export interface LiturgicalDay {
  date: Date;
  season: SeasonKey;
  seasonName: string;
  /** 1–4, the week of the psalter cycle. */
  week: 1 | 2 | 3 | 4;
  day: DayKey;
  dayName: string;
  /** Christmas-season Advent propers run 17–24 December. */
  lateAdvent: boolean;
  /** Christmastide before/after Epiphany — the book prints separate antiphons. */
  beforeEpiphany: boolean;
  /** The label under which this day's antiphons are printed in the book. */
  antiphonLabel: string;
  easter: Date;
}

/** Which season a date falls in, and the anchor Sunday its psalter counts from. */
function seasonOf(date: Date) {
  const y = date.getFullYear();
  const easter = easterSunday(y);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const holyThursday = addDays(easter, -3);
  const pentecost = addDays(easter, 49);
  const advent = adventStart(y);
  const prevAdvent = adventStart(y - 1);
  const baptism = baptismOfTheLord(y);
  const lentStart = sundayOnOrBefore(addDays(ashWednesday, 4)); // 1st Sunday of Lent

  let season: SeasonKey;
  let anchor: Date;

  // The book restarts the four-week cycle at only four points: the first
  // Sundays of Advent and of Lent, Easter Sunday, and the first ordinary
  // Sunday of the year. Everywhere else the count simply carries on.
  if (date >= utc(y, 11, 25)) { season = 'christmas'; anchor = advent; }
  else if (date >= advent) { season = 'advent'; anchor = advent; }
  else if (date < baptism) { season = 'christmas'; anchor = prevAdvent; }
  else if (date >= holyThursday && date < easter) { season = 'triduum'; anchor = lentStart; }
  else if (date >= palmSunday && date < holyThursday) { season = 'holyweek'; anchor = lentStart; }
  else if (date >= ashWednesday && date < easter) { season = 'lent'; anchor = lentStart; }
  else if (date >= easter && date <= pentecost) { season = 'easter'; anchor = easter; }
  else if (date > pentecost) { season = 'ordinary'; anchor = easter; }
  else { season = 'ordinary'; anchor = baptism; }   // Baptism to Ash Wednesday

  return { season, anchor, easter, advent, baptism, lentStart };
}

export function liturgicalDay(now: Date = new Date()): LiturgicalDay {
  const date = startOfDay(now);
  const { season, anchor, easter } = seasonOf(date);

  const weeksSince = Math.floor(diffDays(sundayOnOrBefore(date), sundayOnOrBefore(anchor)) / 7);
  const week = (((weeksSince % 4) + 4) % 4 + 1) as 1 | 2 | 3 | 4;
  const day = DAY_KEYS[date.getUTCDay()];

  const m = date.getMonth(), dd = date.getDate();
  const lateAdvent = season === 'advent' && m === 11 && dd >= 17 && dd <= 24;
  const beforeEpiphany = season === 'christmas' && !(m === 0 && dd >= 6);

  const antiphonLabel =
    season === 'advent' ? 'Advent'
      : season === 'christmas' ? 'Christmastide'
        : season === 'lent' ? 'Lent'
          : season === 'holyweek' || season === 'triduum' ? 'Holy Week'
            : season === 'easter' ? 'Eastertide'
              : 'Through the Year';

  return {
    date, season, seasonName: SEASON_NAMES[season], week, day,
    dayName: DAY_NAMES[day], lateAdvent, beforeEpiphany, antiphonLabel, easter,
  };
}

/* ------------------------------------------------------------ hour of day */
export interface HourSuggestion {
  hour: HourKey | 'compline' | 'readings';
  label: string;
  reason: string;
}

/** The hour a friar would most likely be turning to at this moment. */
export function suggestHour(now: Date = new Date()): HourSuggestion {
  const h = now.getHours();
  if (h < 4) return { hour: 'compline', label: 'Compline', reason: 'Night Prayer, before rest' };
  if (h < 11) return { hour: 'morning', label: 'Morning Prayer', reason: 'Lauds, at the start of the day' };
  if (h < 15) return { hour: 'midday', label: 'Midday Prayer', reason: 'Terce, Sext or None' };
  if (h < 20) return { hour: 'evening', label: 'Evening Prayer', reason: 'Vespers, as the day closes' };
  return { hour: 'compline', label: 'Compline', reason: 'Night Prayer, before rest' };
}

/** After Evening Prayer on Saturday the Church already keeps Sunday. */
export function isEveningBefore(now: Date = new Date()): boolean {
  return now.getDay() === 6 && now.getHours() >= 15;
}

/** Which of the seven Compline psalm sets belongs to this evening. */
export function complineDayKey(now: Date = new Date()): DayKey {
  return DAY_KEYS[now.getDay()];
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV'] as const;

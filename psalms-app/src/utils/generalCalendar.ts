/* The liturgical day: which celebration is kept, at what rank, in what
   colour, and which week of the psalter it draws on.

   The temporal cycle (seasons, the psalter week) lives in
   liturgicalCalendar.ts and is unchanged. This adds the movable feasts, the
   fixed calendar, and the precedence rules that decide between them. */

import {
  DAY_KEYS, DAY_NAMES, SEASON_NAMES, adventStart, easterSunday,
  liturgicalDay, utc,
} from './liturgicalCalendar';
import {
  DOMINICAN, RANK_NAMES, SANCTORAL,
  type Celebration, type Colour, type Common, type Rank,
} from '../data/sanctoral';
import type { DayKey, SeasonKey } from '../types';

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const sundayOnOrBefore = (d: Date) => addDays(d, -d.getUTCDay());

/* The Table of Liturgical Days decides what is kept when two things fall on
   the same date. Lower number wins. Ranking alone is not enough: a feast and
   a Sunday are both "high", but which gives way depends on the season, and a
   memorial in Lent yields to the weekday while still being remembered. */
const P = {
  Principal: 1,      // Triduum, Easter and its octave, Christmas, Epiphany,
                      // Ascension, Pentecost, Ash Wednesday, Holy Week
  PrivilegedSunday: 2, // Sundays of Advent, Lent and Easter
  Solemnity: 3,
  FeastOfTheLord: 5,
  Sunday: 6,         // Sundays of Christmas and of Ordinary Time
  Feast: 7,
  PrivilegedWeekday: 9, // 17–24 December, the Christmas octave, Lent
  Memorial: 10,
  OptionalMemorial: 12,
  Weekday: 13,
} as const;

export interface Celebrated {
  name: string;
  rank: Rank;
  rankName: string;
  colour: Colour;
  common: Common;
  properKey?: string;
  /** True when the day belongs to the seasonal cycle rather than a saint. */
  temporal: boolean;
  /** Position in the Table of Liturgical Days; lower wins. */
  precedence: number;
}

export interface LiturgicalToday {
  date: Date;
  iso: string;
  /** Sunday, Monday… */
  day: DayKey;
  dayName: string;
  season: SeasonKey;
  seasonName: string;
  /** Week of the season — "22" in "22nd Week in Ordinary Time". */
  seasonWeek: number | null;
  /** The four-week psalter. */
  week: 1 | 2 | 3 | 4;
  /** A, B or C for Sundays; I or II for weekdays. */
  sundayCycle: 'A' | 'B' | 'C';
  weekdayCycle: 'I' | 'II';
  /** What is kept today, most important first. */
  celebrations: Celebrated[];
  /** The one the office follows. */
  primary: Celebrated;
  /** Optional memorials falling today, whether they are kept or passed over. */
  optionalMemorials: Celebrated[];
  /** The optional memorial being kept, by name, or null for the weekday. */
  observing: string | null;
  colour: Colour;
  /** The full title, as it would be announced. */
  title: string;
  /** True on the evening before a Sunday or solemnity. */
  hasFirstVespers: boolean;
  /** The label under which the book prints this day's antiphons. */
  antiphonLabel: string;
  lateAdvent: boolean;
}

/* ------------------------------------------------------- movable feasts */
function movable(year: number): Map<string, Celebration> {
  const easter = easterSunday(year);
  const advent = adventStart(year);
  const christmas = utc(year, 11, 25);
  const m = new Map<string, Celebration>();
  const put = (d: Date, c: Omit<Celebration, 'month' | 'day'>) =>
    m.set(iso(d), { ...c, month: d.getUTCMonth() + 1, day: d.getUTCDate() });

  put(addDays(easter, -46), { name: 'Ash Wednesday', principal: true, rank: 'feast', colour: 'violet', properKey: 'ASH WEDNESDAY' });
  put(addDays(easter, -7), { name: 'Palm Sunday of the Passion of the Lord', principal: true, rank: 'solemnity', colour: 'red' });
  put(addDays(easter, -3), { name: 'Holy Thursday', principal: true, rank: 'solemnity', colour: 'white' });
  put(addDays(easter, -2), { name: 'Good Friday of the Passion of the Lord', principal: true, rank: 'solemnity', colour: 'red', properKey: 'GOOD FRIDAY' });
  put(addDays(easter, -1), { name: 'Holy Saturday', principal: true, rank: 'solemnity', colour: 'white', properKey: 'HOLY SATURDAY' });
  put(easter, { name: 'Easter Sunday of the Resurrection of the Lord', principal: true, rank: 'solemnity', colour: 'white', properKey: 'EASTER & OCTAVE' });
  for (let i = 1; i <= 6; i++) {
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    put(addDays(easter, i), { name: `${names[i - 1]} within the Octave of Easter`, principal: true, rank: 'solemnity', colour: 'white', properKey: `EASTER ${names[i - 1].toUpperCase()}` });
  }
  put(addDays(easter, 7), { name: 'Second Sunday of Easter', principal: true, rank: 'solemnity', colour: 'white', properKey: '2ND SUNDAY OF EASTER' });
  put(addDays(easter, 39), { name: 'The Ascension of the Lord', principal: true, rank: 'solemnity', colour: 'white', properKey: 'ASCENSION' });
  put(addDays(easter, 49), { name: 'Pentecost Sunday', principal: true, rank: 'solemnity', colour: 'red', properKey: 'PENTECOST' });
  put(addDays(easter, 56), { name: 'The Most Holy Trinity', rank: 'solemnity', colour: 'white', properKey: 'TRINITY' });
  put(addDays(easter, 60), { name: 'The Most Holy Body and Blood of Christ', rank: 'solemnity', colour: 'white', properKey: 'BODY AND BLOOD OF CHRIST' });
  put(addDays(easter, 68), { name: 'The Most Sacred Heart of Jesus', rank: 'solemnity', colour: 'white', properKey: 'SACRED HEART' });
  put(addDays(easter, 69), { name: 'The Immaculate Heart of the Blessed Virgin Mary', rank: 'memorial', colour: 'white', common: 'mary' });

  // Christ the King — the Sunday before Advent.
  put(addDays(advent, -7), { name: 'Our Lord Jesus Christ, King of the Universe', rank: 'solemnity', colour: 'white', properKey: 'CHRIST THE KING' });

  // The Holy Family — the Sunday in the octave of Christmas, or 30 December
  // when Christmas falls on a Sunday and there is no such Sunday.
  const sundayAfterChristmas = addDays(sundayOnOrBefore(addDays(christmas, 7)), 0);
  const holyFamily = sundayAfterChristmas.getTime() === christmas.getTime()
    ? utc(year, 11, 30) : sundayAfterChristmas;
  put(holyFamily, { name: 'The Holy Family of Jesus, Mary and Joseph', rank: 'feast', colour: 'white', properKey: 'HOLY FAMILY (SUNDAY)' });

  // The Baptism of the Lord closes Christmastide.
  const epiphany = utc(year, 0, 6);
  put(addDays(epiphany, 7 - epiphany.getUTCDay()), { name: 'The Baptism of the Lord', rank: 'feast', colour: 'white', properKey: 'BAPTISM OF THE LORD' });
  put(epiphany, { name: 'The Epiphany of the Lord', principal: true, rank: 'solemnity', colour: 'white', properKey: 'EPIPHANY' });

  return m;
}

const movableCache = new Map<number, Map<string, Celebration>>();
function movableFor(year: number) {
  if (!movableCache.has(year)) movableCache.set(year, movable(year));
  return movableCache.get(year)!;
}

/* --------------------------------------------------- the week of a season */
function seasonWeek(date: Date, season: SeasonKey, year: number): number | null {
  const easter = easterSunday(year);
  const sunday = sundayOnOrBefore(date);
  const weeks = (from: Date) => Math.floor((sunday.getTime() - sundayOnOrBefore(from).getTime()) / (7 * DAY));

  if (season === 'advent') return weeks(adventStart(year)) + 1;
  if (season === 'lent') return weeks(addDays(easter, -42)) + 1;
  if (season === 'easter') return weeks(easter) + 1;
  if (season === 'ordinary') {
    // Ordinary Time is counted in two stretches: from the Baptism of the Lord
    // to Ash Wednesday, then from Pentecost to Advent, running to week 34.
    const epiphany = utc(year, 0, 6);
    const baptism = addDays(epiphany, 7 - epiphany.getUTCDay());
    if (date <= addDays(easter, -46)) return weeks(baptism) + 1;
    const advent = adventStart(year);
    const weeksToAdvent = Math.floor((sundayOnOrBefore(addDays(advent, -1)).getTime() - sunday.getTime()) / (7 * DAY));
    return 34 - weeksToAdvent;
  }
  return null;
}

/* -------------------------------------------------------------- the day */
export interface TodayOptions {
  /** The optional memorial to keep, by name. Absent or null keeps the weekday. */
  observe?: string | null;
}

export function liturgicalToday(when: Date = new Date(), opts: TodayOptions = {}): LiturgicalToday {
  const base = liturgicalDay(when);
  const date = base.date;
  const year = date.getFullYear();
  const key = iso(date);
  const isSunday = date.getUTCDay() === 0;

  const temporalName = (() => {
    const w = seasonWeek(date, base.season, year);
    const dayName = DAY_NAMES[base.day];
    if (base.season === 'ordinary') {
      return isSunday ? `${ordinal(w!)} Sunday in Ordinary Time`
        : `${dayName} of the ${ordinal(w!)} Week in Ordinary Time`;
    }
    if (base.season === 'advent') {
      return isSunday ? `${ordinal(w!)} Sunday of Advent`
        : `${dayName} of the ${ordinal(w!)} Week of Advent`;
    }
    if (base.season === 'lent') {
      // The four days from Ash Wednesday to the Saturday following come
      // before the First Sunday, so they are named from Ash Wednesday.
      if (w! < 1) return `${dayName} after Ash Wednesday`;
      return isSunday ? `${ordinal(w!)} Sunday of Lent`
        : `${dayName} of the ${ordinal(w!)} Week of Lent`;
    }
    if (base.season === 'easter') {
      return isSunday ? `${ordinal(w!)} Sunday of Easter`
        : `${dayName} of the ${ordinal(w!)} Week of Easter`;
    }
    if (base.season === 'christmas') return `${dayName} of Christmastide`;
    return `${dayName} of ${SEASON_NAMES[base.season]}`;
  })();

  // The day in the seasonal cycle, before any saint is considered.
  const privilegedSeason = base.season === 'advent' || base.season === 'lent' || base.season === 'easter';
  const temporal: Celebrated = {
    name: temporalName,
    rank: isSunday ? 'solemnity' : 'ferial',
    rankName: isSunday ? 'Sunday' : 'Weekday',
    colour: seasonColour(base.season, date, year),
    common: null,
    temporal: true,
    precedence: isSunday
      ? (privilegedSeason ? P.PrivilegedSunday : P.Sunday)
      : (base.lateAdvent || base.season === 'lent' || base.season === 'christmas'
        ? P.PrivilegedWeekday : P.Weekday),
  };

  const found: Celebrated[] = [];
  const mv = movableFor(year).get(key);
  if (mv) found.push(toCelebrated(mv, false));
  for (const c of [...SANCTORAL, ...DOMINICAN]) {
    if (c.month === date.getUTCMonth() + 1 && c.day === date.getUTCDate()) found.push(toCelebrated(c, false));
  }

  /* An optional memorial is exactly that: the weekday is kept unless the
     reader elects the saint. Electing one gives it a memorial's place in the
     Table of Liturgical Days; any others stand down below the weekday. On a
     privileged weekday the weekday still wins and the saint is only
     commemorated, which is the rule the book itself follows. */
  const optionalMemorials = found.filter(c => c.rank === 'optional');
  const observing = opts.observe && optionalMemorials.some(c => c.name === opts.observe)
    ? opts.observe
    : null;
  for (const c of optionalMemorials) {
    c.precedence = c.name === observing ? P.Memorial : P.Weekday + 1;
  }

  // Holy Week and the Easter octave admit nothing else at all.
  const inviolable = base.season === 'holyweek' || base.season === 'triduum';
  if (inviolable) temporal.precedence = P.Principal;

  const ranked = [...found, temporal].sort((a, b) => a.precedence - b.precedence);
  const primary = ranked[0];

  // Deduplicate, keeping the order precedence gave them.
  const celebrations = ranked.filter((c, i) => ranked.findIndex(x => x.name === c.name) === i);

  const w = seasonWeek(date, base.season, year);

  return {
    date, iso: key,
    day: base.day, dayName: base.dayName,
    season: base.season, seasonName: base.seasonName, seasonWeek: w,
    week: base.week,
    sundayCycle: sundayCycle(date, year),
    weekdayCycle: (year % 2 === 1 ? 'I' : 'II'),
    celebrations, primary, optionalMemorials, observing,
    colour: primary.colour,
    title: primary.temporal ? temporalName : primary.name,
    hasFirstVespers: false,
    antiphonLabel: base.antiphonLabel,
    lateAdvent: base.lateAdvent,
  };
}

/** Whether the day draws on the book's festal psalms rather than the psalter.
    An ordinary Sunday does not: the psalter has its own Sunday office. */
export function isFestal(day: LiturgicalToday): boolean {
  const plainSunday = day.primary.temporal && !day.primary.properKey && day.day === 'sun';
  return !plainSunday && (day.primary.rank === 'solemnity' || day.primary.rank === 'feast');
}

/* The evening before a Sunday or a solemnity keeps its First Vespers — but
   only when tomorrow outranks today. A solemnity falling on a Saturday keeps
   its own Second Vespers that evening, and the Sunday's First Vespers gives
   way to it. */
export function keepsFirstVespers(when: Date): boolean {
  const today = liturgicalToday(when);
  const tomorrow = liturgicalToday(new Date(when.getTime() + DAY));
  const eveOfSomething = tomorrow.date.getUTCDay() === 0 || tomorrow.primary.rank === 'solemnity';
  return eveOfSomething && tomorrow.primary.precedence < today.primary.precedence;
}

function toCelebrated(c: Celebration, temporal: boolean): Celebrated {
  const precedence =
    c.principal ? P.Principal
      : c.rank === 'solemnity' ? P.Solemnity
        : c.rank === 'feast' ? (c.ofTheLord ? P.FeastOfTheLord : P.Feast)
          : c.rank === 'memorial' ? P.Memorial
            : c.rank === 'optional' ? P.OptionalMemorial : P.Weekday;
  return {
    name: c.name, rank: c.rank, rankName: RANK_NAMES[c.rank],
    colour: c.colour, common: c.common ?? null,
    properKey: c.properKey, temporal, precedence,
  };
}

function seasonColour(season: SeasonKey, date: Date, year: number): Colour {
  if (season === 'advent') {
    // Gaudete, the third Sunday, is rose.
    const third = addDays(adventStart(year), 14);
    return date.getTime() === third.getTime() ? 'rose' : 'violet';
  }
  if (season === 'lent') {
    const easter = easterSunday(year);
    const laetare = addDays(easter, -21);        // the fourth Sunday
    return date.getTime() === laetare.getTime() ? 'rose' : 'violet';
  }
  if (season === 'holyweek') return 'violet';
  if (season === 'triduum') return 'red';
  if (season === 'christmas' || season === 'easter') return 'white';
  return 'green';
}

/** The three-year Sunday cycle turns over on the First Sunday of Advent. */
function sundayCycle(date: Date, year: number): 'A' | 'B' | 'C' {
  const liturgicalYear = date >= adventStart(year) ? year + 1 : year;
  return (['C', 'A', 'B'] as const)[liturgicalYear % 3];
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { ordinal };
export const COLOUR_HEX: Record<Colour, string> = {
  white: '#96762a', red: '#8e2f2a', green: '#3d6b46',
  violet: '#6b2f6e', rose: '#b0637f', black: '#3a3a3a',
};
export { DAY_KEYS };

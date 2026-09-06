/* Which office the book appoints for a given liturgical day.

   The book states its own rule on p. 437: ferials and memorials take their
   psalms from the four-week cycle, while feasts and solemnities have special
   psalms — "MORNING PSALMS FOR ALL FEASTS: as on Sunday 1, p. 37", with the
   midday and Office of Readings psalms listed in the tables that follow, and
   Evening Prayer at pp. 286ff (commons) and 298ff (propers).

   What the book does not contain is a proper for every saint: there are no
   sanctoral antiphons or collects in it. On a memorial the honest answer is
   the weekday psalter plus the relevant common, and to say plainly that the
   proper texts are not in this book. */

import { COMMON_NAMES, type Common } from '../data/sanctoral';
import type { HourKey } from '../types';
import type { LiturgicalToday } from './generalCalendar';
import { ROMAN } from './liturgicalCalendar';

export type Source = 'psalter' | 'festal' | 'proper' | 'common' | 'none';

export interface HourPlan {
  hour: HourKey | 'compline' | 'readings';
  label: string;
  /** Where the text comes from. */
  source: Source;
  /** Where to send the reader. */
  route: string;
  /** What they will find there. */
  detail: string;
  /** Anything the book leaves to the community, said plainly. */
  caveat?: string;
}

export interface DayPlan {
  festal: boolean;
  hours: HourPlan[];
  /** A sentence describing how the day is kept. */
  summary: string;
  /** True when this evening belongs to tomorrow's solemnity. */
  firstVespers: boolean;
}

const COMMON_ROUTE = '#/feasts/common';
const PROPER_ROUTE = '#/feasts/proper';

export function officeForDay(day: LiturgicalToday, opts: { firstVespers?: boolean } = {}): DayPlan {
  const { primary, week, day: dayKey } = day;
  const rank = primary.rank;

  /* An ordinary Sunday ranks as high as a solemnity, but it is not a feast in
     the sense the book means: the psalter already has a Sunday office for
     each of the four weeks, and only a day with a proper or a common draws on
     the festal psalms. Easter and Pentecost are Sundays too, and those do. */
  const plainSunday = primary.temporal && !primary.properKey && dayKey === 'sun';
  const festal = !plainSunday && (rank === 'solemnity' || rank === 'feast');
  const firstVespers = !!opts.firstVespers;

  const psalterRoute = (hour: HourKey) => `#/office/w${week}-${dayKey}-${hour}`;
  const hours: HourPlan[] = [];

  /* ------------------------------------------------------------ Morning */
  if (festal) {
    hours.push({
      hour: 'morning',
      label: 'Morning Prayer',
      source: 'festal',
      // The book: "MORNING PSALMS FOR ALL FEASTS: as on Sunday 1, p.37".
      route: '#/office/w1-sun-morning',
      detail: 'Sunday I — the book appoints these psalms for every feast (p. 437)',
      caveat: primary.temporal ? undefined
        : 'The book prints no proper antiphons for this celebration; the Sunday I antiphons stand.',
    });
  } else {
    hours.push({
      hour: 'morning',
      label: 'Morning Prayer',
      source: 'psalter',
      route: psalterRoute('morning'),
      detail: `Week ${ROMAN[week]} of the psalter`,
      caveat: rank === 'memorial' || rank === 'optional'
        ? 'A memorial keeps the weekday psalms. Its own antiphons and collect are not printed in this book.'
        : undefined,
    });
  }

  /* ------------------------------------------------------------- Midday */
  hours.push({
    hour: 'midday',
    label: 'Midday Prayer',
    source: festal ? 'festal' : 'psalter',
    route: festal ? '#/tables' : psalterRoute('midday'),
    detail: festal
      ? 'The book lists the midday psalms for each feast in its own table'
      : `Week ${ROMAN[week]} of the psalter`,
  });

  /* ------------------------------------------------------------ Evening */
  const eveningFor = firstVespers ? 'First Vespers' : 'Evening Prayer';
  if (festal || firstVespers) {
    if (primary.properKey) {
      hours.push({
        hour: 'evening', label: eveningFor, source: 'proper', route: PROPER_ROUTE,
        detail: `Proper Feasts — ${titleCase(primary.properKey)}`,
      });
    } else if (primary.common) {
      hours.push({
        hour: 'evening', label: eveningFor, source: 'common', route: COMMON_ROUTE,
        detail: `Common of ${COMMON_NAMES[primary.common as Exclude<Common, null>]}`,
        caveat: firstVespers ? 'Kept this evening because tomorrow is a solemnity.' : undefined,
      });
    } else {
      hours.push({
        hour: 'evening', label: eveningFor, source: 'psalter',
        route: firstVespers ? `#/office/w${week}-sun-evening-before` : psalterRoute('evening'),
        detail: firstVespers ? 'Sunday — Evening Before' : `Week ${ROMAN[week]} of the psalter`,
      });
    }
  } else {
    hours.push({
      hour: 'evening', label: 'Evening Prayer', source: 'psalter',
      route: psalterRoute('evening'),
      detail: `Week ${ROMAN[week]} of the psalter`,
      caveat: rank === 'memorial' || rank === 'optional'
        ? `The Magnificat antiphon and collect proper to this memorial are not in the book; the Common of ${primary.common ? COMMON_NAMES[primary.common as Exclude<Common, null>] : 'the saints'} is the nearest it offers.`
        : undefined,
    });
  }

  /* --------------------------------------------------- Office of Readings */
  hours.push({
    hour: 'readings',
    label: 'Office of Readings',
    source: festal ? 'festal' : 'psalter',
    route: festal ? '#/tables' : `#/readings/read-w${week}-${dayKey}`,
    detail: festal
      ? 'The book lists the Office of Readings psalms for each feast in its own table'
      : `Week ${ROMAN[week]} — meditation psalms`,
  });

  /* ------------------------------------------------------------ Compline */
  hours.push({
    hour: 'compline',
    label: 'Compline',
    source: 'psalter',
    route: '#/compline',
    detail: rank === 'solemnity' || dayKey === 'sun'
      ? 'Sunday psalms — the book appoints them on solemnities'
      : `${capitalise(day.dayName)} psalms`,
  });

  // "A solemnity", but "An optional memorial".
  const rankWord = primary.rankName.toLowerCase();
  const rankPhrase = `${/^[aeiou]/.test(rankWord) ? 'An' : 'A'} ${rankWord}`;

  const summary = festal
    ? `${rankPhrase}: the psalms of Sunday I, with Evening Prayer from the ${primary.properKey ? 'proper' : 'common'}.`
    : plainSunday
      ? `Sunday of Week ${ROMAN[week]}: the psalter's own Sunday office throughout.`
      : rank === 'memorial' || rank === 'optional'
        ? `${rankPhrase}: the weekday psalter, with the memorial kept at the Benedictus and Magnificat.`
        : `A weekday: Week ${ROMAN[week]} of the psalter throughout.`;

  return { festal, hours, summary, firstVespers };
}

function titleCase(s: string) {
  return s.replace(/\w\S*/g, w => w[0] + w.slice(1).toLowerCase());
}
function capitalise(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

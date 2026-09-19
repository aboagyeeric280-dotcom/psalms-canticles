import { describe, expect, it } from 'vitest';
import { liturgicalToday } from '../../utils/generalCalendar';
import { SEASON_NAMES } from '../../utils/liturgicalCalendar';
import { SEASON_LABELS, EMPTY_CONTENT, type Entry } from '../data/types';
import { resolveOffice } from '../data/resolve';
import {
  celebrationsFor, liturgicalDateForHour, missingPartsDay, missingPartsDayForHour,
} from './day';
import { christmasWeekFor } from './christmasWeek';

const on = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayOf = (iso: string) => missingPartsDay(liturgicalToday(on(iso)));

function entry(partial: Partial<Entry> & Pick<Entry, 'keyType' | 'hour'>): Entry {
  return {
    ...EMPTY_CONTENT,
    id: Math.random().toString(36).slice(2),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('test 4: full-list matching, even when the celebration is not first', () => {
  it('carries the Baptism of the Lord although the Sunday leads the day', () => {
    const today = liturgicalToday(on('2027-01-10'));
    // The calendar names the day after the Sunday, which outranks the feast.
    expect(today.primary.temporal).toBe(true);
    expect(today.primary.name).toContain('Sunday in Ordinary Time');
    expect(today.celebrations.map((c) => c.name)).toContain('The Baptism of the Lord');

    const day = missingPartsDay(today);
    expect(day.celebrations.map((c) => c.id)).toContain('baptism-of-the-lord');

    const material = entry({
      keyType: 'celebration', hour: 'morning',
      celebrationId: 'baptism-of-the-lord', intercessions: 'Baptism intercessions.',
    });
    const office = resolveOffice([material], day, 'morning');
    expect(office.sections.intercessions.present).toBe(true);
  });

  it('carries the Annunciation when Holy Thursday displaces it', () => {
    // In 2027 the Annunciation falls on Holy Thursday and gives way.
    const today = liturgicalToday(on('2027-03-25'));
    expect(today.primary.name).toBe('Holy Thursday');
    const day = missingPartsDay(today);
    const ids = day.celebrations.map((c) => c.id);
    expect(ids).toContain('holy-thursday');
    expect(ids).toContain('annunciation');
  });

  it('leaves the temporal day out: it is keyed by season and week, not celebration', () => {
    const day = dayOf('2027-06-15');
    expect(day.celebrations.every((c) => c.id.length > 0)).toBe(true);
    expect(day.celebrations.map((c) => c.name)).not.toContain('15th Week in Ordinary Time');
  });

  it('does not change which celebration the day is named after', () => {
    for (const iso of ['2027-01-10', '2027-03-25', '2027-12-25', '2027-08-08']) {
      const today = liturgicalToday(on(iso));
      const before = today.primary.name;
      missingPartsDay(today);
      expect(liturgicalToday(on(iso)).primary.name).toBe(before);
    }
  });
});

describe('test 5: the duplicate Raymond rows do not create duplicate matches', () => {
  it('exposes exactly one Raymond identity on 7 January', () => {
    const day = dayOf('2027-01-07');
    const raymond = day.celebrations.filter((c) => c.id === 'saint-raymond-of-penyafort');
    expect(raymond).toHaveLength(1);
  });

  it('resolves material for him once, with nothing reported as a duplicate', () => {
    const material = entry({
      keyType: 'celebration', hour: 'morning',
      celebrationId: 'saint-raymond-of-penyafort', responsory: 'A responsory.',
    });
    const office = resolveOffice([material], dayOf('2027-01-07'), 'morning');
    expect(office.sections.responsory.present).toBe(true);
    expect(office.sections.responsory.duplicates).toHaveLength(0);
    expect(office.candidates.celebration).toHaveLength(1);
  });

  it('never exposes the same id twice on any day over five years', () => {
    for (let year = 2026; year <= 2030; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        for (let d = 1; d <= 31; d += 1) {
          const when = new Date(year, month, d);
          if (when.getMonth() !== month) continue;
          const ids = missingPartsDay(liturgicalToday(when)).celebrations.map((c) => c.id);
          expect(new Set(ids).size, `${when.toDateString()} repeats an id`).toBe(ids.length);
        }
      }
    }
  });
});

describe('an optional memorial supplies material only when it is kept', () => {
  const ISO = '2027-01-13'; // St Hilary, an optional memorial.

  it('is left out while the weekday is being kept', () => {
    const day = missingPartsDay(liturgicalToday(on(ISO)));
    expect(day.celebrations.map((c) => c.id)).not.toContain('saint-hilary');
  });

  it('appears once the reader elects it', () => {
    const day = missingPartsDay(liturgicalToday(on(ISO), { observe: 'St Hilary, Bishop and Doctor' }));
    expect(day.celebrations.map((c) => c.id)).toContain('saint-hilary');
  });
});

describe('test 6: Christmas weeks are derived only in the adapter', () => {
  it('leaves the production calendar returning no week in Christmastide', () => {
    for (const iso of ['2026-12-26', '2027-01-02', '2027-01-08']) {
      expect(liturgicalToday(on(iso)).season).toBe('christmas');
      expect(liturgicalToday(on(iso)).seasonWeek).toBeNull();
    }
  });

  it('supplies the octave, before Epiphany and after Epiphany', () => {
    expect(dayOf('2026-12-25').weekOfSeason).toBe(1);
    expect(dayOf('2026-12-31').weekOfSeason).toBe(1);
    expect(dayOf('2027-01-01').weekOfSeason).toBe(1);
    expect(dayOf('2027-01-02').weekOfSeason).toBe(2);
    expect(dayOf('2027-01-06').weekOfSeason).toBe(2);
    expect(dayOf('2027-01-07').weekOfSeason).toBe(3);
  });

  it('lets a week-keyed record resolve in Christmastide', () => {
    const material = entry({
      keyType: 'week', hour: 'morning', season: 'christmas', weekOfSeason: 2,
      concludingPrayer: 'A prayer for the days before the Epiphany.',
    });
    expect(resolveOffice([material], dayOf('2027-01-02'), 'morning').sections.concludingPrayer.present).toBe(true);
    expect(resolveOffice([material], dayOf('2027-01-07'), 'morning').sections.concludingPrayer.present).toBe(false);
  });

  it('numbers the week from the date alone', () => {
    expect(christmasWeekFor('2026-12-25')).toBe(1);
    expect(christmasWeekFor('2027-01-01')).toBe(1);
    expect(christmasWeekFor('2027-01-05')).toBe(2);
    expect(christmasWeekFor('2027-01-09')).toBe(3);
  });
});

describe('week keys where the calendar has no week', () => {
  it('forbids them in the Triduum and Holy Week', () => {
    expect(dayOf('2027-03-25').season).toBe('triduum');
    expect(dayOf('2027-03-25').allowsWeekKey).toBe(false);
    expect(dayOf('2027-03-23').season).toBe('holyweek');
    expect(dayOf('2027-03-23').allowsWeekKey).toBe(false);
  });

  it('allows them everywhere the calendar does number the week', () => {
    for (const iso of ['2027-06-15', '2026-12-06', '2027-03-10', '2027-04-20', '2027-01-02']) {
      expect(dayOf(iso).allowsWeekKey, iso).toBe(true);
      expect(dayOf(iso).weekOfSeason, iso).not.toBeNull();
    }
  });
});

describe('test 7: Corpus Christi keeps the production calendar’s date', () => {
  it.each([
    ['2027', '2027-05-27'],
    ['2028', '2028-06-15'],
  ])('in %s it falls on the Thursday the calendar appoints', (_year, iso) => {
    expect(dayOf(iso).celebrations.map((c) => c.id)).toContain('corpus-christi');
  });

  it('is not moved to the Sunday by this feature', () => {
    // The Sunday three days later carries no Corpus Christi.
    expect(dayOf('2027-05-30').celebrations.map((c) => c.id)).not.toContain('corpus-christi');
  });

  it('is the same day the production calendar names, unchanged', () => {
    expect(liturgicalToday(on('2027-05-27')).primary.name).toBe('The Most Holy Body and Blood of Christ');
  });
});

describe('test 8: First Vespers resolves to the coming day', () => {
  it('takes Christmas Eve evening to Christmas Day', () => {
    const day = missingPartsDayForHour(on('2027-12-24'), 'evening-before');
    expect(day.date).toBe('2027-12-25');
    expect(day.celebrations.map((c) => c.id)).toContain('christmas');
  });

  it('takes a Saturday evening to the Sunday', () => {
    const day = missingPartsDayForHour(on('2027-06-19'), 'evening-before');
    expect(day.date).toBe('2027-06-20');
    expect(day.weekday).toBe(0);
  });

  it('leaves every other hour on the day it is prayed', () => {
    for (const hour of ['morning', 'midday', 'evening', 'night'] as const) {
      expect(missingPartsDayForHour(on('2027-12-24'), hour).date).toBe('2027-12-24');
    }
  });

  it('steps the date without tripping over a daylight saving change', () => {
    // The last Sunday of March and October, when clocks move in many places.
    expect(liturgicalDateForHour(on('2027-03-27'), 'evening-before').getDate()).toBe(28);
    expect(liturgicalDateForHour(on('2027-10-30'), 'evening-before').getDate()).toBe(31);
  });

  it('does not let Evening Prayer material stand in for First Vespers', () => {
    const evening = entry({
      keyType: 'date', hour: 'evening', date: '2027-12-24', responsory: 'Evening of the 24th.',
    });
    const day = missingPartsDayForHour(on('2027-12-24'), 'evening-before');
    expect(resolveOffice([evening], day, 'evening-before').sections.responsory.present).toBe(false);
  });
});

describe('test 11: shared constants do not drift', () => {
  it('uses exactly the production calendar’s season names', () => {
    expect(SEASON_LABELS).toEqual(SEASON_NAMES);
  });

  it('maps the weekday the same way the production calendar does', () => {
    for (const iso of ['2027-01-10', '2027-01-11', '2027-01-16']) {
      expect(dayOf(iso).weekday).toBe(on(iso).getDay());
    }
  });

  it('takes the psalter week from the production calendar unchanged', () => {
    for (const iso of ['2027-05-27', '2027-12-25', '2027-01-10', '2027-08-15']) {
      expect(dayOf(iso).psalterWeek).toBe(liturgicalToday(on(iso)).week);
    }
  });
});

describe('the adapter reports the day faithfully', () => {
  it('passes season, date and psalter week straight through', () => {
    const today = liturgicalToday(on('2027-08-15'));
    const day = missingPartsDay(today);
    expect(day.date).toBe(today.iso);
    expect(day.season).toBe(today.season);
    expect(day.psalterWeek).toBe(today.week);
  });

  it('gives every exposed celebration an id and a name', () => {
    for (const celebration of celebrationsFor(liturgicalToday(on('2027-12-25')))) {
      expect(celebration.id).toBeTruthy();
      expect(celebration.name).toBeTruthy();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { liturgicalToday, isFestal, keepsFirstVespers } from '../../utils/generalCalendar';
import { officeForDay } from '../../utils/officeForDay';
import { digest, serialiseCalendar } from './calendarDigest';

/* Test 1: the production calendar must be exactly what it was before Phase 2
   added canonical ids to the celebration definitions.

   The expected digest was taken from the calendar BEFORE the ids were added.
   It covers five years of season, week, psalter week, Sunday and weekday
   cycle, colour, title, primary celebration and its rank and precedence, the
   full celebration list, optional memorials, the antiphon label, festal and
   First Vespers flags, the day's summary and every office route. If any of
   that moves, this fails.

   The spot checks below exist so that a failure is diagnosable: the digest
   says something changed, and they say what. */

const BASELINE_DIGEST = '781769:0cdf5364';
const FROM = 2026;
const TO = 2030;

const on = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

describe('test 1: existing production calendar results are unchanged', () => {
  it('reproduces the digest taken before canonical ids were added', () => {
    expect(digest(serialiseCalendar(FROM, TO))).toBe(BASELINE_DIGEST);
  });

  it('covers five whole years', () => {
    expect(serialiseCalendar(FROM, TO).split('\n')).toHaveLength(1826);
  });
});

describe('spot checks, so a digest failure can be read', () => {
  it.each([
    ['2027-03-28', 'Easter Sunday of the Resurrection of the Lord', 'easter', 'white'],
    ['2027-02-10', 'Ash Wednesday', 'lent', 'violet'],
    ['2027-05-27', 'The Most Holy Body and Blood of Christ', 'ordinary', 'white'],
    ['2027-12-25', 'The Nativity of the Lord', 'christmas', 'white'],
    ['2027-11-01', 'All Saints', 'ordinary', 'white'],
    ['2027-08-08', 'St Dominic, Priest', 'ordinary', 'white'],
    ['2027-03-25', 'Holy Thursday', 'triduum', 'white'],
  ])('%s is still %s', (iso, name, season, colour) => {
    const today = liturgicalToday(on(iso));
    expect(today.primary.name).toBe(name);
    expect(today.season).toBe(season);
    expect(today.colour).toBe(colour);
  });

  it('still routes the offices the way it did', () => {
    const today = liturgicalToday(on('2027-06-15'));
    const plan = officeForDay(today, { firstVespers: keepsFirstVespers(on('2027-06-15')) });
    expect(plan.hours.find((h) => h.hour === 'morning')?.route).toBe('#/office/w4-tue-morning');
    expect(isFestal(today)).toBe(false);
  });

  it('still keeps the psalter week and the week of the season it did', () => {
    const today = liturgicalToday(on('2027-06-15'));
    expect(today.week).toBe(4);
    expect(today.seasonWeek).toBe(11);
    expect(today.sundayCycle).toBe('B');
    expect(today.weekdayCycle).toBe('I');
  });

  it('still leaves Christmastide and the Triduum without a week of the season', () => {
    expect(liturgicalToday(on('2027-01-02')).seasonWeek).toBeNull();
    expect(liturgicalToday(on('2027-03-25')).seasonWeek).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveOffice, entryMatchesDay } from './resolve';
import { EMPTY_CONTENT, type Entry } from './types';
import type { MissingPartsDay } from './day';

/* These tests exercise the resolver against explicit days rather than a
   calendar. That is the point of the adapter contract: the precedence rules
   are pure logic and are proved here, while the binding of a real date to a
   season, psalter week and celebration list is the adapter's own business and
   is proved in Phase 2. */

function day(partial: Partial<MissingPartsDay> = {}): MissingPartsDay {
  return {
    date: '2026-01-12',
    season: 'ordinary',
    weekday: 1,
    psalterWeek: 1,
    weekOfSeason: 1,
    allowsWeekKey: true,
    celebrations: [],
    ...partial,
  };
}

function entry(partial: Partial<Entry> & Pick<Entry, 'keyType' | 'hour'>): Entry {
  return {
    ...EMPTY_CONTENT,
    id: Math.random().toString(36).slice(2),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('self-check 1: a psalter entry matches its season, psalter week, weekday and hour', () => {
  const psalterReading = entry({
    keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
    reference: 'Romans 13:11',
    readingText: 'It is now the hour for us to rise from sleep.',
    translation: 'Douay-Rheims',
  });

  it('appears on any day carrying that season, psalter week and weekday', () => {
    const office = resolveOffice([psalterReading], day(), 'morning');
    expect(office.sections.reading.present).toBe(true);
    expect(office.sections.reading.keyType).toBe('psalter');
  });

  it('appears again in a later week of the season with the same psalter week', () => {
    const later = day({ date: '2026-02-09', weekOfSeason: 5, psalterWeek: 1, weekday: 1 });
    const office = resolveOffice([psalterReading], later, 'morning');
    expect(office.sections.reading.entry?.id).toBe(psalterReading.id);
  });

  it('does not appear on a different weekday, psalter week, season or hour', () => {
    expect(resolveOffice([psalterReading], day({ weekday: 2 }), 'morning').sections.reading.present).toBe(false);
    expect(resolveOffice([psalterReading], day({ psalterWeek: 2 }), 'morning').sections.reading.present).toBe(false);
    expect(resolveOffice([psalterReading], day({ season: 'lent' }), 'morning').sections.reading.present).toBe(false);
    expect(resolveOffice([psalterReading], day(), 'evening').sections.reading.present).toBe(false);
  });
});

describe('self-check 2: a week entry stays in its own week', () => {
  const weekPrayer = entry({
    keyType: 'week', hour: 'morning', season: 'ordinary', weekOfSeason: 8,
    concludingPrayer: 'Prayer for the eighth week.',
  });

  it('appears in the eighth week of the season', () => {
    const office = resolveOffice([weekPrayer], day({ weekOfSeason: 8 }), 'morning');
    expect(office.sections.concludingPrayer.present).toBe(true);
  });

  it('does not appear in the twelfth week', () => {
    const office = resolveOffice([weekPrayer], day({ weekOfSeason: 12 }), 'morning');
    expect(office.sections.concludingPrayer.present).toBe(false);
  });

  it('does not appear in the same week of a different season', () => {
    const office = resolveOffice([weekPrayer], day({ season: 'lent', weekOfSeason: 8 }), 'morning');
    expect(office.sections.concludingPrayer.present).toBe(false);
  });
});

describe('D5: a week key cannot apply where the calendar has no week', () => {
  const weekPrayer = entry({
    keyType: 'week', hour: 'morning', season: 'triduum', weekOfSeason: 6,
    concludingPrayer: 'A prayer.',
  });

  it('does not resolve when the day has no week of the season', () => {
    const office = resolveOffice([weekPrayer], day({ season: 'triduum', weekOfSeason: null }), 'morning');
    expect(office.sections.concludingPrayer.present).toBe(false);
  });

  it('does not resolve when the day forbids week keys, even if a week is known', () => {
    const office = resolveOffice(
      [weekPrayer],
      day({ season: 'triduum', weekOfSeason: 6, allowsWeekKey: false }),
      'morning',
    );
    expect(office.sections.concludingPrayer.present).toBe(false);
  });
});

describe('self-check 3: an exact date overrides the psalter for that day only', () => {
  const psalterReading = entry({
    keyType: 'psalter', hour: 'morning', season: 'advent', psalterWeek: 4, weekday: 0,
    reference: 'Psalter reference', readingText: 'Psalter reading.',
  });
  const dateReading = entry({
    keyType: 'date', hour: 'morning', date: '2026-12-20',
    reference: 'Exact-date reference', readingText: 'Exact-date reading.',
  });
  const entries = [psalterReading, dateReading];
  const adventSunday = day({ date: '2026-12-20', season: 'advent', psalterWeek: 4, weekday: 0, weekOfSeason: 4 });

  it('shows the exact-date material on that date', () => {
    const office = resolveOffice(entries, adventSunday, 'morning');
    expect(office.sections.reading.keyType).toBe('date');
    expect(office.sections.reading.entry?.readingText).toBe('Exact-date reading.');
  });

  it('reports what it is overriding', () => {
    const office = resolveOffice(entries, adventSunday, 'morning');
    expect(office.sections.reading.overridden).toHaveLength(1);
    expect(office.sections.reading.overridden[0].id).toBe(psalterReading.id);
  });

  it('leaves the psalter entry working on another matching day', () => {
    const otherSunday = day({ date: '2025-12-21', season: 'advent', psalterWeek: 4, weekday: 0, weekOfSeason: 4 });
    const office = resolveOffice(entries, otherSunday, 'morning');
    expect(office.sections.reading.keyType).toBe('psalter');
    expect(office.sections.reading.entry?.readingText).toBe('Psalter reading.');
  });
});

describe('self-check 4: the four sections resolve independently', () => {
  const today = day();
  const entries = [
    entry({
      keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Rom 13:11', readingText: 'Psalter reading.', responsory: 'Psalter responsory.',
      intercessions: 'Psalter intercessions.', concludingPrayer: 'Psalter prayer.',
    }),
    entry({ keyType: 'date', hour: 'morning', date: '2026-01-12', intercessions: 'Date intercessions.' }),
    entry({
      keyType: 'week', hour: 'morning', season: 'ordinary', weekOfSeason: 1,
      concludingPrayer: 'Week prayer.',
    }),
  ];
  const office = resolveOffice(entries, today, 'morning');

  it('takes each section from the most specific record that supplies it', () => {
    expect(office.sections.reading.keyType).toBe('psalter');
    expect(office.sections.responsory.keyType).toBe('psalter');
    expect(office.sections.intercessions.keyType).toBe('date');
    expect(office.sections.concludingPrayer.keyType).toBe('week');
  });

  it('does not let a high-priority record hide sections it does not contain', () => {
    expect(office.sections.reading.entry?.readingText).toBe('Psalter reading.');
    expect(office.sections.responsory.entry?.responsory).toBe('Psalter responsory.');
  });

  it('reports overrides per section', () => {
    expect(office.sections.intercessions.overridden).toHaveLength(1);
    expect(office.sections.reading.overridden).toHaveLength(0);
  });

  it('reports missing sections rather than inventing them', () => {
    const empty = resolveOffice([], today, 'night');
    for (const section of Object.values(empty.sections)) {
      expect(section.present).toBe(false);
      expect(section.entry).toBeUndefined();
    }
  });
});

describe('precedence: every combination of supplying key levels', () => {
  const LEVELS = ['psalter', 'week', 'celebration', 'date'] as const;
  const RANK = { date: 4, celebration: 3, week: 2, psalter: 1 };
  const today = day({ celebrations: [{ id: 'peter-and-paul', name: 'Ss Peter and Paul, Apostles' }] });

  function recordFor(level: (typeof LEVELS)[number], responsory: string): Entry {
    switch (level) {
      case 'date':
        return entry({ keyType: 'date', hour: 'morning', date: today.date, responsory });
      case 'celebration':
        return entry({ keyType: 'celebration', hour: 'morning', celebrationId: 'peter-and-paul', responsory });
      case 'week':
        return entry({ keyType: 'week', hour: 'morning', season: 'ordinary', weekOfSeason: 1, responsory });
      case 'psalter':
      default:
        return entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1, responsory });
    }
  }

  // Every non-empty subset of the four levels: 15 combinations.
  const subsets: (typeof LEVELS)[number][][] = [];
  for (let mask = 1; mask < 16; mask += 1) {
    subsets.push(LEVELS.filter((_, index) => (mask >> index) & 1));
  }

  it.each(subsets.map((s) => [s.join('+'), s]))(
    'when %s supply the responsory, the most specific wins',
    (_label, levels) => {
      const present = levels as (typeof LEVELS)[number][];
      const entries = present.map((level) => recordFor(level, `${level} responsory`));
      const office = resolveOffice(entries, today, 'morning');
      const expected = [...present].sort((a, b) => RANK[b] - RANK[a])[0];
      expect(office.sections.responsory.keyType).toBe(expected);
      expect(office.sections.responsory.entry?.responsory).toBe(`${expected} responsory`);
      // Everything it beat is reported, and nothing is lost.
      expect(office.sections.responsory.overridden).toHaveLength(present.length - 1);
    },
  );

  it('covers all fifteen combinations', () => {
    expect(subsets).toHaveLength(15);
  });
});

describe('D4: celebration material matches the whole celebration list', () => {
  const baptism = entry({
    keyType: 'celebration', hour: 'morning', celebrationId: 'baptism-of-the-lord',
    celebrationName: 'The Baptism of the Lord', intercessions: 'Baptism intercessions.',
  });

  it('resolves even when the day is named after something else', () => {
    /* The production calendar leads this day with the Sunday, and carries the
       Baptism second. Matching only the primary celebration would lose this. */
    const sunday = day({
      date: '2027-01-10', weekday: 0, season: 'ordinary', weekOfSeason: 1,
      celebrations: [
        { id: 'ordinary-sunday', name: '1st Sunday in Ordinary Time' },
        { id: 'baptism-of-the-lord', name: 'The Baptism of the Lord' },
      ],
    });
    const office = resolveOffice([baptism], sunday, 'morning');
    expect(office.sections.intercessions.present).toBe(true);
    expect(office.sections.intercessions.keyType).toBe('celebration');
  });

  it('does not resolve on a day that does not keep it', () => {
    expect(resolveOffice([baptism], day(), 'morning').sections.intercessions.present).toBe(false);
  });

  it('matches by canonical id, never by display name', () => {
    const renamed = day({
      celebrations: [{ id: 'baptism-of-the-lord', name: 'A completely different wording' }],
    });
    expect(entryMatchesDay(baptism, renamed, 'morning')).toBe(true);

    const sameNameDifferentId = day({
      celebrations: [{ id: 'something-else', name: 'The Baptism of the Lord' }],
    });
    expect(entryMatchesDay(baptism, sameNameDifferentId, 'morning')).toBe(false);
  });

  it('matches once when two source rows share one canonical id', () => {
    /* St Raymond of Penyafort appears twice in the calendar tables. The
       adapter deduplicates by id, so the reader sees one identity (D2a). */
    const raymond = entry({
      keyType: 'celebration', hour: 'morning', celebrationId: 'raymond-of-penyafort',
      responsory: 'A responsory.',
    });
    const deduplicated = day({
      celebrations: [{ id: 'raymond-of-penyafort', name: 'St Raymond of Penyafort, Priest' }],
    });
    const office = resolveOffice([raymond], deduplicated, 'morning');
    expect(office.sections.responsory.present).toBe(true);
    expect(office.sections.responsory.duplicates).toHaveLength(0);
  });
});

describe('celebration keys on a fixed annual date', () => {
  const memorial = entry({
    keyType: 'celebration', hour: 'morning',
    celebrationName: 'Saint Thérèse of the Child Jesus', celebrationRank: 'memorial',
    calendarScope: 'general', celebrationMonth: 10, celebrationDay: 1,
    responsory: 'Annual memorial responsory.',
  });

  it('repeats every year on its annual date', () => {
    expect(entryMatchesDay(memorial, day({ date: '2026-10-01' }), 'morning')).toBe(true);
    expect(entryMatchesDay(memorial, day({ date: '2027-10-01' }), 'morning')).toBe(true);
    expect(entryMatchesDay(memorial, day({ date: '2027-10-02' }), 'morning')).toBe(false);
  });
});

describe('D6: First Vespers never inherits Evening Prayer', () => {
  const evening = entry({
    keyType: 'psalter', hour: 'evening', season: 'ordinary', psalterWeek: 1, weekday: 1,
    responsory: 'Evening responsory.',
  });

  it('does not show evening material at the evening before', () => {
    expect(resolveOffice([evening], day(), 'evening-before').sections.responsory.present).toBe(false);
  });

  it('shows material keyed to the evening before only at that hour', () => {
    const first = entry({
      keyType: 'psalter', hour: 'evening-before', season: 'ordinary', psalterWeek: 1, weekday: 1,
      responsory: 'First Vespers responsory.',
    });
    expect(resolveOffice([first], day(), 'evening-before').sections.responsory.entry?.responsory)
      .toBe('First Vespers responsory.');
    expect(resolveOffice([first], day(), 'evening').sections.responsory.present).toBe(false);
  });
});

describe('duplicates sharing one key', () => {
  it('shows the most recently edited and reports the rest', () => {
    const older = entry({
      keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      responsory: 'Older.', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = entry({
      keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      responsory: 'Newer.', updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const office = resolveOffice([older, newer], day(), 'morning');
    expect(office.sections.responsory.entry?.responsory).toBe('Newer.');
    expect(office.sections.responsory.duplicates).toHaveLength(1);
    expect(office.sections.responsory.overridden).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, filterRows, libraryRows, progressTotals, psalterSlots,
  REVIEW_REASON_LABELS, reviewItems, searchableText, sectionWording, type ReviewContext,
} from './selectors';
import { buildCoverageWindow } from '../adapter/coverage';
import { EMPTY_CONTENT, SECTIONS, type Entry } from '../data/types';

const NOW = new Date(2027, 5, 15);
const WINDOW = buildCoverageWindow(NOW, 400);

function entry(partial: Partial<Entry> & Pick<Entry, 'keyType' | 'hour'>): Entry {
  return {
    ...EMPTY_CONTENT,
    id: Math.random().toString(36).slice(2),
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    ...partial,
  };
}

const psalter = (week: 1 | 2 | 3 | 4, weekday: number, content: Partial<Entry> = {}) =>
  entry({
    keyType: 'psalter', hour: 'morning', season: 'ordinary',
    psalterWeek: week, weekday, ...content,
  });

const context: ReviewContext = {
  knownCelebrationIds: new Set(['saint-andrew', 'christmas']),
  window: WINDOW,
};

describe('10 and 11: the psalter grid is 28 slots of direct coverage', () => {
  it('always has exactly 28 slots', () => {
    for (const hour of ['morning', 'midday', 'evening', 'night', 'evening-before'] as const) {
      expect(psalterSlots([], 'ordinary', hour)).toHaveLength(28);
    }
  });

  it('is filled only by psalter records for that season and hour', () => {
    const slots = psalterSlots([psalter(2, 3, { responsory: 'x' })], 'ordinary', 'morning');
    const filled = slots.filter((s) => s.present.length > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0].psalterWeek).toBe(2);
    expect(filled[0].weekday).toBe(3);
    expect(filled[0].state).toBe('partial');
  });

  it('ignores a psalter record from another season or hour', () => {
    const other = entry({
      keyType: 'psalter', hour: 'evening', season: 'lent',
      psalterWeek: 2, weekday: 3, responsory: 'x',
    });
    const slots = psalterSlots([other], 'ordinary', 'morning');
    expect(slots.every((s) => s.present.length === 0)).toBe(true);
  });

  it('marks a slot complete only when all four sections are stored', () => {
    const full = psalter(1, 1, {
      reference: 'r', readingText: 'reading', translation: 't',
      responsory: 'resp', intercessions: 'int', concludingPrayer: 'prayer',
    });
    const slots = psalterSlots([full], 'ordinary', 'morning');
    const slot = slots.find((s) => s.psalterWeek === 1 && s.weekday === 1)!;
    expect(slot.state).toBe('complete');
    expect(slot.present).toEqual(SECTIONS);
    expect(slot.missing).toEqual([]);
  });
});

describe('12: a date, week or celebration override never completes a psalter slot', () => {
  const overrides = [
    entry({ keyType: 'date', hour: 'morning', date: '2027-06-15',
      readingText: 'r', responsory: 'x', intercessions: 'y', concludingPrayer: 'z' }),
    entry({ keyType: 'week', hour: 'morning', season: 'ordinary', weekOfSeason: 11,
      readingText: 'r', responsory: 'x', intercessions: 'y', concludingPrayer: 'z' }),
    entry({ keyType: 'celebration', hour: 'morning', celebrationId: 'christmas',
      readingText: 'r', responsory: 'x', intercessions: 'y', concludingPrayer: 'z' }),
  ];

  it('leaves every slot empty', () => {
    const slots = psalterSlots(overrides, 'ordinary', 'morning');
    expect(slots.every((s) => s.state === 'empty')).toBe(true);
    expect(progressTotals(slots).complete).toBe(0);
  });

  it('does not top up a partial psalter slot', () => {
    const slots = psalterSlots(
      [...overrides, psalter(1, 1, { responsory: 'only this' })], 'ordinary', 'morning',
    );
    const slot = slots.find((s) => s.psalterWeek === 1 && s.weekday === 1)!;
    expect(slot.state).toBe('partial');
    expect(slot.present).toEqual(['responsory']);
  });
});

describe('13 and 15: totals match the cells, and partial slots name what is missing', () => {
  const entries = [
    psalter(1, 1, { reference: 'r', readingText: 'a', translation: 't', responsory: 'b',
      intercessions: 'c', concludingPrayer: 'd' }),
    psalter(2, 2, { responsory: 'b' }),
    psalter(3, 3, { readingText: 'a', concludingPrayer: 'd' }),
  ];
  const slots = psalterSlots(entries, 'ordinary', 'morning');
  const totals = progressTotals(slots);

  it('counts complete, partial and empty exactly as the cells read', () => {
    expect(totals.slots).toBe(28);
    expect(totals.complete).toBe(slots.filter((s) => s.state === 'complete').length);
    expect(totals.partial).toBe(slots.filter((s) => s.state === 'partial').length);
    expect(totals.empty).toBe(slots.filter((s) => s.state === 'empty').length);
    expect(totals.complete + totals.partial + totals.empty).toBe(28);
    expect(totals.complete).toBe(1);
    expect(totals.partial).toBe(2);
  });

  it('counts sections the same way the cells do', () => {
    expect(totals.sectionsStored).toBe(slots.reduce((n, s) => n + s.present.length, 0));
    expect(totals.sectionsStored).toBe(4 + 1 + 2);
    expect(totals.sectionsPossible).toBe(28 * 4);
    expect(totals.bySection.responsory).toBe(2);
    expect(totals.bySection.reading).toBe(2);
    expect(totals.bySection.intercessions).toBe(1);
  });

  it('names the exact sections a partial slot lacks', () => {
    const slot = slots.find((s) => s.psalterWeek === 3 && s.weekday === 3)!;
    expect(slot.present).toEqual(['reading', 'concludingPrayer']);
    expect(slot.missing).toEqual(['responsory', 'intercessions']);
  });

  it('changes nothing in storage', () => {
    const before = JSON.stringify(entries);
    psalterSlots(entries, 'ordinary', 'morning');
    progressTotals(slots);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe('3, 4 and 6: the Library lists and filters', () => {
  const entries = [
    psalter(1, 1, { responsory: 'A responsory about lamps.' }),
    entry({ keyType: 'date', hour: 'evening', date: '2027-12-20',
      intercessions: 'Intercessions about lamps.' }),
    entry({ keyType: 'week', hour: 'night', season: 'advent', weekOfSeason: 3,
      concludingPrayer: 'A prayer.', needsReview: true, reviewNote: 'Check me.' }),
  ];

  it('lists every stored entry exactly once', () => {
    const rows = libraryRows(entries);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.entry.id)).size).toBe(3);
  });

  it('finds personal wording', () => {
    const rows = libraryRows(entries);
    const found = filterRows(rows, { ...EMPTY_FILTERS, query: 'lamps' });
    expect(found).toHaveLength(2);
  });

  it('searches the key labels too', () => {
    expect(searchableText(entries[0])).toContain('Psalter I');
    const rows = libraryRows(entries);
    expect(filterRows(rows, { ...EMPTY_FILTERS, query: 'psalter i' })).toHaveLength(1);
  });

  it('narrows by section, hour, key type and review together', () => {
    const rows = libraryRows(entries);
    expect(filterRows(rows, { ...EMPTY_FILTERS, section: 'intercessions' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTERS, hour: 'night' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTERS, keyType: 'date' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTERS, review: 'needs-review' })).toHaveLength(1);
    expect(filterRows(rows, { ...EMPTY_FILTERS, review: 'settled' })).toHaveLength(2);

    // Combined: every filter narrows, none widens.
    expect(filterRows(rows, {
      ...EMPTY_FILTERS, hour: 'night', keyType: 'week', review: 'needs-review',
    })).toHaveLength(1);
    expect(filterRows(rows, {
      ...EMPTY_FILTERS, hour: 'night', keyType: 'date',
    })).toHaveLength(0);
  });

  it('counts duplicates without merging them', () => {
    const twin = psalter(1, 1, { responsory: 'A different wording.' });
    const rows = libraryRows([entries[0], twin]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.duplicateCount === 1)).toBe(true);
  });
});

describe('16, 17 and 18: Review finds every kind of trouble', () => {
  it('reports a flagged record', () => {
    const flagged = psalter(1, 1, { responsory: 'x', needsReview: true, reviewNote: 'Look at me.' });
    const items = reviewItems([flagged], context);
    expect(items).toHaveLength(1);
    expect(items[0].reasons.map((r) => r.kind)).toContain('flagged');
    expect(items[0].reasons[0].message).toBe('Look at me.');
  });

  it('reports a content-free record that was kept', () => {
    const empty = psalter(1, 1, { note: 'just a note' });
    expect(reviewItems([empty], context)[0].reasons.map((r) => r.kind)).toContain('content-free');
  });

  it('reports an unknown celebration and refuses to guess', () => {
    const unknown = entry({
      keyType: 'celebration', hour: 'morning',
      celebrationId: 'saint-nobody', celebrationName: 'Saint Nobody', responsory: 'x',
    });
    const item = reviewItems([unknown], context)[0];
    expect(item.reasons.map((r) => r.kind)).toContain('unknown-celebration');
    expect(item.blocked).toBe(true);
    expect(item.entry.celebrationId).toBe('saint-nobody');
  });

  it('reports a key that matches no day at all', () => {
    const past = entry({ keyType: 'date', hour: 'morning', date: '2020-01-01', responsory: 'x' });
    expect(reviewItems([past], context)[0].reasons.map((r) => r.kind))
      .toContain('unresolvable-key');
  });

  it('reports fields this version does not understand', () => {
    const future = psalter(1, 1, { responsory: 'x', extra: { somethingNew: [1, 2] } });
    const item = reviewItems([future], context)[0];
    expect(item.reasons.map((r) => r.kind)).toContain('unknown-fields');
    expect(item.blocked).toBe(true);
    expect(item.entry.extra?.somethingNew).toEqual([1, 2]);
  });

  it('keeps duplicates separate and lists both', () => {
    const a = psalter(1, 1, { id: 'a', responsory: 'First wording.' });
    const b = psalter(1, 1, { id: 'b', responsory: 'Second wording.' });
    const items = reviewItems([a, b], context);
    expect(items).toHaveLength(2);
    expect(items[0].duplicates.map((d) => d.id)).toEqual(['b']);
    expect(items[1].duplicates.map((d) => d.id)).toEqual(['a']);
  });

  it('shows conflicting wording as a conflict, with both versions available', () => {
    const a = psalter(1, 1, { id: 'a', responsory: 'First wording.' });
    const b = psalter(1, 1, { id: 'b', responsory: 'Second wording.' });
    const item = reviewItems([a, b], context)[0];
    expect(item.reasons.map((r) => r.kind)).toContain('conflicting-wording');
    expect(item.conflicts).toHaveLength(1);
    expect(item.conflicts[0].comparison).toBe('wording');
    expect(sectionWording(item.entry, 'responsory')).toBe('First wording.');
    expect(sectionWording(item.conflicts[0].other, 'responsory')).toBe('Second wording.');
  });

  it('tells a whitespace-only difference from a real one', () => {
    const a = psalter(1, 1, { id: 'a', responsory: 'Same words.' });
    const b = psalter(1, 1, { id: 'b', responsory: 'Same words.   ' });
    expect(reviewItems([a, b], context)[0].conflicts[0].comparison).toBe('whitespace-only');
  });

  it('says nothing about a record with nothing wrong', () => {
    const fine = psalter(1, 1, { responsory: 'x' });
    expect(reviewItems([fine], context)).toHaveLength(0);
  });

  it('changes nothing it looks at', () => {
    const entries = [
      psalter(1, 1, { id: 'a', responsory: 'First.' }),
      psalter(1, 1, { id: 'b', responsory: 'Second.' }),
    ];
    const before = JSON.stringify(entries);
    reviewItems(entries, context);
    expect(JSON.stringify(entries)).toBe(before);
  });
});

describe('the review reasons read as English', () => {
  /* The screen prints "<label>. <message>", so a message that repeats its own
     label says the same thing twice, and a count of one still has to agree
     with its verb. Both were visible on the page before they were fixed. */

  it('agrees the verb with the number of duplicates', () => {
    const two = [
      psalter(1, 1, { id: 'a', responsory: 'One.' }),
      psalter(1, 1, { id: 'b', responsory: 'Two.' }),
    ];
    const singular = reviewItems(two, context)[0].reasons
      .find((r) => r.kind === 'duplicate-key')!.message;
    expect(singular).toContain('1 other record shares this exact key');

    const three = [...two, psalter(1, 1, { id: 'c', responsory: 'Three.' })];
    const plural = reviewItems(three, context)[0].reasons
      .find((r) => r.kind === 'duplicate-key')!.message;
    expect(plural).toContain('2 other records share this exact key');
  });

  it('never gives a reason whose message is only its own label', () => {
    const cases: Entry[] = [
      // Flagged with no note recorded.
      psalter(1, 1, { responsory: 'x', needsReview: true }),
      // A celebration key the calendar never reaches.
      entry({
        keyType: 'celebration', hour: 'morning', responsory: 'x',
        celebrationId: 'saint-andrew', celebrationName: 'Saint Andrew',
      }),
      // An empty record, and one under an unknown celebration.
      entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 3 }),
      entry({
        keyType: 'celebration', hour: 'morning', responsory: 'x',
        celebrationId: 'saint-nobody', celebrationName: 'Saint Nobody',
      }),
    ];
    const reasons = reviewItems(cases, { ...context, window: [] }).flatMap((i) => i.reasons);
    expect(reasons.length).toBeGreaterThan(3);
    for (const reason of reasons) {
      expect(reason.message, reason.kind).not.toBe(REVIEW_REASON_LABELS[reason.kind]);
      // Nor the label with a full stop bolted on.
      expect(reason.message, reason.kind).not.toBe(`${REVIEW_REASON_LABELS[reason.kind]}.`);
    }
  });
});

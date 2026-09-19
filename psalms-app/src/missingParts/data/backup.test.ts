import { describe, expect, it } from 'vitest';
import { analyseImport, applyImport, buildBackup, sectionText } from './backup';
import { emptyStore } from './storage';
import { EMPTY_CONTENT, keyId, type Entry } from './types';

function entry(partial: Partial<Entry> & Pick<Entry, 'keyType' | 'hour'>): Entry {
  return {
    ...EMPTY_CONTENT,
    id: partial.id ?? Math.random().toString(36).slice(2),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const READING = entry({
  id: 'a', keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
  reference: 'Rom 13:11',
  readingText: 'It is now the hour for us to rise from sleep.',
  translation: 'Douay-Rheims',
});

const PRAYER = entry({
  id: 'b', keyType: 'week', hour: 'evening', season: 'ordinary', weekOfSeason: 8,
  concludingPrayer: 'Prayer for the eighth week.',
});

const CELEBRATION = entry({
  id: 'celebration-a', keyType: 'celebration', hour: 'morning',
  celebrationId: 'therese-of-the-child-jesus',
  celebrationName: 'Saint Thérèse of the Child Jesus',
  celebrationRank: 'memorial', calendarScope: 'general',
  celebrationMonth: 10, celebrationDay: 1,
  responsory: 'A memorial responsory.',
});

describe('self-check 6: export then import restores the same data', () => {
  it('round-trips every field', () => {
    const store = { ...emptyStore(), entries: [READING, PRAYER, CELEBRATION] };
    const json = JSON.stringify(buildBackup(store), null, 2);

    const preview = analyseImport(json, []);
    expect(preview.ok).toBe(true);
    expect(preview.entries).toHaveLength(3);
    expect(preview.newRecords).toBe(3);

    const { entries } = applyImport([], preview, { mode: 'replace', conflictWinner: 'imported' });
    expect(entries.map((item) => ({ ...item, updatedAt: '' }))).toEqual(
      [READING, PRAYER, CELEBRATION].map((item) => ({ ...item, updatedAt: '' })),
    );
  });

  it('records the schema version and export date', () => {
    const backup = buildBackup({ ...emptyStore(), entries: [READING] }, new Date('2026-09-18T10:00:00Z'));
    expect(backup.schemaVersion).toBe(3);
    expect(backup.exportedAt).toBe('2026-09-18T10:00:00.000Z');
    expect(backup.entryCount).toBe(1);
    expect(backup.app).toBe('psalms-canticles-missing-parts');
  });

  it('accepts a backup from the separate Missing Parts app without complaint', () => {
    const legacy = JSON.stringify({
      app: 'the-missing-parts', schemaVersion: 3, entries: [READING],
    });
    const preview = analyseImport(legacy, []);
    expect(preview.ok).toBe(true);
    expect(preview.warnings.filter((w) => w.includes('not an app this reader knows'))).toHaveLength(0);
  });

  it('warns about a backup from somewhere else entirely', () => {
    const foreign = JSON.stringify({ app: 'some-other-app', entries: [READING] });
    expect(analyseImport(foreign, []).warnings.join(' ')).toContain('some-other-app');
  });

  it('importing a backup over identical data changes nothing', () => {
    const json = JSON.stringify(buildBackup({ ...emptyStore(), entries: [READING, PRAYER] }));
    const preview = analyseImport(json, [READING, PRAYER]);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.unchangedRecords).toBe(2);
    const { summary } = applyImport([READING, PRAYER], preview, { mode: 'merge', conflictWinner: 'existing' });
    expect(summary.added).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.unchanged).toBe(2);
  });
});

describe('self-check 7: an invalid import does not modify existing data', () => {
  const current = [READING, PRAYER];

  it.each([
    ['not JSON at all', 'this is not json {'],
    ['JSON with no entries', '{"app":"the-missing-parts","schemaVersion":2}'],
    ['entries that are not records', '{"entries":[1,2,3]}'],
    ['entries with no content', '{"entries":[{"hour":"morning","keyType":"psalter"}]}'],
    ['an empty list', '{"entries":[]}'],
  ])('rejects %s', (_label, text) => {
    const preview = analyseImport(text, current);
    expect(preview.ok).toBe(false);
    expect(preview.errors.length).toBeGreaterThan(0);
    expect(preview.entries).toHaveLength(0);
  });

  it('leaves the current entries untouched when a preview fails', () => {
    const before = JSON.stringify(current);
    analyseImport('nonsense', current);
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe('self-check 8: merge preserves current entries and reports conflicts', () => {
  const incomingConflict = entry({
    id: 'c', keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
    reference: 'Rom 13:11',
    readingText: 'A different wording of the same reading.',
    translation: 'Other translation',
  });
  const incomingNew = entry({
    id: 'd', keyType: 'date', hour: 'night', date: '2026-12-20', responsory: 'Into thy hands.',
  });
  const json = JSON.stringify({ entries: [incomingConflict, incomingNew] });

  it('reports the conflicting records and the sections that differ', () => {
    const preview = analyseImport(json, [READING, PRAYER]);
    expect(preview.ok).toBe(true);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].sections).toEqual(['reading']);
    expect(preview.conflicts[0].kind).toBe('wording');
    expect(preview.conflicts[0].key).toBe(keyId(READING));
    expect(preview.newRecords).toBe(1);
  });

  it('keeps existing wording by default and adds the new record', () => {
    const preview = analyseImport(json, [READING, PRAYER]);
    const { entries, summary } = applyImport([READING, PRAYER], preview, {
      mode: 'merge', conflictWinner: 'existing',
    });
    expect(entries).toHaveLength(3);
    expect(entries.find((i) => i.id === 'a')?.readingText).toBe(READING.readingText);
    expect(entries.find((i) => i.id === 'b')?.concludingPrayer).toBe(PRAYER.concludingPrayer);
    expect(summary.added).toBe(1);
    expect(summary.conflicts).toBe(1);
  });

  it('takes the imported wording when the user asks for it', () => {
    const preview = analyseImport(json, [READING, PRAYER]);
    const { entries } = applyImport([READING, PRAYER], preview, {
      mode: 'merge', conflictWinner: 'imported',
    });
    expect(entries.find((i) => i.id === 'a')?.readingText).toBe('A different wording of the same reading.');
    expect(entries).toHaveLength(3);
  });

  it('fills in a section the current record does not have, without a conflict', () => {
    const addition = entry({
      keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      responsory: 'A responsory the current record lacks.',
    });
    const preview = analyseImport(JSON.stringify({ entries: [addition] }), [READING]);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.enrichedRecords).toBe(1);

    const { entries } = applyImport([READING], preview, { mode: 'merge', conflictWinner: 'existing' });
    expect(entries).toHaveLength(1);
    expect(entries[0].readingText).toBe(READING.readingText);
    expect(entries[0].responsory).toBe('A responsory the current record lacks.');
  });

  it('replace mode swaps the whole list and says what was removed', () => {
    const preview = analyseImport(json, [READING, PRAYER]);
    const { entries, summary } = applyImport([READING, PRAYER], preview, {
      mode: 'replace', conflictWinner: 'imported',
    });
    expect(entries).toHaveLength(2);
    expect(summary.removed).toBe(2);
    expect(entries.find((i) => i.id === 'b')).toBeUndefined();
  });
});

describe('§F: conflicts are detected on exact text, not trimmed text', () => {
  it('raises a conflict when two records differ only in trailing whitespace', () => {
    /* The implementation this was ported from trimmed before comparing, so
       this difference was invisible and one wording was silently kept. */
    const spaced = entry({
      id: 'x', keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Rom 13:11',
      readingText: 'It is now the hour for us to rise from sleep.   ',
      translation: 'Douay-Rheims',
    });
    const preview = analyseImport(JSON.stringify({ entries: [spaced] }), [READING]);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].kind).toBe('whitespace-only');
    expect(preview.conflicts[0].whitespaceOnlySections).toEqual(['reading']);
  });

  it('distinguishes a whitespace difference from a difference in wording', () => {
    const reworded = entry({
      id: 'y', keyType: 'week', hour: 'evening', season: 'ordinary', weekOfSeason: 8,
      concludingPrayer: 'Prayer for the eighth week of the year.',
    });
    const preview = analyseImport(JSON.stringify({ entries: [reworded] }), [PRAYER]);
    expect(preview.conflicts[0].kind).toBe('wording');
    expect(preview.conflicts[0].whitespaceOnlySections).toEqual([]);
  });

  it('compares section text without trimming it', () => {
    const padded = entry({ keyType: 'date', hour: 'morning', date: '2026-01-01', responsory: ' x ' });
    const bare = entry({ keyType: 'date', hour: 'morning', date: '2026-01-01', responsory: 'x' });
    expect(sectionText(padded, 'responsory')).toBe(' x ');
    expect(sectionText(padded, 'responsory')).not.toBe(sectionText(bare, 'responsory'));
  });
});

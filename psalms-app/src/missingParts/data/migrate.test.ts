import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, migrateStore, normaliseEntry } from './migrate';
import {
  LEGACY_STORAGE_KEY, STORAGE_KEY, loadStore, readLegacyRaw, saveStore,
} from './storage';
import { resolveOffice } from './resolve';
import { sectionsPresent } from './types';
import type { MissingPartsDay } from './day';

function day(partial: Partial<MissingPartsDay> = {}): MissingPartsDay {
  return {
    date: '2026-01-12', season: 'ordinary', weekday: 1, psalterWeek: 1,
    weekOfSeason: 1, allowsWeekKey: true, celebrations: [], ...partial,
  };
}

/** The shape the first version of the legacy app wrote: bare array, no keyType. */
const LEGACY_DATA = [
  {
    id: 'legacy-1',
    season: 'ordinary', psalterWeek: 1, weekday: 1, weekOfSeason: 1, hour: 'morning',
    reference: '1 Thessalonians 5:16-18',
    readingText: 'Always rejoice. Pray without ceasing. In all things give thanks.',
    translation: 'Douay-Rheims',
    responsory: 'V. Blessed be the Lord.\nR. Blessed be the Lord.',
    intercessions: 'For the Church.\nFor the world.',
    concludingPrayer: 'Almighty God, hear us.',
  },
  {
    id: 'legacy-2',
    season: 'Advent', psalterWeek: 'II', weekday: 'Wednesday', hour: 'Vespers',
    reference: 'Philippians 4:4-5',
    readingText: 'Rejoice in the Lord always.',
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe('self-check 5: existing local data survives an upgrade', () => {
  it('keeps every legacy entry and its exact wording', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    const loaded = loadStore();

    expect(loaded.file.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const reading = loaded.file.entries.find((entry) => entry.id === 'legacy-1');
    expect(reading?.readingText).toBe('Always rejoice. Pray without ceasing. In all things give thanks.');
    expect(reading?.keyType).toBe('psalter');
    expect(reading?.translation).toBe('Douay-Rheims');
  });

  it('understands legacy spellings of hour, season, psalter week and weekday', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    const second = loadStore().file.entries.find((entry) => entry.id === 'legacy-2');
    expect(second?.hour).toBe('evening');
    expect(second?.season).toBe('advent');
    expect(second?.psalterWeek).toBe(2);
    expect(second?.weekday).toBe(3);
  });

  it('understands the seasons the production calendar adds', () => {
    expect(normaliseEntry({ hour: 'morning', season: 'Holy Week', weekOfSeason: 6, keyType: 'week', concludingPrayer: 'x' }).entry?.season).toBe('holyweek');
    expect(normaliseEntry({ hour: 'morning', season: 'Triduum', keyType: 'date', date: '2027-03-25', concludingPrayer: 'x' }).entry?.season).toBe('triduum');
    expect(normaliseEntry({ hour: 'morning', season: 'Through the Year', psalterWeek: 1, weekday: 1, readingText: 'x' }).entry?.season).toBe('ordinary');
  });

  it('understands First Vespers as its own hour', () => {
    expect(normaliseEntry({ hour: 'First Vespers', keyType: 'date', date: '2026-12-24', responsory: 'x' }).entry?.hour).toBe('evening-before');
    expect(normaliseEntry({ hour: 'Compline', keyType: 'date', date: '2026-12-24', responsory: 'x' }).entry?.hour).toBe('night');
  });

  it('moves a legacy concluding prayer to a week record without losing the rest', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    const { file } = loadStore();

    const psalter = file.entries.find((entry) => entry.id === 'legacy-1')!;
    expect(sectionsPresent(psalter)).toEqual(['reading', 'responsory', 'intercessions']);

    const week = file.entries.find((entry) => entry.keyType === 'week');
    expect(week?.concludingPrayer).toBe('Almighty God, hear us.');
    expect(week?.season).toBe('ordinary');
    expect(week?.weekOfSeason).toBe(1);
    expect(week?.hour).toBe('morning');
  });

  it('still displays all four sections after migrating', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    const { file } = loadStore();
    const office = resolveOffice(file.entries, day(), 'morning');
    expect(office.sections.reading.present).toBe(true);
    expect(office.sections.responsory.present).toBe(true);
    expect(office.sections.intercessions.present).toBe(true);
    expect(office.sections.concludingPrayer.present).toBe(true);
    expect(office.sections.concludingPrayer.keyType).toBe('week');
  });

  it('is idempotent: migrating again changes nothing', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    const first = loadStore().file;
    saveStore(first);
    const second = loadStore().file;

    expect(second.entries).toHaveLength(first.entries.length);
    expect(second.entries.map((e) => e.concludingPrayer)).toEqual(first.entries.map((e) => e.concludingPrayer));
    saveStore(second);
    const third = loadStore().file;
    expect(third.entries).toHaveLength(first.entries.length);
    expect(third.entries.map((e) => e.readingText)).toEqual(first.entries.map((e) => e.readingText));
  });

  it('runs three times over with an identical result', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_DATA));
    let file = loadStore().file;
    const snapshots: string[] = [];
    for (let run = 0; run < 3; run += 1) {
      saveStore(file);
      file = loadStore().file;
      snapshots.push(JSON.stringify(file.entries.map((e) => ({ ...e, updatedAt: '', id: '' }))));
    }
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(snapshots[2]).toBe(snapshots[0]);
  });
});

describe('D8: the legacy key is read-only', () => {
  it('uses its own key, not the legacy app’s', () => {
    expect(STORAGE_KEY).toBe('dpc.missing-parts.v1');
    expect(LEGACY_STORAGE_KEY).toBe('the-missing-parts-entries-v1');
    expect(STORAGE_KEY).not.toBe(LEGACY_STORAGE_KEY);
  });

  it('reads the legacy key exactly, without parsing or altering it', () => {
    const raw = '  {"entries":[]}  \r\n';
    window.localStorage.setItem(LEGACY_STORAGE_KEY, raw);
    expect(readLegacyRaw()).toBe(raw);
  });

  it('never writes the legacy key, whatever the data core is asked to do', () => {
    const original = JSON.stringify(LEGACY_DATA);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, original);

    loadStore();
    saveStore({ schemaVersion: 3, entries: [], meta: { createdAt: 'x' } });
    window.localStorage.setItem(STORAGE_KEY, '{broken');
    loadStore();

    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(original);
  });
});

describe('reading damaged or unusual data', () => {
  it('keeps a copy of unreadable data instead of deleting it', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json at all');
    const loaded = loadStore();
    expect(loaded.quarantineKey).toBeTruthy();
    expect(window.localStorage.getItem(loaded.quarantineKey!)).toBe('{not json at all');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('{not json at all');
    expect(loaded.file.entries).toEqual([]);
  });

  it('accepts the object form as well as a bare array', () => {
    const { file } = migrateStore({ schemaVersion: 2, entries: LEGACY_DATA, meta: { createdAt: 'x' } });
    expect(file.entries.length).toBeGreaterThan(0);
  });

  it('preserves a newer schema version rather than downgrading the data', () => {
    const { file } = migrateStore({
      schemaVersion: 99,
      entries: [{ keyType: 'date', date: '2026-12-20', hour: 'morning', readingText: 'x', futureField: 'keep' }],
    });
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].extra?.futureField).toBe('keep');
  });

  it('flags an entry it cannot key confidently rather than dropping it', () => {
    const { entry } = normaliseEntry({ hour: 'morning', responsory: 'Something' });
    expect(entry?.needsReview).toBe(true);
    expect(entry?.reviewNote).toBeTruthy();
    expect(entry?.responsory).toBe('Something');
  });

  it('preserves fields it does not recognise', () => {
    const { entry } = normaliseEntry({
      keyType: 'date', date: '2026-12-20', hour: 'morning', readingText: 'x', somethingNew: 'keep me',
    });
    expect(entry?.extra?.somethingNew).toBe('keep me');
  });

  it('normalises celebration records without changing their wording', () => {
    const { entry, problems } = normaliseEntry({
      keyType: 'celebration', hour: 'Lauds',
      celebrationName: 'Saint Thérèse of the Child Jesus',
      celebrationRank: 'Memorial', calendarScope: 'General Roman Calendar',
      celebrationMonth: 10, celebrationDay: 1,
      responsory: 'The exact stored wording.',
    });

    expect(problems).toEqual([]);
    expect(entry?.keyType).toBe('celebration');
    expect(entry?.celebrationRank).toBe('memorial');
    expect(entry?.calendarScope).toBe('general');
    expect(entry?.responsory).toBe('The exact stored wording.');
  });

  it('keeps a malformed celebration and marks it for review', () => {
    const { entry } = normaliseEntry({
      keyType: 'celebration', hour: 'morning', celebrationRank: 'feast', responsory: 'Keep this.',
    });
    expect(entry?.responsory).toBe('Keep this.');
    expect(entry?.needsReview).toBe(true);
  });

  it('keeps a record with no visible content rather than discarding it', () => {
    /* The implementation this was ported from filtered these out. That
       contradicted "never silently discard", so they are kept and flagged. */
    const { file, report } = migrateStore({
      entries: [{ keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1, note: 'A note I wrote but never filled in.' }],
    });
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].note).toBe('A note I wrote but never filled in.');
    expect(file.entries[0].needsReview).toBe(true);
    expect(report.contentFreeKept).toBe(1);
  });

  it('keeps a whitespace-only field, flags it, and does not alter it', () => {
    const { entry } = normaliseEntry({
      keyType: 'date', date: '2026-12-20', hour: 'morning',
      readingText: 'Real text.', responsory: '   \n  ',
    });
    expect(entry?.responsory).toBe('   \n  ');
    expect(entry?.needsReview).toBe(true);
    expect(entry?.reviewNote).toContain('blank space');
  });

  it('reads a legacy array-of-lines field without altering the lines', () => {
    const { entry } = normaliseEntry({
      keyType: 'date', date: '2026-12-20', hour: 'morning',
      intercessions: ['  For the Church.', 'For the world.  '],
    });
    expect(entry?.intercessions).toBe('  For the Church.\nFor the world.  ');
  });
});

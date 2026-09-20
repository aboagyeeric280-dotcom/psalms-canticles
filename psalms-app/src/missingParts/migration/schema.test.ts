import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION, LEGACY_SCHEMA_VERSION, HOLY_WEEK_REVIEW_NOTE,
  convertLegacyHolyWeek, migrateStore, normaliseEntry,
} from '../data/migrate';
import { buildBackup } from '../data/backup';
import { analyseImport, applyImport } from '../data/backup';
import { buildCelebrationIndex, resolveCelebrationId } from '../adapter/celebrationIds';
import { EMPTY_CONTENT, type Entry } from '../data/types';

const index = buildCelebrationIndex();
const withAliases = { resolveCelebration: (v: string) => resolveCelebrationId(v, index) };

function legacyEntry(partial: Record<string, unknown>) {
  return { hour: 'morning', readingText: 'Some text.', ...partial };
}

describe('schema 3 converts to schema 4', () => {
  it('declares 4 as current and 3 as the legacy format', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(LEGACY_SCHEMA_VERSION).toBe(3);
  });

  it('raises a schema 3 file to schema 4', () => {
    const { file } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'psalter', season: 'ordinary', psalterWeek: 1, weekday: 1 })],
    }, withAliases);
    expect(file.schemaVersion).toBe(4);
    expect(file.entries).toHaveLength(1);
  });

  it('raises the legacy bare array too', () => {
    const { file } = migrateStore([legacyEntry({ season: 'ordinary', psalterWeek: 1, weekday: 1 })], withAliases);
    expect(file.schemaVersion).toBe(4);
  });

  it('converts a legacy celebration slug to a canonical id', () => {
    const { file, report } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({
        keyType: 'celebration',
        celebrationId: 'saints-peter-and-paul-apostles',
        celebrationName: 'Saints Peter and Paul, Apostles',
      })],
    }, withAliases);
    expect(file.entries[0].celebrationId).toBe('saint-peter-and-saint-paul');
    expect(report.celebrationsReKeyed).toBe(1);
  });

  it('leaves the display name exactly as the reader wrote it', () => {
    const { file } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({
        keyType: 'celebration',
        celebrationId: 'the-most-holy-body-and-blood-of-christ',
        celebrationName: 'The Most Holy Body and Blood of Christ',
      })],
    }, withAliases);
    expect(file.entries[0].celebrationId).toBe('corpus-christi');
    expect(file.entries[0].celebrationName).toBe('The Most Holy Body and Blood of Christ');
  });
});

describe('schema 4 round trips', () => {
  const entry: Entry = {
    ...EMPTY_CONTENT,
    id: 'x', keyType: 'celebration', hour: 'evening-before',
    celebrationId: 'christmas', celebrationName: 'The Nativity of the Lord',
    responsory: 'A responsory.\n  with spacing  ',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('exports as schema 4', () => {
    expect(buildBackup({ schemaVersion: 4, entries: [entry], meta: { createdAt: 'x' } }).schemaVersion).toBe(4);
  });

  it('survives export and import unchanged', () => {
    const json = JSON.stringify(buildBackup({ schemaVersion: 4, entries: [entry], meta: { createdAt: 'x' } }));
    const preview = analyseImport(json, []);
    const { entries } = applyImport([], preview, { mode: 'replace', conflictWinner: 'imported' });
    expect(entries[0].responsory).toBe('A responsory.\n  with spacing  ');
    expect(entries[0].celebrationId).toBe('christmas');
    expect(entries[0].hour).toBe('evening-before');
  });

  it('is stable over three migrations', () => {
    let file = migrateStore({ schemaVersion: 4, entries: [entry] }, withAliases).file;
    const first = JSON.stringify(file.entries);
    for (let run = 0; run < 3; run += 1) {
      file = migrateStore({ schemaVersion: 4, entries: file.entries }, withAliases).file;
    }
    expect(JSON.stringify(file.entries)).toBe(first);
  });
});

describe('a future schema is preserved, never downgraded', () => {
  it('keeps the declared version', () => {
    const { file } = migrateStore({
      schemaVersion: 9,
      entries: [legacyEntry({ keyType: 'date', date: '2027-01-01', futureField: 'keep me' })],
    }, withAliases);
    expect(file.schemaVersion).toBe(9);
  });

  it('keeps fields it does not understand', () => {
    const { file } = migrateStore({
      schemaVersion: 9,
      entries: [legacyEntry({ keyType: 'date', date: '2027-01-01', futureField: 'keep me' })],
    }, withAliases);
    expect(file.entries[0].extra?.futureField).toBe('keep me');
  });

  it('says so rather than pretending to have converted it', () => {
    const { report } = migrateStore({
      schemaVersion: 9,
      entries: [legacyEntry({ keyType: 'date', date: '2027-01-01' })],
    }, withAliases);
    expect(report.problems.join(' ')).toContain('newer version');
  });
});

describe('Holy Week conversion', () => {
  const holyWeekRecord = () => legacyEntry({
    keyType: 'week', season: 'lent', weekOfSeason: 6, readingText: '',
    responsory: 'V. Christ became obedient.\nR. Christ became obedient.',
  });

  it('re-keys Lent week 6 as Holy Week week 1', () => {
    const { file, report } = migrateStore({ schemaVersion: 3, entries: [holyWeekRecord()] }, withAliases);
    expect(file.entries[0].season).toBe('holyweek');
    expect(file.entries[0].weekOfSeason).toBe(1);
    expect(report.holyWeekConverted).toBe(1);
  });

  it('preserves the wording byte for byte', () => {
    const { file } = migrateStore({ schemaVersion: 3, entries: [holyWeekRecord()] }, withAliases);
    expect(file.entries[0].responsory).toBe('V. Christ became obedient.\nR. Christ became obedient.');
  });

  it('flags the record and explains what happened', () => {
    const { file } = migrateStore({ schemaVersion: 3, entries: [holyWeekRecord()] }, withAliases);
    expect(file.entries[0].needsReview).toBe(true);
    expect(file.entries[0].reviewNote).toContain('Lent, week 6');
    expect(file.entries[0].reviewNote).toContain('Holy Week');
  });

  it('adds the note once, however many times migration runs', () => {
    let file = migrateStore({ schemaVersion: 3, entries: [holyWeekRecord()] }, withAliases).file;
    const firstNote = file.entries[0].reviewNote;
    for (let run = 0; run < 4; run += 1) {
      file = migrateStore({ schemaVersion: 4, entries: file.entries }, withAliases).file;
    }
    expect(file.entries[0].reviewNote).toBe(firstNote);
    const occurrences = (firstNote!.match(/Lent, week 6/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('is a no-op on a record already keyed to Holy Week', () => {
    const already: Entry = {
      ...EMPTY_CONTENT, id: 'a', keyType: 'week', hour: 'morning',
      season: 'holyweek', weekOfSeason: 1, responsory: 'x',
      createdAt: 'c', updatedAt: 'u',
    };
    expect(convertLegacyHolyWeek(already)).toBe(false);
  });

  it('leaves other weeks of Lent alone', () => {
    const { file, report } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'week', season: 'lent', weekOfSeason: 3, concludingPrayer: 'x' })],
    }, withAliases);
    expect(file.entries[0].season).toBe('lent');
    expect(file.entries[0].weekOfSeason).toBe(3);
    expect(report.holyWeekConverted).toBe(0);
  });

  it('shares its note text with the exported constant', () => {
    const { file } = migrateStore({ schemaVersion: 3, entries: [holyWeekRecord()] }, withAliases);
    expect(file.entries[0].reviewNote).toContain(HOLY_WEEK_REVIEW_NOTE);
  });
});

describe('celebration aliases: Catherine and Dominic stay distinct', () => {
  it.each([
    ['St Catherine of Siena, Virgin and Doctor', 'saint-catherine-of-siena'],
    ['St Catherine of Siena, Virgin and Doctor, Patron of the Order', 'saint-catherine-of-siena-order-patron'],
    ['St Dominic, Priest', 'saint-dominic'],
    ['Our Holy Father Dominic, Priest and Founder of the Order', 'saint-dominic-order-founder'],
  ])('%s resolves to exactly one observance', (name, expected) => {
    const resolution = resolveCelebrationId(name, index);
    expect(resolution.kind === 'canonical' || resolution.kind === 'mapped').toBe(true);
    expect(resolution.kind === 'mapped' || resolution.kind === 'canonical' ? resolution.id : null).toBe(expected);
  });

  it('never maps one record onto two observances', () => {
    const { file } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({
        keyType: 'celebration',
        celebrationName: 'Our Holy Father Dominic, Priest and Founder of the Order',
      })],
    }, withAliases);
    expect(file.entries[0].celebrationId).toBe('saint-dominic-order-founder');
  });

  it('keeps the two Dominics apart', () => {
    const general = resolveCelebrationId('St Dominic, Priest', index);
    const order = resolveCelebrationId('Our Holy Father Dominic, Priest and Founder of the Order', index);
    const idOf = (r: typeof general) => (r.kind === 'mapped' || r.kind === 'canonical' ? r.id : null);
    expect(idOf(general)).not.toBe(idOf(order));
  });
});

describe('an ambiguous alias is kept and flagged, never guessed', () => {
  /* The production table has no ambiguous name today, which a test below
     asserts. The behaviour still has to exist and be proven, so it is driven
     through an injected resolver that reports ambiguity. */
  const ambiguous = {
    resolveCelebration: () => ({ kind: 'ambiguous' as const, candidates: ['saint-dominic', 'saint-dominic-order-founder'] }),
  };

  it('keeps the record and its stored id exactly as they were', () => {
    const { file } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'celebration', celebrationId: 'dominic', celebrationName: 'Dominic', responsory: 'Keep me.' })],
    }, ambiguous);
    expect(file.entries[0].celebrationId).toBe('dominic');
    expect(file.entries[0].responsory).toBe('Keep me.');
  });

  it('flags it and names the candidates', () => {
    const { file, report } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'celebration', celebrationId: 'dominic', celebrationName: 'Dominic' })],
    }, ambiguous);
    expect(file.entries[0].needsReview).toBe(true);
    expect(file.entries[0].reviewNote).toContain('more than one observance');
    expect(file.entries[0].reviewNote).toContain('saint-dominic-order-founder');
    expect(report.celebrationsAmbiguous).toBe(1);
  });

  it('adds that note only once across repeated runs', () => {
    let file = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'celebration', celebrationId: 'dominic', celebrationName: 'Dominic' })],
    }, ambiguous).file;
    const first = file.entries[0].reviewNote;
    for (let run = 0; run < 3; run += 1) {
      file = migrateStore({ schemaVersion: 4, entries: file.entries }, ambiguous).file;
    }
    expect(file.entries[0].reviewNote).toBe(first);
  });

  it('confirms the real table has no ambiguous name', () => {
    for (const [slug, ids] of index.byName) {
      expect(ids.size, `${slug} maps to ${[...ids].join(', ')}`).toBe(1);
    }
  });
});

describe('an unknown celebration is kept and flagged', () => {
  it('keeps the stored id rather than inventing one', () => {
    const { file, report } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'celebration', celebrationId: 'saint-kizito', celebrationName: 'Saint Kizito', responsory: 'Keep me.' })],
    }, withAliases);
    expect(file.entries[0].celebrationId).toBe('saint-kizito');
    expect(file.entries[0].responsory).toBe('Keep me.');
    expect(file.entries[0].needsReview).toBe(true);
    expect(report.celebrationsUnknown).toBe(1);
  });
});

describe('content is still preserved exactly through a schema 4 migration', () => {
  const awkward = '  \tLine one\r\nLine two\n\n  trailing   ';
  it('keeps every byte', () => {
    const { file } = migrateStore({
      schemaVersion: 3,
      entries: [legacyEntry({ keyType: 'week', season: 'lent', weekOfSeason: 6, responsory: awkward })],
    }, withAliases);
    // Re-keyed to Holy Week, and the wording untouched.
    expect(file.entries[0].season).toBe('holyweek');
    expect(file.entries[0].responsory).toBe(awkward);
  });

  it('keeps a content-free record and flags it', () => {
    const { file, report } = migrateStore({
      schemaVersion: 3,
      entries: [{ keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1, note: 'just a note' }],
    }, withAliases);
    expect(file.entries).toHaveLength(1);
    expect(file.entries[0].note).toBe('just a note');
    expect(report.contentFreeKept).toBe(1);
  });

  it('normalises without a resolver too, leaving ids untouched', () => {
    const { entry } = normaliseEntry(legacyEntry({ keyType: 'celebration', celebrationId: 'whatever' }));
    expect(entry?.celebrationId).toBe('whatever');
  });
});

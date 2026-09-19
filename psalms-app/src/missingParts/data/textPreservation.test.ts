import { beforeEach, describe, expect, it } from 'vitest';
import { migrateStore, normaliseEntry } from './migrate';
import { loadStore, saveStore } from './storage';
import { analyseImport, applyImport, buildBackup } from './backup';
import { CONTENT_FIELDS, EMPTY_CONTENT, type Entry, type EntryContent } from './types';
import { reloadFromStorage, saveSection } from '../state/store';

/* ── §F: exact-text preservation ──────────────────────────────────────────────
   The liturgical fields are stored exactly as received. These tests assert
   that byte-for-byte with `toBe`, never through a normalised comparison.

   One honest limit, covered at the end: a browser normalises CRLF to LF in a
   <textarea> before application code ever sees the value. Migration, import
   and export do not go through the DOM and preserve the string as stored.
   ────────────────────────────────────────────────────────────────────────── */

/** Every awkward thing real liturgical text does. */
const AWKWARD: EntryContent = {
  reference: '  Romans 13:11b, 12-13a  ',
  readingText:
    '\tLet us therefore cast off\r\nthe works of darkness,\n'
    + 'and put on the armour of light.\r\n'
    + '\n'
    + '  Let us walk honestly, as in the day.   ',
  translation: 'Douay–Rheims (1899) — “American edition” ',
  // Combining acute (e + U+0301) must NOT be folded to the precomposed form.
  responsory:
    'V.  In the morning I will stand before thée, and will sée.\n'
    + 'R.  In the morning I will stand before thée.\n'
    + '† Glory be to the Father ´and to the Son / and to the Holy Spirit.+\n',
  // Non-breaking space, thin space, straight and curly apostrophes together.
  intercessions:
    'For the Church: — Lord, hear us.\n'
    + "For those who have no rest and no shelter : it's ‘thus’ “and so”.\n",
  concludingPrayer: '   ',
};

function entryWith(content: EntryContent): Entry {
  return {
    ...EMPTY_CONTENT,
    ...content,
    id: 'awkward-1',
    keyType: 'date',
    hour: 'morning',
    date: '2026-12-20',
    note: '  a note with its own  spacing\r\n  ',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function expectExact(actual: Partial<EntryContent> | undefined, expected: EntryContent): void {
  expect(actual).toBeDefined();
  for (const field of CONTENT_FIELDS) {
    expect(actual![field]).toBe(expected[field]);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  reloadFromStorage();
});

describe('normalising a record never alters its wording', () => {
  it('keeps every content field byte for byte', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expectExact(entry ?? undefined, AWKWARD);
  });

  it('keeps the reader’s note byte for byte', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expect(entry?.note).toBe('  a note with its own  spacing\r\n  ');
  });

  it('does not convert combining marks to their precomposed form', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expect(entry?.responsory).toContain('thée');
    expect(entry?.responsory.normalize('NFC')).not.toBe(entry?.responsory);
  });

  it('does not convert CRLF to LF', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expect(entry?.readingText).toContain('\r\n');
    expect(entry?.readingText.split('\r\n')).toHaveLength(3);
  });

  it('keeps tone slashes, pitch accents and flex marks', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expect(entry?.responsory).toContain('´and to the Son / and to the Holy Spirit.+');
  });

  it('keeps a whitespace-only field exactly, while treating it as empty', () => {
    const { entry } = normaliseEntry(entryWith(AWKWARD));
    expect(entry?.concludingPrayer).toBe('   ');
    expect(entry?.needsReview).toBe(true);
  });

  it('is stable when run again over its own output', () => {
    const once = normaliseEntry(entryWith(AWKWARD)).entry!;
    const twice = normaliseEntry(once).entry!;
    expectExact(twice, AWKWARD);
    expect(twice.note).toBe(once.note);
  });
});

describe('a full store migration never alters wording', () => {
  it('preserves the fields through migrateStore', () => {
    const { file } = migrateStore({ schemaVersion: 3, entries: [entryWith(AWKWARD)] });
    expectExact(file.entries[0], AWKWARD);
  });
});

describe('save, reload and export round trips are byte-identical', () => {
  it('survives a write to storage and a read back', () => {
    saveStore({ schemaVersion: 3, entries: [entryWith(AWKWARD)], meta: { createdAt: 'x' } });
    const reloaded = loadStore().file;
    expectExact(reloaded.entries[0], AWKWARD);
    expect(reloaded.entries[0].note).toBe('  a note with its own  spacing\r\n  ');
  });

  it('survives export to JSON and import back', () => {
    const store = { schemaVersion: 3, entries: [entryWith(AWKWARD)], meta: { createdAt: 'x' } };
    const json = JSON.stringify(buildBackup(store), null, 2);
    const preview = analyseImport(json, []);
    const { entries } = applyImport([], preview, { mode: 'replace', conflictWinner: 'imported' });
    expectExact(entries[0], AWKWARD);
  });

  it('reaches a fixed point, so repeated round trips stop changing anything', () => {
    /* The first pass may ADD metadata — a review flag for the whitespace-only
       prayer. It must never add it twice: a note that grew on every round
       trip would make migration non-idempotent. Content is exact throughout;
       the whole payload is stable from the first pass onward. */
    const roundTrip = (entries: Entry[]): Entry[] => {
      const store = { schemaVersion: 3, entries, meta: { createdAt: 'x' } };
      const preview = analyseImport(JSON.stringify(buildBackup(store)), []);
      return applyImport([], preview, { mode: 'replace', conflictWinner: 'imported' }).entries;
    };
    const payload = (entries: Entry[]) =>
      JSON.stringify(entries.map((item) => ({ ...item, updatedAt: '' })));

    const first = roundTrip([entryWith(AWKWARD)]);
    const second = roundTrip(first);
    const third = roundTrip(second);

    expectExact(first[0], AWKWARD);
    expectExact(third[0], AWKWARD);
    expect(payload(second)).toBe(payload(first));
    expect(payload(third)).toBe(payload(first));
  });

  it('does not let the review note grow on repeated passes', () => {
    let entry = normaliseEntry(entryWith(AWKWARD)).entry!;
    const firstNote = entry.reviewNote;
    expect(firstNote).toBeTruthy();
    for (let pass = 0; pass < 4; pass += 1) entry = normaliseEntry(entry).entry!;
    expect(entry.reviewNote).toBe(firstNote);
  });
});

describe('the live editing path stores exactly what it is given', () => {
  it('does not trim a section saved through saveSection', () => {
    const saved = saveSection(
      { keyType: 'date', hour: 'morning', date: '2026-12-20' },
      'reading',
      {
        reference: AWKWARD.reference,
        readingText: AWKWARD.readingText,
        translation: AWKWARD.translation,
      },
    );
    expect(saved?.reference).toBe(AWKWARD.reference);
    expect(saved?.readingText).toBe(AWKWARD.readingText);
    expect(saved?.translation).toBe(AWKWARD.translation);
  });

  it('keeps that exact text after a reload from storage', () => {
    saveSection(
      { keyType: 'date', hour: 'morning', date: '2026-12-20' },
      'responsory',
      { responsory: AWKWARD.responsory },
    );
    reloadFromStorage();
    const reloaded = loadStore().file.entries[0];
    expect(reloaded.responsory).toBe(AWKWARD.responsory);
  });
});

describe('the CRLF limitation is stated honestly', () => {
  it('preserves CRLF through migration, import and export', () => {
    const crlf = { ...EMPTY_CONTENT, responsory: 'V.  First line.\r\nR.  Second line.\r\n' };
    const store = { schemaVersion: 3, entries: [entryWith(crlf)], meta: { createdAt: 'x' } };
    const preview = analyseImport(JSON.stringify(buildBackup(store)), []);
    const { entries } = applyImport([], preview, { mode: 'replace', conflictWinner: 'imported' });
    expect(entries[0].responsory).toBe('V.  First line.\r\nR.  Second line.\r\n');
  });

  it('documents that a textarea hands application code LF, not CRLF', () => {
    /* Not a defect in this code, and not something it may paper over: the
       HTML specification normalises a textarea's API value to LF. Material
       whose original line endings matter should be imported, not pasted. */
    const textarea = document.createElement('textarea');
    textarea.value = 'V.  First line.\r\nR.  Second line.';
    expect(textarea.value).toBe('V.  First line.\nR.  Second line.');

    // Whatever the DOM yields, this code stores it unchanged.
    const saved = saveSection(
      { keyType: 'date', hour: 'morning', date: '2026-12-20' },
      'responsory',
      { responsory: textarea.value },
    );
    expect(saved?.responsory).toBe(textarea.value);
  });
});

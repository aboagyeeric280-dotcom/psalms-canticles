/* Safety rules for the backup and transfer screen.
 *
 * The migration engine has its own suites; these cover the seam this screen
 * adds — opening, hand-picking a file, and the gates that stand between a
 * reader and a write. What they are really protecting is that a reader who
 * has written a hundred responsories over two years cannot lose one of them
 * by pressing a button on this page.
 */

import { describe, expect, it } from 'vitest';
import { fakeStorage } from '../migration/fakeStorage';
import { DESTINATION_KEY, RECEIPT_KEY, SOURCE_KEY } from '../migration/keys';
import {
  commitMigration, exportCurrent, openChosenFile, openTransfer,
  overlaySource, rawLegacyBackup, resultOf, summarise,
} from './transfer';
import { previewMigration } from '../migration/preview';
import type { Entry } from '../data/types';

const NOW = new Date(2027, 5, 15);
const opts = { now: NOW, windowDays: 400 };

/* Trailing spaces, a hard line break and a field this version has never
   heard of: everything that a careless normaliser would tidy away. */
const LEGACY = JSON.stringify({
  schemaVersion: 3,
  entries: [
    {
      id: 'l1', keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Romans 13:11', readingText: 'It is now the hour.  ',
      translation: 'Douay-Rheims',
      responsory: 'V. Line one.\nR. Line two.   ',
      chantTone: 'VIII G',
    },
    {
      id: 'l2', keyType: 'psalter', hour: 'evening',
      season: 'ordinary', psalterWeek: 2, weekday: 3,
      concludingPrayer: 'A prayer from the older app.',
    },
  ],
});

const withLegacy = (extra: Record<string, string> = {}) =>
  fakeStorage({ [SOURCE_KEY]: LEGACY, ...extra });

/** What is in the destination now, as entries. */
function destination(store: { getItem(k: string): string | null }): Entry[] {
  const raw = store.getItem(DESTINATION_KEY);
  return raw ? (JSON.parse(raw) as { entries: Entry[] }).entries : [];
}

function run(store = withLegacy(), confirmed = true) {
  const preview = previewMigration(store, opts);
  const backup = rawLegacyBackup(preview, NOW);
  const outcome = commitMigration(store, preview, backup.evidence, { confirmed, now: NOW });
  return { store, preview, backup, outcome };
}

describe('opening the screen looks and does not touch', () => {
  it('writes nothing to this feature’s keys while opening and previewing', () => {
    const store = withLegacy();
    const opened = openTransfer(store, opts);
    expect(opened?.summary.sourceRecords).toBe(2);
    /* The quota probe is a commit-time write and must not have happened; so
       must nothing else. fakeStorage records every attempt, thrown or not. */
    expect(store.writes).toEqual([]);
    expect(store.removals).toEqual([]);
  });

  it('leaves the stored bytes byte-identical after a preview', () => {
    const store = withLegacy({ [DESTINATION_KEY]: '{"schemaVersion":4,"entries":[]}' });
    const before = JSON.stringify([...store.raw.entries()]);
    openTransfer(store, opts);
    expect(JSON.stringify([...store.raw.entries()])).toBe(before);
  });

  it('reports nothing to do when there is no legacy material', () => {
    expect(openTransfer(fakeStorage(), opts)).toBeNull();
  });

  it('previews a hand-picked file without writing it anywhere', () => {
    const store = fakeStorage();
    const opened = openChosenFile(store, LEGACY, opts);
    expect(opened.origin).toBe('chosen-file');
    expect(opened.summary.sourceRecords).toBe(2);
    expect(store.writes).toEqual([]);
    // The file was never parked under the legacy key to be read back.
    expect(store.getItem(SOURCE_KEY)).toBeNull();
  });
});

describe('the legacy key is never written and never removed', () => {
  it('refuses a write to it even when asked directly', () => {
    const store = withLegacy();
    expect(() => store.setItem(SOURCE_KEY, 'x')).toThrow(/read-only/);
    expect(() => store.removeItem(SOURCE_KEY)).toThrow(/read-only/);
  });

  it('leaves it exactly as it was after a whole migration', () => {
    const { store, outcome } = run();
    expect(outcome.ok).toBe(true);
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
    expect(store.writes).not.toContain(SOURCE_KEY);
    expect(store.removals).not.toContain(SOURCE_KEY);
  });

  it('does not touch it when the source came from a chosen file', () => {
    const store = withLegacy();
    const other = JSON.stringify({ schemaVersion: 3, entries: [] });
    const target = overlaySource(store, other);
    const preview = previewMigration(target, opts);
    commitMigration(target, preview, rawLegacyBackup(preview, NOW).evidence,
      { confirmed: true, now: NOW });
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });
});

describe('a source that cannot be trusted is blocked', () => {
  it('blocks and explains an unreadable source', () => {
    const opened = openChosenFile(fakeStorage(), '{ this is not json', opts);
    expect(opened.preview.corrupt).toBe(true);
    expect(opened.summary.blocking.join(' ')).toMatch(/could not be read/i);
  });

  it('blocks a schema from the future', () => {
    const future = JSON.stringify({ schemaVersion: 99, entries: [] });
    const opened = openChosenFile(fakeStorage(), future, opts);
    expect(opened.preview.futureSchema).toBe(true);
    expect(opened.summary.blocking.join(' ')).toMatch(/newer version/i);
  });

  it('writes nothing when a blocked source is migrated anyway', () => {
    const future = JSON.stringify({ schemaVersion: 99, entries: [] });
    const store = fakeStorage();
    const target = overlaySource(store, future);
    const preview = previewMigration(target, opts);
    const outcome = commitMigration(target, preview, rawLegacyBackup(preview, NOW).evidence,
      { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('says so rather than showing zeroes', () => {
    const opened = openChosenFile(fakeStorage(), 'nonsense', opts);
    expect(opened.summary.blocking.length).toBeGreaterThan(0);
  });
});

describe('migration cannot run without backup evidence and confirmation', () => {
  it('refuses without confirmation', () => {
    const { store, outcome } = run(withLegacy(), false);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.stage).toBe('confirmation');
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('refuses without a backup', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const outcome = commitMigration(store, preview, undefined, { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.stage).toBe('evidence');
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('backs up the legacy bytes verbatim, not a rewritten copy', () => {
    const preview = previewMigration(withLegacy(), opts);
    const backup = rawLegacyBackup(preview, NOW);
    expect(backup.json).toBe(LEGACY);
    expect(backup.evidence.verbatim).toBe(true);
  });
});

describe('backup evidence stops matching when the source changes', () => {
  it('refuses a backup taken of different material', () => {
    const store = withLegacy();
    const staleBackup = rawLegacyBackup(previewMigration(store, opts), NOW);

    // The older app was used again between the backup and the migration.
    const changed = JSON.stringify({
      schemaVersion: 3,
      entries: [{ id: 'l9', keyType: 'psalter', hour: 'morning',
        season: 'ordinary', psalterWeek: 1, weekday: 1, responsory: 'Added later.' }],
    });
    const target = overlaySource(store, changed);
    const preview = previewMigration(target, opts);

    const outcome = commitMigration(target, preview, staleBackup.evidence,
      { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.stage).toBe('evidence');
    expect(outcome.ok === false && outcome.reason).toMatch(/does not match/i);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('gives a different checksum for different bytes', () => {
    const a = rawLegacyBackup(previewMigration(withLegacy(), opts), NOW);
    const other = overlaySource(fakeStorage(), `${LEGACY} `);
    const b = rawLegacyBackup(previewMigration(other, opts), NOW);
    expect(a.evidence.sourceChecksum).not.toBe(b.evidence.sourceChecksum);
  });
});

describe('the wording that arrives is the wording that was there', () => {
  it('keeps trailing space, line breaks and unknown fields exactly', () => {
    const { store, outcome } = run();
    expect(outcome.ok).toBe(true);

    const arrived = destination(store).find((entry) => entry.id === 'l1')!;
    expect(arrived.readingText).toBe('It is now the hour.  ');
    expect(arrived.responsory).toBe('V. Line one.\nR. Line two.   ');
    expect(arrived.reference).toBe('Romans 13:11');
    // A field this version does not understand is carried, not dropped.
    expect(JSON.stringify(arrived)).toContain('VIII G');
  });
});

describe('what the reader already wrote wins', () => {
  const MINE: Entry = {
    id: 'mine', keyType: 'psalter', hour: 'morning',
    season: 'ordinary', psalterWeek: 1, weekday: 1,
    reference: 'My reference', readingText: 'My own wording, which must stand.',
    translation: '', responsory: '', intercessions: '', concludingPrayer: '',
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  };

  const seeded = () => withLegacy({
    [DESTINATION_KEY]: JSON.stringify({ schemaVersion: 4, entries: [MINE] }),
  });

  it('leaves an existing section exactly as the reader wrote it', () => {
    const { store, outcome } = run(seeded());
    expect(outcome.ok).toBe(true);
    const mine = destination(store).find((entry) => entry.id === 'mine')!;
    expect(mine.readingText).toBe('My own wording, which must stand.');
    expect(mine.reference).toBe('My reference');
  });

  it('adds a section the reader never wrote', () => {
    const { store } = run(seeded());
    const mine = destination(store).find((entry) => entry.id === 'mine')!;
    // The reader had no responsory on that key; the older app's one arrives.
    expect(mine.responsory).toBe('V. Line one.\nR. Line two.   ');
  });

  it('counts the conflict rather than hiding it', () => {
    const { outcome } = run(seeded());
    expect(outcome.ok).toBe(true);
    const result = outcome.ok ? resultOf(outcome) : null;
    expect(result!.conflicts).toBeGreaterThan(0);
  });

  it('reports what it did', () => {
    const { outcome } = run();
    const result = outcome.ok ? resultOf(outcome) : null;
    expect(result).not.toBeNull();
    expect(result!.imported).toBe(2);
  });
});

describe('running it twice changes nothing the second time', () => {
  it('is idempotent', () => {
    const { store, outcome } = run();
    expect(outcome.ok).toBe(true);
    const after = store.getItem(DESTINATION_KEY);

    const second = previewMigration(store, opts);
    expect(second.alreadyMigrated).toBe(true);

    commitMigration(store, second, rawLegacyBackup(second, NOW).evidence,
      { confirmed: true, now: NOW });
    const entries = destination(store);
    expect(entries).toHaveLength(JSON.parse(after!).entries.length);
    expect(entries.map((e) => e.id).sort()).toEqual(['l1', 'l2']);
  });
});

describe('a storage failure is never reported as success', () => {
  it('reports the failure and leaves the destination alone', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const backup = rawLegacyBackup(preview, NOW);
    store.failOn((key) => key === DESTINATION_KEY, 5);

    const outcome = commitMigration(store, preview, backup.evidence,
      { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
    // And the older app's copy is still there to try again from.
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });

  it('writes no receipt when the quota probe fails', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const backup = rawLegacyBackup(preview, NOW);
    store.failOn((key) => key.includes('quota_probe'), 5);

    const outcome = commitMigration(store, preview, backup.evidence,
      { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
  });
});

describe('exporting what is already here', () => {
  it('writes schema-4 JSON and changes nothing', () => {
    const entries = [{
      id: 'x', keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, reference: '', readingText: 'Kept  exactly.  ',
      translation: '', responsory: '', intercessions: '', concludingPrayer: '',
      createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
    }] as Entry[];
    const { json, filename } = exportCurrent(entries, NOW);
    const parsed = JSON.parse(json) as { schemaVersion: number; entries: Entry[] };
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.entries[0].readingText).toBe('Kept  exactly.  ');
    expect(filename).toMatch(/\.json$/);
  });
});

describe('the summary is the engine’s own counting', () => {
  it('reads its numbers off the preview totals', () => {
    const preview = previewMigration(withLegacy(), opts);
    const summary = summarise(preview);
    expect(summary.sourceRecords).toBe(preview.totals.found);
    expect(summary.needsReview).toBe(preview.totals.needsReview);
    expect(summary.conflicts).toBe(preview.totals.conflicts);
    expect(summary.unresolved)
      .toBe(preview.totals.wouldNotResolve + preview.totals.pastDates);
  });
});

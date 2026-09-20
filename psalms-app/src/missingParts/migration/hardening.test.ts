import { describe, expect, it, vi } from 'vitest';
import { fakeStorage } from './fakeStorage';
import { buildCoverageWindow, previewMigration, RESOLUTION_WINDOW_DAYS } from './preview';
import {
  commitMigration, discardRollbackSnapshot, generateBackup, rollbackMigration,
} from './commit';
import {
  DESTINATION_KEY, RECEIPT_KEY, ROLLBACK_PREFIX, SOURCE_KEY, checksum,
} from './keys';
import { missingPartsDay } from '../adapter/day';
import { liturgicalToday } from '../../utils/generalCalendar';
import { classifySection } from '../data/backup';
import { EMPTY_CONTENT, type Entry } from '../data/types';

const NOW = new Date(2027, 5, 15);
const opts = { now: NOW, windowDays: 120 };

const LEGACY = JSON.stringify({
  schemaVersion: 3,
  entries: [
    {
      id: 'l1', keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Romans 13:11', readingText: 'It is now the hour.', translation: 'Douay-Rheims',
    },
  ],
});

/* A destination holding wording this version has no business touching:
   awkward whitespace, and a field from a version that does not exist yet. */
const EXISTING_RAW = JSON.stringify({
  schemaVersion: 4,
  entries: [{
    ...EMPTY_CONTENT,
    id: 'mine', keyType: 'psalter', hour: 'morning',
    season: 'ordinary', psalterWeek: 2, weekday: 3,
    responsory: '  V. Keep me exactly.\r\n  R. Keep me exactly.  ',
    extra: { somethingFromTheFuture: ['a', { b: 2 }] },
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  }],
  meta: { createdAt: 'x', unknownMetaField: 'keep me too' },
});

function commitOver(existing: string | null) {
  const store = fakeStorage(existing === null
    ? { [SOURCE_KEY]: LEGACY }
    : { [SOURCE_KEY]: LEGACY, [DESTINATION_KEY]: existing });
  const preview = previewMigration(store, opts);
  const backup = generateBackup(preview, NOW);
  const outcome = commitMigration(store, preview, backup.evidence, {
    confirmed: true, now: NOW, migrationId: 'm_test_0001',
  });
  return { store, outcome };
}

describe('R30: rollback restores the exact pre-migration state', () => {
  it('records everything rollback needs in the receipt', () => {
    const { store, outcome } = commitOver(EXISTING_RAW);
    expect(outcome.ok).toBe(true);
    const receipt = JSON.parse(store.getItem(RECEIPT_KEY)!);
    expect(receipt.migrationId).toBe('m_test_0001');
    expect(receipt.rollbackSnapshotKey).toBe(`${ROLLBACK_PREFIX}m_test_0001`);
    expect(receipt.rollbackSnapshotChecksum).toBe(checksum(EXISTING_RAW));
    expect(receipt.destinationExisted).toBe(true);
    expect(receipt.sourceChecksum).toBe(checksum(LEGACY));
    expect(receipt.committedDestinationChecksum).toBe(checksum(store.getItem(DESTINATION_KEY)!));
    expect(receipt.committedAt).toBe(NOW.toISOString());
  });

  it('keeps the rollback copy after a successful commit', () => {
    const { store } = commitOver(EXISTING_RAW);
    expect(store.getItem(`${ROLLBACK_PREFIX}m_test_0001`)).toBe(EXISTING_RAW);
  });

  it('reproduces the previous storage state byte for byte', () => {
    const { store } = commitOver(EXISTING_RAW);
    expect(store.getItem(DESTINATION_KEY)).not.toBe(EXISTING_RAW);

    const outcome = rollbackMigration(store, NOW);
    expect(outcome.ok && outcome.restored).toBe('value');
    expect(store.getItem(DESTINATION_KEY)).toBe(EXISTING_RAW);
  });

  it('brings back whitespace and unknown fields unchanged', () => {
    const { store } = commitOver(EXISTING_RAW);
    rollbackMigration(store, NOW);
    const restored = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(restored).toEqual(JSON.parse(EXISTING_RAW));
    expect(restored.entries[0].responsory).toBe('  V. Keep me exactly.\r\n  R. Keep me exactly.  ');
    expect(restored.entries[0].extra.somethingFromTheFuture).toEqual(['a', { b: 2 }]);
    expect(restored.meta.unknownMetaField).toBe('keep me too');
  });

  it('removes the destination when there was none before', () => {
    const { store } = commitOver(null);
    const receipt = JSON.parse(store.getItem(RECEIPT_KEY)!);
    expect(receipt.destinationExisted).toBe(false);
    expect(receipt.rollbackSnapshotKey).toBeUndefined();
    expect(rollbackMigration(store, NOW).ok).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('refuses when the snapshot has gone, and keeps what is there now', () => {
    const { store } = commitOver(EXISTING_RAW);
    const migrated = store.getItem(DESTINATION_KEY);
    store.removeItem(`${ROLLBACK_PREFIX}m_test_0001`);

    const outcome = rollbackMigration(store, NOW);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain('missing');
    expect(store.getItem(DESTINATION_KEY)).toBe(migrated);
    expect(JSON.parse(store.getItem(RECEIPT_KEY)!).rolledBackAt).toBeUndefined();
  });

  it('refuses when the snapshot has been tampered with', () => {
    const { store } = commitOver(EXISTING_RAW);
    const migrated = store.getItem(DESTINATION_KEY);
    store.setItem(`${ROLLBACK_PREFIX}m_test_0001`, '{"entries":[]}');

    const outcome = rollbackMigration(store, NOW);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toContain('does not match');
    expect(outcome.ok === false && outcome.snapshotPreserved).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBe(migrated);
  });

  it('keeps the snapshot and receipt when restoring fails, so it can be retried', () => {
    const { store } = commitOver(EXISTING_RAW);
    store.failOn((k) => k === DESTINATION_KEY);

    const first = rollbackMigration(store, NOW);
    expect(first.ok).toBe(false);
    expect(first.ok === false && first.snapshotPreserved).toBe(true);
    expect(store.getItem(`${ROLLBACK_PREFIX}m_test_0001`)).toBe(EXISTING_RAW);
    expect(JSON.parse(store.getItem(RECEIPT_KEY)!).rolledBackAt).toBeUndefined();

    // The failure was transient; retrying now works.
    const second = rollbackMigration(store, NOW);
    expect(second.ok).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBe(EXISTING_RAW);
  });

  it('marks the receipt only after the restore has actually happened', () => {
    const { store } = commitOver(EXISTING_RAW);
    store.failOn((k) => k === DESTINATION_KEY);
    rollbackMigration(store, NOW);
    expect(JSON.parse(store.getItem(RECEIPT_KEY)!).rolledBackAt).toBeUndefined();
    rollbackMigration(store, NOW);
    expect(JSON.parse(store.getItem(RECEIPT_KEY)!).rolledBackAt).toBe(NOW.toISOString());
  });

  it('is idempotent: rolling back again changes nothing', () => {
    const { store } = commitOver(EXISTING_RAW);
    rollbackMigration(store, NOW);
    const after = store.getItem(DESTINATION_KEY);
    const writesBefore = store.writes.length;

    const second = rollbackMigration(store, NOW);
    expect(second.ok).toBe(true);
    expect(second.ok && second.alreadyRolledBack).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBe(after);
    expect(store.writes.length).toBe(writesBefore);
  });

  it('is safe when there is nothing to roll back', () => {
    const store = fakeStorage();
    const outcome = rollbackMigration(store, NOW);
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.restored).toBe('nothing-to-do');
    expect(store.writes).toEqual([]);
  });

  it('never puts a snapshot under the legacy source key', () => {
    const { store } = commitOver(EXISTING_RAW);
    for (const key of store.raw.keys()) {
      if (key === SOURCE_KEY) continue;
      expect(key.startsWith(ROLLBACK_PREFIX) ? key : '').not.toBe(SOURCE_KEY);
    }
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });

  it('lets the snapshot be discarded deliberately', () => {
    const { store } = commitOver(EXISTING_RAW);
    const receipt = JSON.parse(store.getItem(RECEIPT_KEY)!);
    expect(discardRollbackSnapshot(store, receipt)).toBe(true);
    expect(store.getItem(`${ROLLBACK_PREFIX}m_test_0001`)).toBeNull();
  });
});

describe('a future schema is refused outright, never rewritten', () => {
  const FUTURE_RAW = JSON.stringify({
    schemaVersion: 9,
    entries: [{
      id: 'f1', keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: 1, weekday: 1,
      readingText: '  Text with  odd   spacing\r\n',
      somethingUnknown: { deeply: ['nested', 1, null] },
    }],
    meta: { createdAt: 'x' },
    aWholeUnknownSection: [1, 2, 3],
  });
  const futureStore = () => fakeStorage({ [SOURCE_KEY]: FUTURE_RAW });

  it('is reported as a blocking condition, not a warning', () => {
    const preview = previewMigration(futureStore(), opts);
    expect(preview.futureSchema).toBe(true);
    expect(preview.ok).toBe(false);
    expect(preview.errors.join(' ')).toContain('newer version');
    expect(preview.fromSchemaVersion).toBe(9);
  });

  it('normalises nothing: the preview carries no entries', () => {
    expect(previewMigration(futureStore(), opts).entries).toEqual([]);
  });

  it('still lets a backup be taken, byte for byte', () => {
    const store = futureStore();
    const backup = generateBackup(previewMigration(store, opts), NOW);
    expect(backup.evidence.verbatim).toBe(true);
    expect(backup.json).toBe(FUTURE_RAW);
    expect(JSON.parse(backup.json)).toEqual(JSON.parse(FUTURE_RAW));
  });

  it('refuses to commit, with no writes whatsoever', () => {
    const store = futureStore();
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.stage).toBe('futureSchema');
    expect(store.writes).toEqual([]);
    expect(store.removals).toEqual([]);
  });

  it('leaves the raw source identical, character for character', () => {
    const store = futureStore();
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    expect(store.getItem(SOURCE_KEY)).toBe(FUTURE_RAW);
  });

  it('leaves every known and unknown field deeply equal', () => {
    const store = futureStore();
    const before = JSON.parse(store.getItem(SOURCE_KEY)!);
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    const after = JSON.parse(store.getItem(SOURCE_KEY)!);
    expect(after).toEqual(before);
    expect(after.entries[0].readingText).toBe('  Text with  odd   spacing\r\n');
    expect(after.entries[0].somethingUnknown).toEqual({ deeply: ['nested', 1, null] });
    expect(after.aWholeUnknownSection).toEqual([1, 2, 3]);
  });

  it('creates no destination at all', () => {
    const store = futureStore();
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
  });
});

describe('R33: preview and import classify conflicts the same way', () => {
  const base: Entry = {
    ...EMPTY_CONTENT,
    id: 'mine', keyType: 'psalter', hour: 'morning',
    season: 'ordinary', psalterWeek: 1, weekday: 1,
    reference: 'Romans 13:11', readingText: 'It is now the hour.', translation: 'Douay-Rheims',
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  };
  const destinationWith = (entry: Entry) => JSON.stringify({
    schemaVersion: 4, entries: [entry], meta: { createdAt: 'x' },
  });
  const previewAgainst = (entry: Entry) => previewMigration(
    fakeStorage({ [SOURCE_KEY]: LEGACY, [DESTINATION_KEY]: destinationWith(entry) }),
    opts,
  );

  it('reports an exact match as no conflict at all', () => {
    const preview = previewAgainst(base);
    expect(preview.conflicts).toHaveLength(0);
    expect(preview.records.find((r) => r.entry.id === 'l1')?.status).toBe('unchanged');
  });

  it('reports a whitespace-only difference as its own kind', () => {
    const preview = previewAgainst({ ...base, readingText: 'It is now the hour.   ' });
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0].kind).toBe('whitespace-only');
    expect(preview.conflicts[0].whitespaceOnlySections).toEqual(['reading']);
  });

  it('reports a difference in wording as a wording conflict', () => {
    const preview = previewAgainst({ ...base, readingText: 'A different wording entirely.' });
    expect(preview.conflicts[0].kind).toBe('wording');
    expect(preview.conflicts[0].whitespaceOnlySections).toEqual([]);
  });

  it('uses the one shared classifier', () => {
    expect(classifySection(base, base, 'reading')).toBe('identical');
    expect(classifySection(base, { ...base, readingText: 'It is now the hour.   ' }, 'reading')).toBe('whitespace-only');
    expect(classifySection(base, { ...base, readingText: 'Something else.' }, 'reading')).toBe('wording');
  });

  it('resolves no conflict on its own', () => {
    const store = fakeStorage({
      [SOURCE_KEY]: LEGACY,
      [DESTINATION_KEY]: destinationWith({ ...base, readingText: 'Mine, and mine it stays.' }),
    });
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    const saved = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(saved.entries.find((e: Entry) => e.id === 'mine').readingText).toBe('Mine, and mine it stays.');
  });
});

describe('R32: the calendar is swept once per preview, not once per record', () => {
  function storeWithPsalterRecords(count: number) {
    const entries = Array.from({ length: count }, (_, index) => ({
      id: `p${index}`, keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: ((index % 4) + 1), weekday: index % 7,
      readingText: `Reading ${index}.`,
    }));
    return fakeStorage({ [SOURCE_KEY]: JSON.stringify({ schemaVersion: 3, entries }) });
  }

  function countCalls(recordCount: number, windowDays: number) {
    const resolver = vi.fn((when: Date) => missingPartsDay(liturgicalToday(when)));
    const preview = previewMigration(storeWithPsalterRecords(recordCount), {
      now: NOW, windowDays, dayResolver: resolver,
    });
    return { calls: resolver.mock.calls.length, preview };
  }

  it('computes exactly one liturgical day per day of the window', () => {
    expect(countCalls(1, 90).calls).toBe(90);
  });

  it('does not multiply the work by the number of records', () => {
    const one = countCalls(1, 90);
    const forty = countCalls(40, 90);
    expect(forty.calls).toBe(one.calls);
    expect(forty.calls).toBe(90);
  });

  it('scales with the window, as it should', () => {
    expect(countCalls(10, 30).calls).toBe(30);
    expect(countCalls(10, 180).calls).toBe(180);
  });

  it('keeps the default window at three years', () => {
    expect(RESOLUTION_WINDOW_DAYS).toBe(365 * 3);
  });

  it('gives identical totals and resolvability either way', () => {
    const plain = previewMigration(storeWithPsalterRecords(12), opts);
    const seamed = previewMigration(storeWithPsalterRecords(12), {
      ...opts, dayResolver: (when) => missingPartsDay(liturgicalToday(when)),
    });
    expect(seamed.totals).toEqual(plain.totals);
    expect(seamed.records.map((r) => r.resolvable)).toEqual(plain.records.map((r) => r.resolvable));
    expect(seamed.records.map((r) => r.coverageChanged)).toEqual(plain.records.map((r) => r.coverageChanged));
  });

  it('builds the window itself in one pass', () => {
    const resolver = vi.fn((when: Date) => missingPartsDay(liturgicalToday(when)));
    const window = buildCoverageWindow(NOW, 45, resolver);
    expect(window).toHaveLength(45);
    expect(resolver.mock.calls.length).toBe(45);
    expect(window[0].iso).toBe('2027-06-15');
  });
});

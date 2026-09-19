import { describe, expect, it } from 'vitest';
import { fakeStorage } from './fakeStorage';
import { detectLegacyData, previewMigration } from './preview';
import {
  commitMigration, generateBackup, inspectRecovery, probeQuota, rollbackMigration,
} from './commit';
import {
  DESTINATION_KEY, IN_PROGRESS_KEY, QUARANTINE_PREFIX, RECEIPT_KEY, SNAPSHOT_PREFIX, SOURCE_KEY,
} from './keys';
import { LegacyKeyWriteError } from './storageIo';
import { EMPTY_CONTENT, type Entry } from '../data/types';

const NOW = new Date(2027, 5, 15);
const WINDOW = 400;
const opts = { now: NOW, windowDays: WINDOW };

const LEGACY = JSON.stringify({
  schemaVersion: 3,
  entries: [
    {
      id: 'l1', keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Romans 13:11', readingText: 'It is now the hour.  ', translation: 'Douay-Rheims',
    },
    {
      id: 'l2', keyType: 'week', hour: 'evening', season: 'lent', weekOfSeason: 6,
      responsory: 'V. Christ became obedient.\nR. Christ became obedient.',
    },
    {
      id: 'l3', keyType: 'celebration', hour: 'morning',
      celebrationId: 'saints-peter-and-paul-apostles',
      celebrationName: 'Saints Peter and Paul, Apostles',
      intercessions: 'For the apostles.',
    },
  ],
});

const withLegacy = () => fakeStorage({ [SOURCE_KEY]: LEGACY });

function fullCommit(store = withLegacy()) {
  const preview = previewMigration(store, opts);
  const backup = generateBackup(preview, NOW);
  const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
  return { store, preview, backup, outcome };
}

describe('detection reads without touching anything', () => {
  it('finds the legacy material', () => {
    const store = withLegacy();
    expect(detectLegacyData(store)?.key).toBe(SOURCE_KEY);
    expect(store.writes).toEqual([]);
  });

  it('reports nothing when there is nothing there', () => {
    expect(detectLegacyData(fakeStorage())).toBeNull();
  });
});

describe('the preview is pure', () => {
  it('writes and removes nothing at all', () => {
    const store = withLegacy();
    previewMigration(store, opts);
    expect(store.writes).toEqual([]);
    expect(store.removals).toEqual([]);
  });

  it('leaves the destination absent', () => {
    const store = withLegacy();
    previewMigration(store, opts);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
  });

  it('does not even quarantine unreadable data', () => {
    const store = fakeStorage({ [SOURCE_KEY]: '{not json' });
    const preview = previewMigration(store, opts);
    expect(preview.corrupt).toBe(true);
    expect(preview.ok).toBe(false);
    expect(store.writes).toEqual([]);
    expect(store.getItem(SOURCE_KEY)).toBe('{not json');
  });

  it('reports what would happen, in the categories the reader is shown', () => {
    const preview = previewMigration(withLegacy(), opts);
    expect(preview.ok).toBe(true);
    expect(preview.totals.found).toBe(3);
    expect(preview.fromSchemaVersion).toBe(3);
    expect(preview.toSchemaVersion).toBe(4);
    expect(preview.totals.holyWeekConverted).toBe(1);
    expect(preview.totals.celebrationsReKeyed).toBe(1);
    expect(preview.totals.needsReview).toBeGreaterThan(0);
    expect(preview.quota.neededChars).toBeGreaterThan(0);
  });

  it('says which records would not resolve at all', () => {
    const store = fakeStorage({
      [SOURCE_KEY]: JSON.stringify({
        schemaVersion: 3,
        entries: [{ keyType: 'celebration', hour: 'morning', celebrationId: 'nothing-like-this', celebrationName: 'Nothing', responsory: 'x' }],
      }),
    });
    const preview = previewMigration(store, opts);
    expect(preview.totals.wouldNotResolve).toBe(1);
    expect(preview.records[0].resolvable).toBe('never');
  });

  it('separates an exact date already past from one that never matches', () => {
    const store = fakeStorage({
      [SOURCE_KEY]: JSON.stringify({
        schemaVersion: 3,
        entries: [{ keyType: 'date', hour: 'morning', date: '2020-12-20', responsory: 'x' }],
      }),
    });
    expect(previewMigration(store, opts).records[0].resolvable).toBe('past');
  });

  it('reports the psalter rule change with the dates that moved', () => {
    const preview = previewMigration(withLegacy(), opts);
    const psalter = preview.records.find((r) => r.entry.id === 'l1')!;
    expect(psalter.coverageChanged).toBeDefined();
    expect(
      psalter.coverageChanged!.lost.length + psalter.coverageChanged!.gained.length,
    ).toBeGreaterThan(0);
    expect(preview.totals.coverageChanged).toBe(1);
  });
});

describe('nothing is written before confirmation', () => {
  it('refuses without confirmation', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, { confirmed: false, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.stage).toBe('confirmation');
    expect(store.writes).toEqual([]);
  });

  it('refuses without backup evidence', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const outcome = commitMigration(store, preview, undefined, { confirmed: true, now: NOW });
    expect(outcome.ok === false && outcome.stage).toBe('evidence');
    expect(store.writes).toEqual([]);
  });

  it('refuses a backup taken from different material', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const stale = { ...generateBackup(preview, NOW).evidence, sourceChecksum: 'nonsense' };
    const outcome = commitMigration(store, preview, stale, { confirmed: true, now: NOW });
    expect(outcome.ok === false && outcome.stage).toBe('evidence');
    expect(store.writes).toEqual([]);
  });
});

describe('a confirmed migration writes in stages', () => {
  it('succeeds and records a receipt', () => {
    const { store, outcome } = fullCommit();
    expect(outcome.ok).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBeTruthy();
    expect(store.getItem(RECEIPT_KEY)).toBeTruthy();
  });

  it('takes the receipt down as the last thing it does', () => {
    const { store } = fullCommit();
    const order = store.writes.filter((k) => k !== '__dpc_mp_quota_probe__');
    expect(order.indexOf(RECEIPT_KEY)).toBeGreaterThan(order.indexOf(DESTINATION_KEY));
    expect(order.indexOf(DESTINATION_KEY)).toBeGreaterThan(order.findIndex((k) => k.startsWith(SNAPSHOT_PREFIX)));
  });

  it('clears the in-progress marker once it is done', () => {
    const { store } = fullCommit();
    expect(store.getItem(IN_PROGRESS_KEY)).toBeNull();
    expect(inspectRecovery(store).kind).toBe('finished');
  });

  it('keeps a snapshot of the source for rollback', () => {
    const { store } = fullCommit();
    const snapshot = [...store.raw.keys()].find((k) => k.startsWith(SNAPSHOT_PREFIX));
    expect(snapshot).toBeTruthy();
    expect(store.getItem(snapshot!)).toBe(LEGACY);
  });

  it('writes the migrated material at schema 4, with the wording intact', () => {
    const { store } = fullCommit();
    const saved = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(saved.schemaVersion).toBe(4);
    const reading = saved.entries.find((e: Entry) => e.id === 'l1');
    expect(reading.readingText).toBe('It is now the hour.  ');
    const holyWeek = saved.entries.find((e: Entry) => e.id === 'l2');
    expect(holyWeek.season).toBe('holyweek');
    expect(holyWeek.weekOfSeason).toBe(1);
    const feast = saved.entries.find((e: Entry) => e.id === 'l3');
    expect(feast.celebrationId).toBe('saint-peter-and-saint-paul');
  });
});

describe('the legacy key is read-only in every path', () => {
  it('is never written during a full migration', () => {
    const { store } = fullCommit();
    expect(store.writes).not.toContain(SOURCE_KEY);
    expect(store.removals).not.toContain(SOURCE_KEY);
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });

  it('is left intact even when the source is unreadable', () => {
    const store = fakeStorage({ [SOURCE_KEY]: '{not json' });
    const preview = previewMigration(store, opts);
    const outcome = commitMigration(store, preview, {
      generatedAt: NOW.toISOString(), sourceChecksum: preview.source!.checksum,
      entryCount: 0, backupChecksum: 'x',
    }, { confirmed: true, now: NOW });
    expect(outcome.ok).toBe(false);
    expect(store.getItem(SOURCE_KEY)).toBe('{not json');
    const quarantined = [...store.raw.keys()].find((k) => k.startsWith(QUARANTINE_PREFIX));
    expect(store.getItem(quarantined!)).toBe('{not json');
  });

  it('throws if anything ever tries to write it', () => {
    const store = withLegacy();
    expect(() => store.setItem(SOURCE_KEY, 'x')).toThrow(LegacyKeyWriteError);
    expect(() => store.removeItem(SOURCE_KEY)).toThrow(LegacyKeyWriteError);
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });
});

describe('quota failure leaves everything as it was', () => {
  it('stops at the pre-flight probe', () => {
    const store = withLegacy();
    store.failOn((k) => k === '__dpc_mp_quota_probe__');
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    expect(outcome.ok === false && outcome.stage).toBe('quota');
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
    expect(store.getItem(IN_PROGRESS_KEY)).toBeNull();
  });

  it('reports the probe result on its own', () => {
    const store = withLegacy();
    store.failOn((k) => k === '__dpc_mp_quota_probe__');
    expect(probeQuota(store, 1000).ok).toBe(false);
    expect(probeQuota(store, 1000).ok).toBe(true);
  });

  it('rolls the staging back when the destination write fails', () => {
    const store = withLegacy();
    store.failOn((k) => k === DESTINATION_KEY);
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    expect(outcome.ok === false && outcome.stage).toBe('destination');
    expect(outcome.ok === false && outcome.rolledBack).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
    expect(store.getItem(IN_PROGRESS_KEY)).toBeNull();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
    expect([...store.raw.keys()].filter((k) => k.startsWith(SNAPSHOT_PREFIX))).toEqual([]);
  });

  it('restores an existing destination when the write fails', () => {
    const existing = JSON.stringify({ schemaVersion: 4, entries: [], meta: { createdAt: 'x' } });
    const store = fakeStorage({ [SOURCE_KEY]: LEGACY, [DESTINATION_KEY]: existing });
    store.failOn((k) => k === DESTINATION_KEY);
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    expect(store.getItem(DESTINATION_KEY)).toBe(existing);
  });

  it('can migrate without a snapshot when space is short', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, {
      confirmed: true, now: NOW, skipSnapshot: true,
    });
    expect(outcome.ok).toBe(true);
    expect([...store.raw.keys()].filter((k) => k.startsWith(SNAPSHOT_PREFIX))).toEqual([]);
    // The source is untouched, so it is still the rollback of last resort.
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });
});

describe('an interrupted migration is recognised and finished', () => {
  function interrupt() {
    const store = withLegacy();
    store.failOn((k) => k === RECEIPT_KEY);
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    return { store, outcome };
  }

  it('leaves the data in but unrecorded when the receipt fails', () => {
    const { store, outcome } = interrupt();
    expect(outcome.ok === false && outcome.stage).toBe('receipt');
    expect(store.getItem(DESTINATION_KEY)).toBeTruthy();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
    expect(store.getItem(IN_PROGRESS_KEY)).toBeTruthy();
  });

  it('is reported as interrupted, not as finished', () => {
    const { store } = interrupt();
    const state = inspectRecovery(store);
    expect(state.kind).toBe('interrupted');
    expect(state.kind === 'interrupted' && state.marker.sourceKey).toBe(SOURCE_KEY);
  });

  it('converges when it is run again', () => {
    const { store } = interrupt();
    const before = store.getItem(DESTINATION_KEY);
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    const second = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
    expect(second.ok).toBe(true);
    const after = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(after.entries).toHaveLength(JSON.parse(before!).entries.length);
    expect(inspectRecovery(store).kind).toBe('finished');
  });

  it('tidies a stale marker sitting beside a matching receipt', () => {
    const { store } = fullCommit();
    store.setItem(IN_PROGRESS_KEY, JSON.stringify({
      startedAt: NOW.toISOString(), sourceKey: SOURCE_KEY,
      sourceChecksum: JSON.parse(store.getItem(RECEIPT_KEY)!).sourceChecksum,
      destinationBefore: null,
    }));
    expect(inspectRecovery(store).kind).toBe('finished');
    expect(store.getItem(IN_PROGRESS_KEY)).toBeNull();
  });
});

describe('running it again reaches the same place', () => {
  it('is identical after three further migrations', () => {
    const { store } = fullCommit();
    const first = store.getItem(DESTINATION_KEY);
    const strip = (raw: string) => {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed.entries.map((e: Entry) => ({ ...e, updatedAt: '' })));
    };
    for (let run = 0; run < 3; run += 1) {
      const preview = previewMigration(store, opts);
      const backup = generateBackup(preview, NOW);
      const outcome = commitMigration(store, preview, backup.evidence, { confirmed: true, now: NOW });
      expect(outcome.ok).toBe(true);
    }
    expect(strip(store.getItem(DESTINATION_KEY)!)).toBe(strip(first!));
  });

  it('notices the second time that this source is already migrated', () => {
    const { store } = fullCommit();
    expect(previewMigration(store, opts).alreadyMigrated).toBe(true);
  });

  it('does not duplicate entries', () => {
    const { store } = fullCommit();
    const count = () => JSON.parse(store.getItem(DESTINATION_KEY)!).entries.length;
    const before = count();
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    expect(count()).toBe(before);
  });
});

describe('what is already in the destination is not silently overwritten', () => {
  const mine: Entry = {
    ...EMPTY_CONTENT,
    id: 'mine', keyType: 'psalter', hour: 'morning',
    season: 'ordinary', psalterWeek: 1, weekday: 1,
    reference: 'Romans 13:11', readingText: 'My own wording.', translation: 'Mine',
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  };
  const withMine = () => fakeStorage({
    [SOURCE_KEY]: LEGACY,
    [DESTINATION_KEY]: JSON.stringify({ schemaVersion: 4, entries: [mine], meta: { createdAt: 'x' } }),
  });

  it('reports the clash before anything is written', () => {
    const preview = previewMigration(withMine(), opts);
    expect(preview.totals.conflicts).toBe(1);
    expect(preview.conflicts[0].sections).toContain('reading');
    expect(preview.records.find((r) => r.status === 'conflict')).toBeDefined();
  });

  it('keeps my wording when the migration runs', () => {
    const store = withMine();
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    const saved = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(saved.entries.find((e: Entry) => e.id === 'mine').readingText).toBe('My own wording.');
  });

  it('still brings in the records that do not clash', () => {
    const store = withMine();
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    const saved = JSON.parse(store.getItem(DESTINATION_KEY)!);
    expect(saved.entries.map((e: Entry) => e.id)).toContain('l2');
    expect(saved.entries.map((e: Entry) => e.id)).toContain('l3');
  });
});

describe('rollback', () => {
  it('puts an absent destination back to absent', () => {
    const { store } = fullCommit();
    expect(store.getItem(DESTINATION_KEY)).toBeTruthy();
    expect(rollbackMigration(store).ok).toBe(true);
    expect(store.getItem(DESTINATION_KEY)).toBeNull();
    expect(store.getItem(RECEIPT_KEY)).toBeNull();
  });

  it('leaves the legacy material untouched, so nothing is lost', () => {
    const { store } = fullCommit();
    rollbackMigration(store);
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });

  it('restores what the destination held before', () => {
    const existing = JSON.stringify({ schemaVersion: 4, entries: [], meta: { createdAt: 'before' } });
    const store = fakeStorage({ [SOURCE_KEY]: LEGACY, [DESTINATION_KEY]: existing });
    const preview = previewMigration(store, opts);
    commitMigration(store, preview, generateBackup(preview, NOW).evidence, { confirmed: true, now: NOW });
    expect(store.getItem(DESTINATION_KEY)).not.toBe(existing);
    // The marker is cleared on success, so rollback falls back to removal;
    // the exported backup and the untouched source remain the safety net.
    expect(rollbackMigration(store).ok).toBe(true);
    expect(store.getItem(SOURCE_KEY)).toBe(LEGACY);
  });
});

describe('the backup that commit demands', () => {
  it('describes the source it was taken from', () => {
    const store = withLegacy();
    const preview = previewMigration(store, opts);
    const backup = generateBackup(preview, NOW);
    expect(backup.evidence.sourceChecksum).toBe(preview.source!.checksum);
    expect(backup.evidence.entryCount).toBe(preview.entries.length);
    expect(backup.filename).toContain('2027-06-15');
  });

  it('is exported at schema 4 and holds the migrated wording', () => {
    const store = withLegacy();
    const backup = generateBackup(previewMigration(store, opts), NOW);
    expect(backup.file.schemaVersion).toBe(4);
    expect(backup.json).toContain('It is now the hour.');
  });
});

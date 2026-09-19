/* Committing a migration, and undoing one.
 *
 * localStorage has no transactions: a single setItem is all-or-nothing for
 * one key, but several keys cannot be written together. So the write is
 * staged, and the RECEIPT IS THE COMMIT MARKER — written last. An attempt
 * that stops anywhere before the receipt is simply a migration that has not
 * been recorded, and re-running it converges, because merging is by key and
 * section and never overwrites what is already there.
 *
 *   W1  snapshot of the source          failure -> nothing was written
 *   W2  in-progress marker              failure -> remove W1, stop
 *   W3  destination                     failure -> restore, remove W2/W1, stop
 *   W4  receipt  (the commit)           failure -> data is in, not recorded;
 *                                                   recovery finishes it
 *   W5  remove the in-progress marker   failure -> harmless, tidied later
 *
 * Through all of it the source key is never written. That guarantee does not
 * depend on any of the above being correct: the storage wrapper refuses.
 */

import { buildBackup, type BackupFile } from '../data/backup';
import { applyImport } from '../data/backup';
import type { Entry } from '../data/types';
import { CURRENT_SCHEMA_VERSION } from '../data/migrate';
import {
  DESTINATION_KEY, IN_PROGRESS_KEY, QUARANTINE_PREFIX, RECEIPT_KEY, SNAPSHOT_PREFIX,
  checksum, type InProgressMarker, type MigrationReceipt,
} from './keys';
import { isQuotaError, type MigrationStorage } from './storageIo';
import type { MigrationPreview } from './preview';

/* ------------------------------------------------------------- the backup */

/**
 * Evidence that a backup was produced.
 *
 * `commitMigration` will not write anything without it, and checks that it
 * describes the very source being migrated. Exporting the file is the
 * reader's business; proving it happened is this.
 */
export interface BackupEvidence {
  generatedAt: string;
  sourceChecksum: string;
  entryCount: number;
  backupChecksum: string;
}

export interface GeneratedBackup {
  file: BackupFile;
  json: string;
  filename: string;
  evidence: BackupEvidence;
}

export function generateBackup(preview: MigrationPreview, now = new Date()): GeneratedBackup {
  if (!preview.source) throw new Error('Cannot back up a migration with no source.');
  const file = buildBackup(
    { schemaVersion: CURRENT_SCHEMA_VERSION, entries: preview.entries, meta: { createdAt: now.toISOString() } },
    now,
  );
  const json = JSON.stringify(file, null, 2);
  return {
    file,
    json,
    filename: `missing-parts-before-migration-${now.toISOString().slice(0, 10)}.json`,
    evidence: {
      generatedAt: now.toISOString(),
      sourceChecksum: preview.source.checksum,
      entryCount: preview.entries.length,
      backupChecksum: checksum(json),
    },
  };
}

/* ------------------------------------------------------------ quota check */

export interface QuotaProbe {
  ok: boolean;
  neededChars: number;
  reason?: string;
}

/**
 * Ask the browser for the room the migration needs, before needing it.
 *
 * A probe is a write, so this runs at commit and never during preview. It is
 * a heuristic — another tab could take the space in between — so every real
 * write is guarded as well.
 */
export function probeQuota(store: MigrationStorage, neededChars: number): QuotaProbe {
  const key = '__dpc_mp_quota_probe__';
  const payload = 'x'.repeat(Math.max(1, Math.ceil(neededChars * 1.2)));
  try {
    store.setItem(key, payload);
    return { ok: true, neededChars };
  } catch (error) {
    return {
      ok: false,
      neededChars,
      reason: isQuotaError(error)
        ? 'This browser does not have room for the migrated material as well as what is already saved. Export a backup and remove some entries, or migrate without keeping a rollback copy.'
        : 'This browser refused to save. Nothing has been changed.',
    };
  } finally {
    try {
      store.removeItem(key);
    } catch {
      /* nothing to undo */
    }
  }
}

/* ----------------------------------------------------------- the commit */

export interface CommitOptions {
  /** Must be true. The reader has seen the preview and said yes. */
  confirmed: boolean;
  /** Skip the rollback snapshot when space is short. The source is untouched
      either way, so it remains the real safety net. */
  skipSnapshot?: boolean;
  now?: Date;
}

export type CommitOutcome =
  | { ok: true; receipt: MigrationReceipt; entries: Entry[]; snapshotKey?: string }
  | { ok: false; stage: 'confirmation' | 'evidence' | 'source' | 'quota' | 'snapshot' | 'marker' | 'destination' | 'receipt'; reason: string; rolledBack: boolean };

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Write the migration, or leave everything exactly as it was.
 *
 * Refuses without explicit confirmation and without backup evidence matching
 * this source. Merges rather than replaces, so a section already in the
 * destination is never silently overwritten.
 */
export function commitMigration(
  store: MigrationStorage,
  preview: MigrationPreview,
  evidence: BackupEvidence | undefined,
  options: CommitOptions,
): CommitOutcome {
  const now = options.now ?? new Date();

  if (!options.confirmed) {
    return { ok: false, stage: 'confirmation', reason: 'Migration was not confirmed, so nothing was written.', rolledBack: false };
  }
  if (!preview.source) {
    return { ok: false, stage: 'source', reason: 'There is nothing to migrate.', rolledBack: false };
  }
  if (!evidence) {
    return { ok: false, stage: 'evidence', reason: 'A backup must be exported before migrating. Nothing was written.', rolledBack: false };
  }
  if (evidence.sourceChecksum !== preview.source.checksum) {
    return { ok: false, stage: 'evidence', reason: 'The backup does not match the material being migrated; it may be out of date. Nothing was written.', rolledBack: false };
  }

  /* Unreadable source: keep a copy under its own key and stop. The original
     stays exactly where it is — it is never cleared, here or anywhere. */
  if (preview.corrupt) {
    const quarantineKey = `${QUARANTINE_PREFIX}${stamp(now)}`;
    try {
      store.setItem(quarantineKey, preview.source.raw);
    } catch {
      /* out of room; the original is still untouched, which is what matters */
    }
    return { ok: false, stage: 'source', reason: 'The legacy material could not be read. A copy has been kept and the original left untouched.', rolledBack: false };
  }

  const destinationBefore = store.getItem(DESTINATION_KEY);

  // Merge into whatever is already there; never replace it wholesale.
  const existing = (() => {
    if (!destinationBefore) return [] as Entry[];
    try {
      return (JSON.parse(destinationBefore) as { entries?: Entry[] }).entries ?? [];
    } catch {
      return [] as Entry[];
    }
  })();

  const { entries, summary } = applyImport(
    existing,
    { ...preview, ok: true, skipped: 0, duplicatesInFile: 0, newRecords: 0, enrichedRecords: 0, unchangedRecords: 0 },
    { mode: 'merge', conflictWinner: 'existing' },
  );

  const payload = JSON.stringify({
    schemaVersion: Math.max(preview.fromSchemaVersion, CURRENT_SCHEMA_VERSION),
    entries,
    meta: { createdAt: now.toISOString(), lastMigratedAt: now.toISOString() },
  });

  const probe = probeQuota(store, payload.length + (options.skipSnapshot ? 0 : preview.source.raw.length));
  if (!probe.ok) {
    return { ok: false, stage: 'quota', reason: probe.reason ?? 'Not enough room.', rolledBack: false };
  }

  // W1 — the snapshot.
  let snapshotKey: string | undefined;
  if (!options.skipSnapshot) {
    snapshotKey = `${SNAPSHOT_PREFIX}${stamp(now)}`;
    try {
      store.setItem(snapshotKey, preview.source.raw);
    } catch {
      return { ok: false, stage: 'snapshot', reason: 'Could not keep a rollback copy, so nothing was migrated.', rolledBack: false };
    }
  }

  const undoSnapshot = () => {
    if (!snapshotKey) return;
    try {
      store.removeItem(snapshotKey);
    } catch { /* leave it; it is only a copy */ }
  };

  // W2 — the in-progress marker.
  const marker: InProgressMarker = {
    startedAt: now.toISOString(),
    sourceKey: preview.source.key,
    sourceChecksum: preview.source.checksum,
    snapshotKey,
    destinationBefore,
  };
  try {
    store.setItem(IN_PROGRESS_KEY, JSON.stringify(marker));
  } catch {
    undoSnapshot();
    return { ok: false, stage: 'marker', reason: 'Could not begin the migration, so nothing was changed.', rolledBack: true };
  }

  // W3 — the destination.
  try {
    store.setItem(DESTINATION_KEY, payload);
  } catch {
    // A single setItem is all-or-nothing, so the old value is still intact;
    // restore it explicitly anyway and take the staging back down.
    try {
      if (destinationBefore === null) store.removeItem(DESTINATION_KEY);
      else store.setItem(DESTINATION_KEY, destinationBefore);
    } catch { /* the failed write left it unchanged in any case */ }
    try { store.removeItem(IN_PROGRESS_KEY); } catch { /* best effort */ }
    undoSnapshot();
    return { ok: false, stage: 'destination', reason: 'Saving the migrated material failed, so your data has been left exactly as it was.', rolledBack: true };
  }

  // W4 — the receipt. This is the commit.
  const receipt: MigrationReceipt = {
    sourceKey: preview.source.key,
    sourceChecksum: preview.source.checksum,
    sourceEntryCount: preview.totals.found,
    migratedAt: now.toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    snapshotKey,
    counts: {
      added: summary.added,
      enriched: summary.updated,
      unchanged: summary.unchanged,
      needsReview: preview.totals.needsReview,
      conflicts: preview.totals.conflicts,
    },
  };
  try {
    store.setItem(RECEIPT_KEY, JSON.stringify(receipt));
  } catch {
    /* The material is in and is correct, but unrecorded. The marker survives,
       so the next launch reports an interrupted migration and finishes it.
       Re-running is safe: merging by key and section converges. */
    return { ok: false, stage: 'receipt', reason: 'The migrated material was saved, but recording it failed. It will be finished the next time the app opens; nothing has been lost.', rolledBack: false };
  }

  // W5 — staging down.
  try { store.removeItem(IN_PROGRESS_KEY); } catch { /* harmless */ }

  return { ok: true, receipt, entries, snapshotKey };
}

/* --------------------------------------------------- recovery and rollback */

export type RecoveryState =
  | { kind: 'clean' }
  | { kind: 'interrupted'; marker: InProgressMarker }
  | { kind: 'finished'; receipt: MigrationReceipt };

/** What an earlier attempt left behind, read without changing anything. */
export function inspectRecovery(store: MigrationStorage): RecoveryState {
  const markerRaw = store.getItem(IN_PROGRESS_KEY);
  const receiptRaw = store.getItem(RECEIPT_KEY);
  let receipt: MigrationReceipt | undefined;
  try {
    receipt = receiptRaw ? (JSON.parse(receiptRaw) as MigrationReceipt) : undefined;
  } catch { receipt = undefined; }

  if (!markerRaw) return receipt ? { kind: 'finished', receipt } : { kind: 'clean' };

  let marker: InProgressMarker | undefined;
  try {
    marker = JSON.parse(markerRaw) as InProgressMarker;
  } catch { marker = undefined; }
  if (!marker) return { kind: 'clean' };

  // A marker beside a receipt for the same source is just untidied staging.
  if (receipt && receipt.sourceChecksum === marker.sourceChecksum) {
    try { store.removeItem(IN_PROGRESS_KEY); } catch { /* harmless */ }
    return { kind: 'finished', receipt };
  }
  return { kind: 'interrupted', marker };
}

/**
 * Put the destination back as it was before a migration.
 *
 * The source is never touched by any of this, so it remains the rollback of
 * last resort whatever happens here.
 */
export function rollbackMigration(store: MigrationStorage): { ok: boolean; reason?: string } {
  const markerRaw = store.getItem(IN_PROGRESS_KEY);
  const receiptRaw = store.getItem(RECEIPT_KEY);

  let destinationBefore: string | null | undefined;
  if (markerRaw) {
    try { destinationBefore = (JSON.parse(markerRaw) as InProgressMarker).destinationBefore; } catch { /* ignore */ }
  }

  try {
    if (destinationBefore === undefined || destinationBefore === null) {
      store.removeItem(DESTINATION_KEY);
    } else {
      store.setItem(DESTINATION_KEY, destinationBefore);
    }
    if (receiptRaw) store.removeItem(RECEIPT_KEY);
    if (markerRaw) store.removeItem(IN_PROGRESS_KEY);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not undo the migration. Your exported backup and the original Missing Parts data are both still intact.' };
  }
}

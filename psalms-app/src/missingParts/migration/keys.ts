/* The keys migration reads and writes, and the shape of what it records.
 *
 * Four keys, one purpose each. The legacy key is not among the ones written:
 * it appears here only so the source of a migration can be named.
 */

import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../data/storage';

export const DESTINATION_KEY = STORAGE_KEY;
export const SOURCE_KEY = LEGACY_STORAGE_KEY;

/** Records that a migration finished. Written last: it is the commit marker. */
export const RECEIPT_KEY = 'dpc.missing-parts.migration';

/** Written before the destination, removed after the receipt. */
export const IN_PROGRESS_KEY = 'dpc.missing-parts.inprogress';

/** Prefix for the copy of the SOURCE taken before migrating. */
export const SNAPSHOT_PREFIX = 'dpc.missing-parts.preimport-';

/* Prefix for the copy of the DESTINATION as it stood before migrating.
 *
 * This is what makes rollback exact rather than approximate. It is keyed by
 * the migration's own id, retained after a successful commit, and deleted
 * only once a rollback has succeeded or the reader discards it. It is never
 * written under the legacy source key — the storage wrapper would refuse. */
export const ROLLBACK_PREFIX = 'dpc.missing-parts.rollback-';

/** A unique id for one migration attempt. */
export function newMigrationId(now = new Date()): string {
  const stamp = now.getTime().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `m_${stamp}_${random}`;
}

/** Prefix for text that could not be parsed. Never overwrites its source. */
export const QUARANTINE_PREFIX = 'dpc.missing-parts.unreadable-';

export interface MigrationReceipt {
  /** Unique to this migration attempt; names its rollback snapshot. */
  migrationId: string;
  sourceKey: string;
  /** Checksum of the exact source text, so a re-run recognises the same data. */
  sourceChecksum: string;
  sourceEntryCount: number;
  /** When the migration was committed. */
  committedAt: string;
  schemaVersion: number;
  /** Copy of the source, for reference. */
  snapshotKey?: string;
  /* Everything rollback needs to put the destination back exactly. */
  destinationExisted: boolean;
  /** Absent when the destination did not exist: there is nothing to restore. */
  rollbackSnapshotKey?: string;
  rollbackSnapshotChecksum?: string;
  /** Checksum of what was written, so a later change is detectable. */
  committedDestinationChecksum: string;
  /** Set once the migration has been undone. */
  rolledBackAt?: string;
  counts: {
    added: number;
    enriched: number;
    unchanged: number;
    needsReview: number;
    conflicts: number;
  };
}

export interface InProgressMarker {
  migrationId: string;
  startedAt: string;
  sourceKey: string;
  sourceChecksum: string;
  snapshotKey?: string;
  destinationExisted: boolean;
  /** Where the destination's previous value is kept, if it had one. */
  rollbackSnapshotKey?: string;
  rollbackSnapshotChecksum?: string;
}

/** A stable checksum of a stored string. Length and hash, so truncation shows. */
export function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${value.length}:${hash.toString(16).padStart(8, '0')}`;
}

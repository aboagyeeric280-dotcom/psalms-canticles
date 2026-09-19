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

/** Prefix for the copy of the source taken before migrating. */
export const SNAPSHOT_PREFIX = 'dpc.missing-parts.preimport-';

/** Prefix for text that could not be parsed. Never overwrites its source. */
export const QUARANTINE_PREFIX = 'dpc.missing-parts.unreadable-';

export interface MigrationReceipt {
  sourceKey: string;
  /** Checksum of the exact source text, so a re-run recognises the same data. */
  sourceChecksum: string;
  sourceEntryCount: number;
  migratedAt: string;
  schemaVersion: number;
  snapshotKey?: string;
  counts: {
    added: number;
    enriched: number;
    unchanged: number;
    needsReview: number;
    conflicts: number;
  };
}

export interface InProgressMarker {
  startedAt: string;
  sourceKey: string;
  sourceChecksum: string;
  snapshotKey?: string;
  /** The destination's value before the attempt, so it can be put back. */
  destinationBefore: string | null;
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

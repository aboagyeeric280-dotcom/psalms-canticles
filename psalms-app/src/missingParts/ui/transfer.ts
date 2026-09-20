/* ───────────────────────────────────────────────────────────────────────────
 * Bringing material across from the separate Missing Parts app.
 *
 * This is the ONLY module in the interface permitted to reach the migration
 * engine, and it is deliberately thin: it opens a reader's storage, asks the
 * engine what migrating would do, and hands the answer to a screen. Every
 * decision that matters — whether a source is readable, whether a backup
 * matches it, whether a commit may proceed, how conflicts are settled — is
 * the engine's, made in code that was tested long before this screen existed.
 *
 * Two things this module must never do, and which its tests assert:
 *   - write the legacy key, or remove it (the engine's guard refuses anyway);
 *   - write anything at all while merely opening or previewing.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { buildBackup } from '../data/backup';
import { CURRENT_SCHEMA_VERSION } from '../data/migrate';
import type { Entry } from '../data/types';
import { checksum, SOURCE_KEY } from '../migration/keys';
import {
  commitMigration, generateBackup,
  type BackupEvidence, type CommitOutcome, type GeneratedBackup,
} from '../migration/commit';
import {
  detectLegacyData, previewMigration,
  type MigrationPreview, type MigrationSource, type PreviewOptions,
} from '../migration/preview';
import { browserStorage, type MigrationStorage } from '../migration/storageIo';

export type { BackupEvidence, CommitOutcome, MigrationPreview, MigrationSource, MigrationStorage };
export { browserStorage, commitMigration };

/** Where the material being looked at came from. */
export type SourceOrigin = 'legacy-key' | 'chosen-file';

/**
 * The five numbers the screen reports, and nothing else.
 *
 * Read off the engine's own totals rather than recounted here, so the screen
 * and the migration can never disagree about what is about to happen.
 */
export interface TransferSummary {
  sourceRecords: number;
  needsReview: number;
  conflicts: number;
  /** Keys that match no day in the window, plus dates already gone by. */
  unresolved: number;
  /** Anything that stops the migration outright. Empty means it may proceed. */
  blocking: string[];
}

export function summarise(preview: MigrationPreview): TransferSummary {
  const blocking: string[] = [];

  if (preview.corrupt) {
    blocking.push(
      'This material could not be read. It has been left exactly where it is; '
      + 'nothing will be migrated from it.',
    );
  }
  if (preview.futureSchema) {
    blocking.push(
      `This material was written by a newer version of the app (schema ${preview.fromSchemaVersion}). `
      + 'Migrating it would mean guessing at parts of it, so it is left untouched. '
      + 'Update the app, or move it across by hand.',
    );
  }
  for (const error of preview.errors) blocking.push(error);

  return {
    sourceRecords: preview.totals.found,
    needsReview: preview.totals.needsReview,
    conflicts: preview.totals.conflicts,
    unresolved: preview.totals.wouldNotResolve + preview.totals.pastDates,
    blocking,
  };
}

/* ─────────────────────────────────────────────────────────── looking only */

/**
 * A view of a reader's storage in which the legacy key reads as `raw`.
 *
 * This is how a hand-picked file is previewed and migrated without being
 * written anywhere first: the engine goes on believing it is reading the
 * legacy key, and the real legacy key — if there even is one — is not
 * consulted, not altered, and not removed. Writes pass through to the real
 * store, where the engine's own guard still refuses the legacy key.
 */
export function overlaySource(store: MigrationStorage, raw: string): MigrationStorage {
  return {
    getItem: (key) => (key === SOURCE_KEY ? raw : store.getItem(key)),
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
    keys: () => [...new Set([...store.keys(), SOURCE_KEY])],
  };
}

export interface OpenedTransfer {
  origin: SourceOrigin;
  preview: MigrationPreview;
  summary: TransferSummary;
}

/**
 * What is here to migrate, if anything. Writes nothing.
 *
 * Detection happens when the screen is opened and at no other time: nothing
 * in this feature looks for legacy material on startup, and nothing migrates
 * without a reader standing in front of it saying so.
 */
export function openTransfer(
  store: MigrationStorage,
  options: PreviewOptions = {},
): OpenedTransfer | null {
  if (!detectLegacyData(store)) return null;
  const preview = previewMigration(store, options);
  return { origin: 'legacy-key', preview, summary: summarise(preview) };
}

/** The same, for a file the reader picked by hand. Also writes nothing. */
export function openChosenFile(
  store: MigrationStorage,
  raw: string,
  options: PreviewOptions = {},
): OpenedTransfer {
  const preview = previewMigration(overlaySource(store, raw), options);
  return { origin: 'chosen-file', preview, summary: summarise(preview) };
}

/* ───────────────────────────────────────────────────────────── the backups */

/**
 * A verbatim copy of the legacy material, byte for byte.
 *
 * The engine backs a source up verbatim when it cannot understand it, and
 * normalises it otherwise. Here the raw bytes are always what is offered,
 * because this is the copy a reader keeps in case the migration goes wrong,
 * and a backup of a reinterpretation is not a backup. The evidence carries
 * the SOURCE checksum the engine will insist on matching, so a backup taken
 * of one thing cannot unlock a migration of another.
 */
export function rawLegacyBackup(preview: MigrationPreview, now = new Date()): GeneratedBackup {
  if (!preview.source) throw new Error('There is nothing to back up.');

  /* An unreadable or future-schema source is the engine's own verbatim case,
     so let it build that one and keep its wording. */
  if (preview.corrupt || preview.futureSchema) return generateBackup(preview, now);

  const json = preview.source.raw;
  return {
    file: {
      app: 'verbatim-copy',
      schemaVersion: preview.fromSchemaVersion,
      exportedAt: now.toISOString(),
      entryCount: preview.totals.found,
      entries: [],
    },
    json,
    filename: `missing-parts-legacy-raw-${now.toISOString().slice(0, 10)}.json`,
    evidence: {
      generatedAt: now.toISOString(),
      sourceChecksum: preview.source.checksum,
      entryCount: preview.totals.found,
      backupChecksum: checksum(json),
      verbatim: true,
    },
  };
}

/** The reader's current, integrated material as schema-4 JSON. */
export function exportCurrent(entries: Entry[], now = new Date()): {
  json: string;
  filename: string;
} {
  const file = buildBackup(
    { schemaVersion: CURRENT_SCHEMA_VERSION, entries, meta: { createdAt: now.toISOString() } },
    now,
  );
  return {
    json: JSON.stringify(file, null, 2),
    filename: `missing-parts-${now.toISOString().slice(0, 10)}.json`,
  };
}

/* ────────────────────────────────────────────────────────────── the result */

export interface TransferResult {
  imported: number;
  enriched: number;
  conflicts: number;
  needsReview: number;
}

export function resultOf(outcome: CommitOutcome): TransferResult | null {
  if (!outcome.ok) return null;
  const { added, enriched, conflicts, needsReview } = outcome.receipt.counts;
  return { imported: added, enriched, conflicts, needsReview };
}

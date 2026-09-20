/* Exporting what is here, and bringing across what is not.
 *
 * Deliberately a narrow screen. It exports the reader's current material,
 * looks — once, when it opens — for material left by the separate Missing
 * Parts app, shows exactly what migrating would do, and refuses to do it
 * until a backup has been taken and the reader has said yes in so many
 * words. Every judgement is the engine's; this only asks and reports.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { announce } from './announce';
import { useAppState } from '../state/useAppState';
import { reloadFromStorage } from '../state/store';
import {
  browserStorage, commitMigration, exportCurrent, openChosenFile, openTransfer,
  overlaySource, rawLegacyBackup, resultOf,
  type BackupEvidence, type MigrationStorage, type OpenedTransfer, type TransferResult,
} from './transfer';

interface Props {
  onGo: (route: string) => void;
}

/** Hand a file to the browser to save. Nothing leaves the device. */
function download(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

type Phase = 'looking' | 'none' | 'found' | 'done';

export default function BackupScreen({ onGo }: Props) {
  const { file } = useAppState();
  const entries = file.entries;
  const store = useRef<MigrationStorage | null>(null);
  if (store.current === null) store.current = browserStorage();

  const [phase, setPhase] = useState<Phase>('looking');
  const [opened, setOpened] = useState<OpenedTransfer | null>(null);
  const [evidence, setEvidence] = useState<BackupEvidence | undefined>();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransferResult | null>(null);

  /* Detection happens here and nowhere else: opening this screen is the only
     thing in the app that ever looks at the legacy key. It reads; it does not
     write, and it does not remove. */
  useEffect(() => {
    const current = store.current;
    if (!current) { setPhase('none'); return; }
    const found = openTransfer(current);
    setOpened(found);
    setPhase(found ? 'found' : 'none');
  }, []);

  /* A new source invalidates any backup taken of the old one. The engine
     would refuse the mismatch anyway; clearing it here means the screen never
     shows a tick against material the tick was not earned on. */
  const adopt = useCallback((next: OpenedTransfer | null) => {
    setOpened(next);
    setEvidence(undefined);
    setConfirmed(false);
    setError(null);
    setPhase(next ? 'found' : 'none');
  }, []);

  const onExport = () => {
    const { json, filename } = exportCurrent(entries);
    announce(download(filename, json)
      ? 'Your material has been exported.'
      : 'This browser would not save the file.');
  };

  const onChooseFile = async (file: File | undefined) => {
    if (!file) return;
    const current = store.current;
    if (!current) return;
    try {
      adopt(openChosenFile(current, await file.text()));
      announce('That file has been read. Nothing has been changed.');
    } catch {
      setError('That file could not be read.');
    }
  };

  const onBackup = () => {
    if (!opened) return;
    const backup = rawLegacyBackup(opened.preview);
    if (!download(backup.filename, backup.json)) {
      setError('This browser would not save the backup, so nothing has been migrated.');
      return;
    }
    setEvidence(backup.evidence);
    announce('The backup has been saved. You may now bring the material across.');
  };

  const onMigrate = () => {
    const current = store.current;
    if (!current || !opened) return;
    const target = opened.origin === 'chosen-file' && opened.preview.source
      ? overlaySource(current, opened.preview.source.raw)
      : current;

    const outcome = commitMigration(target, opened.preview, evidence, { confirmed });
    if (!outcome.ok) {
      setError(outcome.reason);
      announce('Nothing was migrated.');
      return;
    }
    reloadFromStorage();
    setResult(resultOf(outcome));
    setPhase('done');
    announce('The material has been brought across.');
  };

  const summary = opened?.summary;
  const blocked = (summary?.blocking.length ?? 0) > 0;
  const ready = Boolean(evidence) && confirmed && !blocked;

  return (
    <section className="mp-transfer" aria-labelledby="mp-transfer-heading">
      <h2 id="mp-transfer-heading" className="sr">Backup and transfer</h2>

      <h3 className="mp-transfer__title">Export what you have</h3>
      <p className="mp-hint">
        Everything you have written, as a file on this device. It is not sent
        anywhere — there is nowhere for it to be sent.
      </p>
      <p>
        <button type="button" className="btn mp-touch" onClick={onExport}>
          Export {entries.length} record{entries.length === 1 ? '' : 's'}
        </button>
      </p>

      <hr className="mp-rule" />

      <h3 className="mp-transfer__title">Material from the older app</h3>

      {phase === 'looking' ? <p className="mp-hint">Looking…</p> : null}

      {phase === 'none' ? (
        <>
          <p className="mp-hint">
            Nothing from the older Missing Parts app was found on this device.
            If you have a backup file from it, you can open that instead.
          </p>
          <p>
            <label className="btn btn--ghost mp-touch mp-file">
              Choose a backup file
              <input
                type="file" accept="application/json,.json" className="sr"
                onChange={(event) => { void onChooseFile(event.target.files?.[0]); }}
              />
            </label>
          </p>
        </>
      ) : null}

      {phase === 'found' && summary ? (
        <>
          <p className="mp-hint">
            {opened?.origin === 'chosen-file'
              ? 'Read from the file you chose. Nothing has been changed yet.'
              : 'Found on this device. Nothing has been changed yet.'}
          </p>

          <dl className="mp-totals" aria-label="What migrating would do">
            <div><dt>Records found</dt><dd>{summary.sourceRecords}</dd></div>
            <div><dt>Would want review</dt><dd>{summary.needsReview}</dd></div>
            <div><dt>Conflicts</dt><dd>{summary.conflicts}</dd></div>
            <div><dt>Match no day</dt><dd>{summary.unresolved}</dd></div>
          </dl>

          {summary.conflicts > 0 ? (
            <p className="mp-review" role="note">
              Where both say something, what you have already written stands.
              Sections you have not written are added. Nothing you wrote is
              overwritten, and nothing is merged into anything else.
            </p>
          ) : null}

          {blocked ? (
            <div role="alert">
              {summary.blocking.map((reason) => (
                <p className="mp-error" key={reason}>{reason}</p>
              ))}
            </div>
          ) : (
            <>
              <ol className="mp-steps">
                <li>
                  <button type="button" className="btn mp-touch" onClick={onBackup}>
                    {evidence ? 'Download the backup again' : 'Download a backup first'}
                  </button>
                  {evidence ? <span className="mp-hint"> Saved. </span> : null}
                </li>
                <li>
                  <label className="mp-confirm">
                    <input
                      type="checkbox" checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    {' '}I have kept the backup, and I want this material brought across.
                  </label>
                </li>
                <li>
                  <button
                    type="button" className="btn btn--primary mp-touch"
                    disabled={!ready} onClick={onMigrate}
                  >
                    Bring it across
                  </button>
                  {!ready ? (
                    <span className="mp-hint">
                      {' '}Download the backup and tick the box first.
                    </span>
                  ) : null}
                </li>
              </ol>
              <p className="mp-hint">
                The older app’s own copy is never changed or removed, whatever
                happens here.
              </p>
            </>
          )}
        </>
      ) : null}

      {phase === 'done' && result ? (
        <div role="status">
          <p>
            Brought across: <strong>{result.imported}</strong> added,{' '}
            <strong>{result.enriched}</strong> filled out,{' '}
            <strong>{result.conflicts}</strong> conflict
            {result.conflicts === 1 ? '' : 's'} left as you had them,{' '}
            <strong>{result.needsReview}</strong> wanting review.
          </p>
          <p>
            <button
              type="button" className="btn mp-touch"
              onClick={() => onGo('#/missing/review')}
            >
              Go to Review
            </button>
          </p>
        </div>
      ) : null}

      {error ? <p className="mp-error" role="alert">{error}</p> : null}
    </section>
  );
}

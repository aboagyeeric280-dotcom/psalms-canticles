import { useId, useState } from 'react';
import Sheet from '../../components/Sheet';
import {
  EMPTY_CONTENT, HOUR_META, SECTION_META,
  type Entry, type EntryContent, type SectionId,
} from '../data/types';
import { clearSection, saveSectionOn } from '../state/store';
import { describeKey } from '../data/resolve';
import { announce } from './announce';
import { provenanceOf } from './provenance';

interface Props {
  /** The record itself, picked out of a list — not looked up by key. */
  entry: Entry;
  section: SectionId;
  onClose: () => void;
}

/**
 * Edit one section of one stored record, from the Library or the Review list.
 *
 * The office editor keys its work to the day being prayed. Here the reader has
 * pointed at a particular record, and two records can share a key, so this one
 * works by identity. The scope is shown but not editable: the choices that
 * make a key meaningful — which psalter week, which celebration — come from a
 * liturgical day, and there is none in a list. Changing it is done from the
 * office, which is said here rather than left to be discovered.
 */
export default function EntrySectionSheet({ entry, section, onClose }: Props) {
  const ids = useId();
  const meta = SECTION_META[section];
  const provenance = provenanceOf(entry);

  const [content, setContent] = useState<EntryContent>(() => ({
    ...EMPTY_CONTENT,
    reference: entry.reference,
    readingText: entry.readingText,
    translation: entry.translation,
    responsory: entry.responsory,
    intercessions: entry.intercessions,
    concludingPrayer: entry.concludingPrayer,
  }));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasText = meta.fields.some((field) => String(content[field] ?? '').trim().length > 0);
  const stored = meta.fields.some((field) => String(entry[field] ?? '').trim().length > 0);

  function handleSave() {
    setError(null);
    const result = saveSectionOn(entry.id, section, content);
    if (!result.ok) {
      setError(result.error ?? 'That could not be saved. Nothing has been changed.');
      return;
    }
    announce(`${meta.label} saved for ${describeKey(entry)}.`);
    onClose();
  }

  function handleDelete() {
    setError(null);
    const result = clearSection(entry.id, section);
    if (!result.ok) {
      setError(result.error ?? 'That could not be deleted. Nothing has been changed.');
      setConfirmingDelete(false);
      return;
    }
    announce(`${meta.label} cleared for ${describeKey(entry)}.`);
    onClose();
  }

  return (
    <Sheet title={`${stored ? 'Edit' : 'Add'} the ${meta.label.toLowerCase()}`} onClose={onClose}>
      <p className="mp-hint mp-sheet__context">
        {HOUR_META[entry.hour].description} · {provenance.badge}
      </p>

      {section === 'reading' ? (
        <>
          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-reference`}>Scripture reference</label>
            <input id={`${ids}-reference`} className="mp-input mp-touch" type="text"
              value={content.reference}
              onChange={(e) => setContent({ ...content, reference: e.target.value })} />
          </div>
          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-text`}>The reading</label>
            <textarea id={`${ids}-text`} className="mp-input mp-textarea" rows={8}
              value={content.readingText}
              onChange={(e) => setContent({ ...content, readingText: e.target.value })} />
          </div>
          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-translation`}>Translation</label>
            <input id={`${ids}-translation`} className="mp-input mp-touch" type="text"
              value={content.translation}
              onChange={(e) => setContent({ ...content, translation: e.target.value })} />
          </div>
        </>
      ) : (
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${ids}-body`}>{meta.label}</label>
          <textarea id={`${ids}-body`} className="mp-input mp-textarea" rows={10}
            value={content[meta.fields[0]]}
            onChange={(e) => setContent({ ...content, [meta.fields[0]]: e.target.value })} />
        </div>
      )}

      {error ? <p className="mp-error" role="alert">{error}</p> : null}

      <div className="mp-sheet__confirm">
        <p className="mp-hint"><strong>Saving as:</strong> {provenance.badge}</p>
        <p className="mp-hint">{provenance.detail}</p>
        <p className="mp-hint">
          What this applies to is changed from the office itself, where the day supplies the
          choices. Saving here leaves the key exactly as it is.
        </p>
      </div>

      <div className="mp-sheet__actions">
        <button type="button" className="btn btn--primary mp-touch" onClick={handleSave} disabled={!hasText}>
          Save
        </button>
        <button type="button" className="btn mp-touch" onClick={onClose}>Cancel</button>
        {stored ? (
          <button type="button" className="btn btn--ghost mp-touch mp-delete"
            onClick={() => setConfirmingDelete(true)}>
            Clear this section
          </button>
        ) : null}
      </div>

      {confirmingDelete ? (
        <div className="mp-confirm" role="alertdialog" aria-labelledby={`${ids}-confirm`}>
          <p id={`${ids}-confirm`}>
            Clear the {meta.label.toLowerCase()} from this record? Its other sections are kept.
          </p>
          <div className="mp-sheet__actions">
            <button type="button" className="btn btn--primary mp-touch" onClick={handleDelete}>
              Yes, clear it
            </button>
            <button type="button" className="btn mp-touch" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

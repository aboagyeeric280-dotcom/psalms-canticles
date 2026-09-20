import { useId, useState } from 'react';
import Sheet from '../../components/Sheet';
import {
  EMPTY_CONTENT, HOUR_META, SECTION_META,
  type Entry, type EntryContent, type Hour, type SectionId,
} from '../data/types';
import type { MissingPartsDay } from '../data/day';
import { clearSection, saveSection, type EntryKeyInput } from '../state/store';
import { announce } from './announce';
import KeyScopeChooser, { defaultKeyFor, explainScope, scopeSummary } from './KeyScopeChooser';

interface Props {
  section: SectionId;
  hour: Hour;
  day: MissingPartsDay;
  dayTitle: string;
  /** The record that produced what is on screen, when there is one. */
  existing?: Entry;
  onClose: () => void;
}

/* The fields of one section. Reading keeps its reference and translation
   apart from its text on purpose: the app never guesses a translation, and
   never folds the three together. */
function Fields({
  section, value, onChange, idPrefix,
}: {
  section: SectionId;
  value: EntryContent;
  onChange: (next: EntryContent) => void;
  idPrefix: string;
}) {
  const meta = SECTION_META[section];

  if (section === 'reading') {
    return (
      <>
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${idPrefix}-reference`}>Scripture reference</label>
          <input
            id={`${idPrefix}-reference`} className="mp-input mp-touch" type="text"
            value={value.reference}
            onChange={(event) => onChange({ ...value, reference: event.target.value })}
            placeholder="Romans 13:11b, 12-13a"
          />
        </div>
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${idPrefix}-text`}>The reading</label>
          <textarea
            id={`${idPrefix}-text`} className="mp-input mp-textarea" rows={8}
            value={value.readingText}
            onChange={(event) => onChange({ ...value, readingText: event.target.value })}
            placeholder={meta.placeholder}
          />
        </div>
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${idPrefix}-translation`}>Translation</label>
          <input
            id={`${idPrefix}-translation`} className="mp-input mp-touch" type="text"
            value={value.translation}
            onChange={(event) => onChange({ ...value, translation: event.target.value })}
            placeholder="The version you are reading from"
          />
          <p className="mp-hint">
            Shown with the reading exactly as you write it. The app never assumes a translation.
          </p>
        </div>
      </>
    );
  }

  const field = meta.fields[0];
  return (
    <div className="mp-field">
      <label className="mp-field__label" htmlFor={`${idPrefix}-body`}>{meta.label}</label>
      <textarea
        id={`${idPrefix}-body`} className="mp-input mp-textarea" rows={10}
        value={value[field]}
        onChange={(event) => onChange({ ...value, [field]: event.target.value })}
        placeholder={meta.placeholder}
      />
    </div>
  );
}

export default function SectionEditorSheet({
  section, hour, day, dayTitle, existing, onClose,
}: Props) {
  const ids = useId();
  const meta = SECTION_META[section];

  const [content, setContent] = useState<EntryContent>(() => ({
    ...EMPTY_CONTENT,
    ...(existing
      ? {
        reference: existing.reference,
        readingText: existing.readingText,
        translation: existing.translation,
        responsory: existing.responsory,
        intercessions: existing.intercessions,
        concludingPrayer: existing.concludingPrayer,
      }
      : {}),
  }));

  /* Editing works on the very record that produced what is on screen, so a
     change never quietly becomes a new, more specific record that shadows
     the original. Changing the scope is a separate, deliberate act. */
  const [key, setKey] = useState<EntryKeyInput>(() => (
    existing
      ? {
        keyType: existing.keyType,
        hour: existing.hour,
        season: existing.season,
        psalterWeek: existing.psalterWeek,
        weekday: existing.weekday,
        weekOfSeason: existing.weekOfSeason,
        celebrationId: existing.celebrationId,
        celebrationName: existing.celebrationName,
        celebrationRank: existing.celebrationRank,
        calendarScope: existing.calendarScope,
        celebrationMonth: existing.celebrationMonth,
        celebrationDay: existing.celebrationDay,
        date: existing.date,
      }
      : defaultKeyFor(day, hour, meta.defaultKeyType)
  ));

  const [scopeLocked, setScopeLocked] = useState(Boolean(existing));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasText = meta.fields.some((field) => String(content[field] ?? '').trim().length > 0);

  function handleSave() {
    setError(null);
    /* Stored exactly as typed. No trim, no tidying: what is in the box is
       what is kept, whitespace and all. */
    const result = saveSection(key, section, content);
    if (!result.ok) {
      /* The write failed. Say so, keep the sheet open with the reader's words
         still in it, and announce nothing — a save that did not happen must
         never be reported as one. */
      setError(result.error ?? 'That could not be saved. Nothing has been changed.');
      return;
    }
    announce(`${meta.label} saved for ${HOUR_META[hour].description}, ${dayTitle}.`);
    onClose();
  }

  function handleDelete() {
    if (!existing) return;
    setError(null);
    const result = clearSection(existing.id, section);
    if (!result.ok) {
      setError(result.error ?? 'That could not be deleted. Nothing has been changed.');
      setConfirmingDelete(false);
      return;
    }
    announce(`${meta.label} deleted for ${HOUR_META[hour].description}, ${dayTitle}.`);
    onClose();
  }

  const title = existing ? `Edit the ${meta.label.toLowerCase()}` : `Add the ${meta.label.toLowerCase()}`;

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="mp-hint mp-sheet__context">
        {HOUR_META[hour].description} · {dayTitle}
      </p>

      <Fields section={section} value={content} onChange={setContent} idPrefix={ids} />

      <KeyScopeChooser
        day={day}
        value={key}
        onChange={setKey}
        locked={scopeLocked}
        onUnlock={() => setScopeLocked(false)}
      />

      {error ? <p className="mp-error" role="alert">{error}</p> : null}

      <div className="mp-sheet__confirm" aria-live="polite">
        <p className="mp-hint">
          <strong>Saving as:</strong> {scopeSummary(key)}
        </p>
        <p className="mp-hint">{explainScope(key)}</p>
      </div>

      <div className="mp-sheet__actions">
        <button type="button" className="btn btn--primary mp-touch" onClick={handleSave} disabled={!hasText}>
          Save
        </button>
        <button type="button" className="btn mp-touch" onClick={onClose}>Cancel</button>
        {existing ? (
          <button
            type="button"
            className="btn btn--ghost mp-touch mp-delete"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </button>
        ) : null}
      </div>

      {confirmingDelete ? (
        <div className="mp-confirm" role="alertdialog" aria-labelledby={`${ids}-confirm`}>
          <p id={`${ids}-confirm`}>
            Delete the {meta.label.toLowerCase()} from this record? Its other sections are kept.
          </p>
          <div className="mp-sheet__actions">
            <button type="button" className="btn btn--primary mp-touch" onClick={handleDelete}>
              Yes, delete it
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

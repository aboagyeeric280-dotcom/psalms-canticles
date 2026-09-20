import { useId, useState } from 'react';
import Sheet from '../../components/Sheet';
import {
  EMPTY_CONTENT, HOUR_META, SECTIONS, SECTION_META, SEASON_LABELS,
  sectionHasContent, type EntryContent, type Hour, type Season, type SectionId,
} from '../data/types';
import { ROMAN_WEEK, WEEKDAY_NAMES } from '../data/iso';
import { saveSection, saveSectionOn, type EntryKeyInput } from '../state/store';
import { announce } from './announce';
import type { PsalterSlot } from './selectors';

interface Props {
  slot: PsalterSlot;
  season: Season;
  hour: Hour;
  onClose: () => void;
}

/**
 * Add or change the material of one psalter slot.
 *
 * The key is the slot's own — this season, this psalter week, this weekday,
 * this hour. Nothing about today goes into it: not the date, not whatever
 * celebration falls today, not the current week of the season. That is the
 * whole point of editing from the grid rather than from an office.
 */
export default function SlotEditorSheet({ slot, season, hour, onClose }: Props) {
  const ids = useId();
  const [section, setSection] = useState<SectionId>(slot.missing[0] ?? SECTIONS[0]);

  /* The record that already holds this section for this slot, if any. */
  const holder = slot.entries.find((entry) => sectionHasContent(entry, section));
  const source = holder ?? slot.entries[0];

  const [content, setContent] = useState<EntryContent>(() => ({ ...EMPTY_CONTENT }));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* Load the stored wording when the chosen section changes. Derived from
     props during render rather than in an effect, so nothing is written and
     nothing happens twice under Strict Mode. */
  const signature = `${section}:${source?.id ?? 'new'}`;
  if (loadedFor !== signature) {
    setLoadedFor(signature);
    setContent({
      ...EMPTY_CONTENT,
      ...(source
        ? {
          reference: source.reference,
          readingText: source.readingText,
          translation: source.translation,
          responsory: source.responsory,
          intercessions: source.intercessions,
          concludingPrayer: source.concludingPrayer,
        }
        : {}),
    });
  }

  const meta = SECTION_META[section];
  const hasText = meta.fields.some((field) => String(content[field] ?? '').trim().length > 0);

  const key: EntryKeyInput = {
    keyType: 'psalter',
    hour,
    season,
    psalterWeek: slot.psalterWeek,
    weekday: slot.weekday,
  };

  const slotName =
    `Psalter ${ROMAN_WEEK[slot.psalterWeek]} · ${WEEKDAY_NAMES[slot.weekday]} · ${SEASON_LABELS[season]}`;

  function handleSave() {
    setError(null);
    /* An existing record for this slot is edited by identity; otherwise one
       is created against the slot's own key. Either way nothing borrows
       today's date or today's celebration. */
    const result = holder
      ? saveSectionOn(holder.id, section, content)
      : saveSection(key, section, content);
    if (!result.ok) {
      setError(result.error ?? 'That could not be saved. Nothing has been changed.');
      return;
    }
    announce(`${meta.label} saved for ${slotName} at ${HOUR_META[hour].description}.`);
    onClose();
  }

  return (
    <Sheet title={slotName} onClose={onClose}>
      <p className="mp-hint mp-sheet__context">{HOUR_META[hour].description}</p>

      <div className="mp-field">
        <label className="mp-field__label" htmlFor={`${ids}-section`}>Section</label>
        <select id={`${ids}-section`} className="mp-input mp-touch" value={section}
          onChange={(event) => setSection(event.target.value as SectionId)}>
          {SECTIONS.map((id) => (
            <option key={id} value={id}>
              {SECTION_META[id].label}{slot.present.includes(id) ? ' — stored' : ' — empty'}
            </option>
          ))}
        </select>
      </div>

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
        <p className="mp-hint"><strong>Saving as:</strong> {slotName}</p>
        <p className="mp-hint">
          This repeats every four weeks on {WEEKDAY_NAMES[slot.weekday]} at{' '}
          {HOUR_META[hour].description}, in {SEASON_LABELS[season]}.
        </p>
      </div>

      <div className="mp-sheet__actions">
        <button type="button" className="btn btn--primary mp-touch" onClick={handleSave} disabled={!hasText}>
          Save
        </button>
        <button type="button" className="btn mp-touch" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

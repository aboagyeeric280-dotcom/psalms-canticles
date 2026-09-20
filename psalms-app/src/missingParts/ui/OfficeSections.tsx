import { useId, useMemo, useState } from 'react';
import { HOUR_META, SECTIONS, SECTION_META, type Entry, type Hour, type SectionId } from '../data/types';
import type { MissingPartsDay } from '../data/day';
import { resolveOffice, type SectionResolution } from '../data/resolve';
import { missingPartsDayFor } from '../adapter/day';
import { useAppState } from '../state/useAppState';
import { dismissSaveError } from '../state/store';
import { addLabel, deleteLabel, editLabel, overrideSentence, provenanceOf } from './provenance';
import { useAnnouncement } from './announce';
import SectionEditorSheet from './SectionEditorSheet';

/** One section: what is stored for it, or an invitation to add it. */
function SectionPanel({
  section, hour, dayTitle, resolution, onEdit,
}: {
  section: SectionId;
  hour: Hour;
  dayTitle: string;
  resolution: SectionResolution;
  onEdit: () => void;
}) {
  const meta = SECTION_META[section];
  const headingId = `mp-${section}-heading`;
  const entry = resolution.entry;

  if (!entry) {
    return (
      <section className="mp-section" aria-labelledby={headingId}>
        <h4 className="mp-section__title" id={headingId}>{meta.label}</h4>
        <button
          type="button"
          className="mp-empty mp-touch"
          onClick={onEdit}
          aria-label={addLabel(section, hour, dayTitle)}
        >
          <strong>Not yet added — tap to add it</strong>
          <span className="mp-hint">Nothing of your own is stored for this day and hour yet.</span>
        </button>
      </section>
    );
  }

  const source = provenanceOf(entry);
  const overrides = overrideSentence(resolution.overridden);

  return (
    <section className="mp-section" aria-labelledby={headingId}>
      <div className="mp-section__head">
        <h4 className="mp-section__title" id={headingId}>{meta.label}</h4>
        <button
          type="button"
          className="btn btn--ghost mp-touch"
          onClick={onEdit}
          aria-label={editLabel(section, hour)}
        >
          Edit
        </button>
      </div>

      {section === 'reading' ? (
        <>
          {entry.reference ? <p className="mp-reference">{entry.reference}</p> : null}
          <div className="mp-body">{entry.readingText}</div>
          <p className="mp-translation">
            {entry.translation ? `Translation: ${entry.translation}` : 'Translation not recorded.'}
          </p>
        </>
      ) : (
        <div className="mp-body">{entry[meta.fields[0]]}</div>
      )}

      <p className="mp-provenance">
        <span className="mp-badge">Yours</span>
        <span className="mp-badge mp-badge--key">{source.badge}</span>
        <span className="mp-hint">{source.detail}</span>
      </p>

      {overrides ? <p className="mp-hint mp-override">{overrides}</p> : null}

      {resolution.duplicates.length > 0 ? (
        <p className="mp-review" role="note">
          <strong>Needs review:</strong> {resolution.duplicates.length} other record
          {resolution.duplicates.length === 1 ? '' : 's'} share this exact key. The most recently
          edited one is shown; nothing has been merged or deleted.
        </p>
      ) : null}

      {entry.needsReview ? (
        <p className="mp-review" role="note">
          <strong>Needs review:</strong> {entry.reviewNote ?? 'This record was flagged for checking.'}
        </p>
      ) : null}
    </section>
  );
}

export interface OfficeSectionsProps {
  /** The date the reader is looking at. */
  when: Date;
  hour: Hour;
  /** The title the reader sees for the day, used in accessible labels. */
  dayTitle: string;
  /** Optional memorials the reader has elected, keyed by local date. */
  observed?: Record<string, string>;
  /* False when this page is a psalter office the reader opened directly
     rather than the one the calendar appoints for today at this hour.
     Personal material is keyed to the liturgical day, so showing today's
     beside another week's psalms would attach it to an office nobody is
     praying. Defaults to true. */
  boundToCalendar?: boolean;
  /** Takes the reader to the office the calendar does appoint. */
  onOpenToday?: () => void;
}

/**
 * The four sections a printed psalter leaves out, shown inside the office.
 *
 * Rendered outside the book's own `Blocks`, deliberately: this is the
 * reader's own material on their own device, and it must never become part
 * of the published text or of the search index built from it.
 */
export default function OfficeSections({
  when, hour, dayTitle, observed, boundToCalendar = true, onOpenToday,
}: OfficeSectionsProps) {
  const { file, saveError, storageAvailable } = useAppState();
  const announcement = useAnnouncement();
  const [editing, setEditing] = useState<SectionId | null>(null);
  const headingId = useId();

  const day: MissingPartsDay = useMemo(
    () => missingPartsDayFor(when, hour, observed ?? {}),
    [when, hour, observed],
  );
  const office = useMemo(
    () => resolveOffice(file.entries, day, hour),
    [file.entries, day, hour],
  );

  const editingEntry: Entry | undefined = editing ? office.sections[editing].entry : undefined;
  const missing = SECTIONS.filter((section) => !office.sections[section].present);

  /* Browsing the psalter rather than praying today's office. Say so plainly
     and show nothing: material shown here would belong to a different day
     from the psalms above it. */
  if (!boundToCalendar) {
    return (
      <section className="mp-office" aria-labelledby={headingId}>
        <h3 className="mp-office__title" id={headingId}>Your own material</h3>
        <p className="mp-hint">
          These are the psalms the book prints for this week and day. Your own short reading,
          responsory, intercessions and concluding prayer belong to a date in the calendar, so
          they are not shown beside a page you have opened for reference.
        </p>
        {onOpenToday ? (
          <button type="button" className="btn mp-touch" onClick={onOpenToday}>
            Open today’s {HOUR_META[hour].description}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mp-office" aria-labelledby={headingId}>
      <h3 className="mp-office__title" id={headingId}>Your own material</h3>
      <p className="mp-hint">
        The short reading, responsory, intercessions and concluding prayer are not printed in this
        book. Anything you add here is stored on this device only.
      </p>

      <div className="sr" role="status" aria-live="polite">
        {announcement.message}
      </div>

      {!storageAvailable ? (
        <p className="mp-error" role="alert">
          This browser is not letting the app save anything, so additions cannot be kept.
        </p>
      ) : null}

      {saveError ? (
        <p className="mp-error" role="alert">
          {saveError}{' '}
          <button type="button" className="btn btn--ghost mp-touch" onClick={dismissSaveError}>
            Dismiss
          </button>
        </p>
      ) : null}

      <p className="sr">
        {missing.length === 0
          ? 'All four sections are stored for this office.'
          : `${missing.length} of four sections are not yet added.`}
      </p>

      {SECTIONS.map((section) => (
        <SectionPanel
          key={section}
          section={section}
          hour={hour}
          dayTitle={dayTitle}
          resolution={office.sections[section]}
          onEdit={() => setEditing(section)}
        />
      ))}

      {editing ? (
        <SectionEditorSheet
          section={editing}
          hour={hour}
          day={day}
          dayTitle={dayTitle}
          existing={editingEntry}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

export { deleteLabel };

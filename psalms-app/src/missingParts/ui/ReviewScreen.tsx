import { useMemo, useState } from 'react';
import { SECTIONS, SECTION_META, type Entry, type SectionId } from '../data/types';
import { useAppState } from '../state/useAppState';
import { acknowledgeReview, unacknowledgeReview } from '../state/store';
import { buildCoverageWindow, RESOLUTION_WINDOW_DAYS } from '../adapter/coverage';
import { collectCanonicalIds } from '../adapter/celebrationIds';
import { REVIEW_REASON_LABELS, reviewItems, sectionWording, type ReviewItem } from './selectors';
import { announce } from './announce';
import EntrySectionSheet from './EntrySectionSheet';

/** Two versions of one section, shown as they are, with nothing chosen. */
function Conflict({ item, section }: { item: ReviewItem; section: SectionId }) {
  const others = item.conflicts.filter((c) => c.section === section);
  return (
    <div className="mp-conflict">
      <h4 className="mp-section__title">{SECTION_META[section].label}</h4>
      <div className="mp-conflict__pair">
        <div className="mp-conflict__side">
          <p className="mp-hint">This record</p>
          <div className="mp-body">{sectionWording(item.entry, section)}</div>
        </div>
        {others.map(({ other, comparison }) => (
          <div className="mp-conflict__side" key={other.id}>
            <p className="mp-hint">
              The other record
              {comparison === 'whitespace-only' ? ' — differs only in blank space' : ''}
            </p>
            <div className="mp-body">{sectionWording(other, section)}</div>
          </div>
        ))}
      </div>
      <p className="mp-hint">
        Both are kept. Edit whichever you want to stand; nothing here has been merged or chosen.
      </p>
    </div>
  );
}

export default function ReviewScreen() {
  const { file } = useAppState();
  const [editing, setEditing] = useState<{ entry: Entry; section: SectionId } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  /* Both of these read the calendar and nothing else, so they are worked out
     once and shared by every item rather than per record. */
  const context = useMemo(() => ({
    knownCelebrationIds: new Set(collectCanonicalIds(
      new Date().getFullYear(), new Date().getFullYear() + 4,
    ).keys()),
    window: buildCoverageWindow(new Date(), RESOLUTION_WINDOW_DAYS),
  }), []);

  const items = useMemo(() => reviewItems(file.entries, context), [file.entries, context]);
  const acknowledged = file.entries.filter((entry) => entry.reviewedAt);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="mp-screen">
      <p className="mp-hint">
        Everything stored that wants a human eye. Nothing on this page has been merged, chosen,
        trimmed or thrown away — it only says what it found and leaves the deciding to you.
      </p>

      <p className="mp-hint" role="status">
        {items.length === 0
          ? 'Nothing needs review.'
          : `${items.length} record${items.length === 1 ? '' : 's'} to look at.`}
      </p>

      <ul className="mp-list">
        {items.map((item) => {
          const sectionsInConflict = [...new Set(item.conflicts.map((c) => c.section))];
          const open = expanded.has(item.entry.id);
          return (
            <li key={item.entry.id} className="mp-card" data-blocked={item.blocked ? '1' : '0'}>
              <div className="mp-card__head">
                <h3 className="mp-card__title">{item.badge}</h3>
                <span className="mp-badge">Yours</span>
              </div>
              <p className="mp-hint">{item.description}</p>

              <ul className="mp-reasons">
                {item.reasons.map((reason) => (
                  <li key={reason.kind} className="mp-review" data-kind={reason.kind}>
                    <strong>{REVIEW_REASON_LABELS[reason.kind]}.</strong> {reason.message}
                  </li>
                ))}
              </ul>

              {sectionsInConflict.map((section) => (
                <Conflict key={section} item={item} section={section} />
              ))}

              {item.duplicates.length > 0 ? (
                <div className="mp-field">
                  <button
                    type="button"
                    className="btn btn--ghost mp-touch"
                    aria-expanded={open}
                    onClick={() => toggle(item.entry.id)}
                  >
                    {open ? 'Hide' : 'Inspect'} the {item.duplicates.length} record
                    {item.duplicates.length === 1 ? '' : 's'} sharing this key
                  </button>
                  {open ? (
                    <ul className="mp-list mp-list--nested">
                      {item.duplicates.map((other) => (
                        <li key={other.id} className="mp-card">
                          <p className="mp-hint">
                            Last changed{' '}
                            {new Date(other.updatedAt || other.createdAt).toLocaleDateString()}
                          </p>
                          {SECTIONS.filter((s) => sectionWording(other, s)).map((s) => (
                            <div key={s}>
                              <h4 className="mp-section__title">{SECTION_META[s].label}</h4>
                              <div className="mp-body">{sectionWording(other, s)}</div>
                              <button
                                type="button"
                                className="btn btn--ghost mp-touch"
                                onClick={() => setEditing({ entry: other, section: s })}
                              >
                                Edit this one
                              </button>
                            </div>
                          ))}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="mp-sheet__actions">
                {SECTIONS.filter((s) => sectionWording(item.entry, s)).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="btn mp-touch"
                    onClick={() => setEditing({ entry: item.entry, section: s })}
                    aria-label={`Edit the ${SECTION_META[s].label.toLowerCase()} of ${item.description}`}
                  >
                    Edit {SECTION_META[s].shortLabel.toLowerCase()}
                  </button>
                ))}

                {item.entry.needsReview ? (
                  <button
                    type="button"
                    className="btn btn--ghost mp-touch"
                    disabled={item.blocked}
                    onClick={() => {
                      const result = acknowledgeReview(item.entry.id);
                      announce(result.ok
                        ? 'Marked as reviewed. The explanation is kept, and this can be undone.'
                        : result.error ?? 'That could not be saved.');
                    }}
                  >
                    Mark reviewed
                  </button>
                ) : null}
              </div>

              {item.blocked ? (
                <p className="mp-hint">
                  This one cannot be settled from here yet: it needs either a calendar that
                  carries the celebration, or a version of the app that understands the fields it
                  is holding. It stays on this list, and its wording is untouched.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {acknowledged.length > 0 ? (
        <section className="mp-screen__section" aria-labelledby="mp-reviewed">
          <h3 className="mp-office__title" id="mp-reviewed">Marked as reviewed</h3>
          <p className="mp-hint">
            The explanation is kept against each of these, and the flag can be put back.
          </p>
          <ul className="mp-list">
            {acknowledged.map((entry) => (
              <li key={entry.id} className="mp-card">
                <p className="mp-hint">{entry.reviewNote ?? 'Flagged when it was read in.'}</p>
                <button
                  type="button"
                  className="btn btn--ghost mp-touch"
                  onClick={() => {
                    const result = unacknowledgeReview(entry.id);
                    announce(result.ok
                      ? 'Put back on the review list.'
                      : result.error ?? 'That could not be saved.');
                  }}
                >
                  Put it back on the list
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <EntrySectionSheet
          entry={editing.entry}
          section={editing.section}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

import { useId, useMemo, useState } from 'react';
import {
  HOURS, HOUR_META, KEY_TYPES, KEY_TYPE_LABELS, SECTIONS, SECTION_META,
  type Entry, type Hour, type KeyType, type SectionId,
} from '../data/types';
import { useAppState } from '../state/useAppState';
import { EMPTY_FILTERS, filterRows, libraryRows, type LibraryFilters } from './selectors';
import EntrySectionSheet from './EntrySectionSheet';

/** When the reader last touched a record, in words rather than a timestamp. */
function lastTouched(entry: Entry): string {
  const when = entry.updatedAt || entry.createdAt;
  if (!when) return 'Not recorded';
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function LibraryScreen() {
  const { file } = useAppState();
  const ids = useId();
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<{ entry: Entry; section: SectionId } | null>(null);

  const rows = useMemo(() => libraryRows(file.entries), [file.entries]);
  const shown = useMemo(() => filterRows(rows, filters), [rows, filters]);

  const set = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="mp-screen">
      <p className="mp-hint">
        Everything you have written, on this device only. It is not part of the book, and the
        search at the top of the app does not look in here.
      </p>

      <div className="mp-filters" role="search" aria-label="Search your own material">
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${ids}-q`}>Search your material</label>
          <input
            id={`${ids}-q`} className="mp-input mp-touch" type="search"
            value={filters.query}
            onChange={(event) => set('query', event.target.value)}
            placeholder="A phrase, a celebration, a psalter week…"
          />
        </div>

        <div className="mp-filters__row">
          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-section`}>Section</label>
            <select id={`${ids}-section`} className="mp-input mp-touch" value={filters.section}
              onChange={(e) => set('section', e.target.value as SectionId | 'all')}>
              <option value="all">Any section</option>
              {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_META[s].label}</option>)}
            </select>
          </div>

          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-hour`}>Hour</label>
            <select id={`${ids}-hour`} className="mp-input mp-touch" value={filters.hour}
              onChange={(e) => set('hour', e.target.value as Hour | 'all')}>
              <option value="all">Any hour</option>
              {HOURS.map((h) => <option key={h} value={h}>{HOUR_META[h].description}</option>)}
            </select>
          </div>

          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-key`}>Applies to</label>
            <select id={`${ids}-key`} className="mp-input mp-touch" value={filters.keyType}
              onChange={(e) => set('keyType', e.target.value as KeyType | 'all')}>
              <option value="all">Any scope</option>
              {KEY_TYPES.map((k) => <option key={k} value={k}>{KEY_TYPE_LABELS[k]}</option>)}
            </select>
          </div>

          <div className="mp-field">
            <label className="mp-field__label" htmlFor={`${ids}-review`}>Review</label>
            <select id={`${ids}-review`} className="mp-input mp-touch" value={filters.review}
              onChange={(e) => set('review', e.target.value as LibraryFilters['review'])}>
              <option value="all">Everything</option>
              <option value="needs-review">Needs review</option>
              <option value="settled">Settled</option>
            </select>
          </div>
        </div>

        <p className="mp-hint" role="status">
          {shown.length === rows.length
            ? `${rows.length} record${rows.length === 1 ? '' : 's'}.`
            : `${shown.length} of ${rows.length} records.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mp-empty-note">
          Nothing is stored yet. Open an office and add a reading, responsory, intercessions or
          concluding prayer, and it will appear here.
        </p>
      ) : null}

      <ul className="mp-list">
        {shown.map((row) => (
          <li key={row.entry.id} className="mp-card">
            <div className="mp-card__head">
              <h3 className="mp-card__title">{row.badge}</h3>
              <span className="mp-badge">Yours</span>
            </div>
            <p className="mp-hint">{row.description}</p>
            <p className="mp-hint">{row.detail}</p>

            <div className="mp-card__sections">
              {SECTIONS.map((section) => {
                const has = row.present.includes(section);
                return (
                  <button
                    key={section}
                    type="button"
                    className="btn btn--ghost mp-touch mp-card__section"
                    data-has={has ? '1' : '0'}
                    onClick={() => setEditing({ entry: row.entry, section })}
                    aria-label={`${has ? 'Edit' : 'Add'} the ${SECTION_META[section].label.toLowerCase()} of ${row.description}`}
                  >
                    {SECTION_META[section].shortLabel}
                    <span className="mp-card__state">{has ? 'stored' : 'empty'}</span>
                  </button>
                );
              })}
            </div>

            <p className="mp-hint">Last changed {lastTouched(row.entry)}.</p>

            {row.duplicateCount > 0 ? (
              <p className="mp-review" role="note">
                <strong>Needs review:</strong> {row.duplicateCount} other record
                {row.duplicateCount === 1 ? ' shares' : 's share'} this key. Nothing has been merged.
              </p>
            ) : null}

            {row.needsReview ? (
              <p className="mp-review" role="note">
                <strong>Needs review:</strong> {row.entry.reviewNote ?? 'This record was flagged.'}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

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

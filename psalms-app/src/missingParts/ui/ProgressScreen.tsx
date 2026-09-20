import { useId, useMemo, useState } from 'react';
import {
  HOURS, HOUR_META, SECTIONS, SECTION_META, SEASON_LABELS,
  type Hour, type Season,
} from '../data/types';
import type { PsalterWeek } from '../data/day';
import { ROMAN_WEEK, WEEKDAY_NAMES } from '../data/iso';
import { useAppState } from '../state/useAppState';
import { missingPartsDayFor } from '../adapter/day';
import { progressTotals, psalterSlots, type PsalterSlot } from './selectors';
import SlotEditorSheet from './SlotEditorSheet';

const SEASONS: Season[] = ['advent', 'christmas', 'lent', 'holyweek', 'triduum', 'easter', 'ordinary'];

/* The Triduum has no psalter cycle of its own, so a 28-slot grid there would
   be 28 slots nothing can ever match. */
const SEASONS_WITH_PSALTER: Season[] = SEASONS.filter((season) => season !== 'triduum');

const STATE_WORDS: Record<PsalterSlot['state'], string> = {
  complete: 'all four stored',
  partial: 'some stored',
  empty: 'nothing stored',
};

export default function ProgressScreen() {
  const { file } = useAppState();
  const ids = useId();

  /* Start where the reader is, so the grid is about today's season rather
     than one they have to go and find. */
  const today = useMemo(() => missingPartsDayFor(new Date(), 'morning'), []);
  const [season, setSeason] = useState<Season>(
    SEASONS_WITH_PSALTER.includes(today.season) ? today.season : 'ordinary',
  );
  const [hour, setHour] = useState<Hour>('morning');
  const [editing, setEditing] = useState<PsalterSlot | null>(null);

  const slots = useMemo(
    () => psalterSlots(file.entries, season, hour),
    [file.entries, season, hour],
  );
  const totals = useMemo(() => progressTotals(slots), [slots]);

  return (
    <div className="mp-screen">
      <p className="mp-hint">
        This grid is the recurring foundation only: the twenty-eight psalter slots — four weeks
        of seven days — for one season and one hour. Material you keyed to an exact date, to a
        week of the season or to a celebration is real and is shown in the office; it is simply
        not counted here, because it does not fill a psalter slot. Everything you have written
        is listed in the Library.
      </p>

      <div className="mp-filters__row">
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${ids}-season`}>Season</label>
          <select id={`${ids}-season`} className="mp-input mp-touch" value={season}
            onChange={(e) => setSeason(e.target.value as Season)}>
            {SEASONS_WITH_PSALTER.map((s) => (
              <option key={s} value={s}>{SEASON_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="mp-field">
          <label className="mp-field__label" htmlFor={`${ids}-hour`}>Hour</label>
          <select id={`${ids}-hour`} className="mp-input mp-touch" value={hour}
            onChange={(e) => setHour(e.target.value as Hour)}>
            {HOURS.map((h) => <option key={h} value={h}>{HOUR_META[h].description}</option>)}
          </select>
        </div>
      </div>

      <dl className="mp-totals" aria-label="Coverage of this season and hour">
        <div><dt>Complete</dt><dd>{totals.complete} of {totals.slots}</dd></div>
        <div><dt>Partly done</dt><dd>{totals.partial}</dd></div>
        <div><dt>Empty</dt><dd>{totals.empty}</dd></div>
        <div>
          <dt>Sections stored</dt>
          <dd>{totals.sectionsStored} of {totals.sectionsPossible}</dd>
        </div>
      </dl>

      <ul className="mp-totals mp-totals--sections" aria-label="Stored by section">
        {SECTIONS.map((section) => (
          <li key={section}>
            <span>{SECTION_META[section].shortLabel}</span>
            <strong>{totals.bySection[section]} / {totals.slots}</strong>
          </li>
        ))}
      </ul>

      <table className="mp-grid">
        <caption className="sr">
          Psalter coverage for {SEASON_LABELS[season]} at {HOUR_META[hour].description}:
          {' '}{totals.slots} slots, {totals.complete} complete.
        </caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr">Psalter week</span></th>
            {WEEKDAY_NAMES.map((name) => (
              <th key={name} scope="col">
                <span aria-hidden="true">{name.slice(0, 3)}</span>
                <span className="sr">{name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([1, 2, 3, 4] as PsalterWeek[]).map((week) => (
            <tr key={week}>
              <th scope="row">
                <span aria-hidden="true">{ROMAN_WEEK[week]}</span>
                <span className="sr">Psalter week {ROMAN_WEEK[week]}</span>
              </th>
              {WEEKDAY_NAMES.map((dayName, weekday) => {
                const slot = slots.find((s) => s.psalterWeek === week && s.weekday === weekday)!;
                const missing = slot.missing.map((s) => SECTION_META[s].label.toLowerCase());
                return (
                  <td key={dayName}>
                    <button
                      type="button"
                      className="mp-cell mp-touch"
                      data-state={slot.state}
                      onClick={() => setEditing(slot)}
                      aria-label={
                        `Psalter week ${ROMAN_WEEK[week]}, ${dayName}, ${HOUR_META[hour].description}: `
                        + `${slot.present.length} of ${SECTIONS.length} sections stored`
                        + (missing.length > 0 ? `. Missing: ${missing.join(', ')}.` : '.')
                      }
                    >
                      <span aria-hidden="true">{slot.present.length}/{SECTIONS.length}</span>
                      <span className="sr">{STATE_WORDS[slot.state]}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mp-hint">
        Each cell says how many of the four sections that slot has. Open one to add or change
        its material; it will be filed against that psalter week and weekday, not against today.
      </p>

      {editing ? (
        <SlotEditorSheet
          slot={editing}
          season={season}
          hour={hour}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

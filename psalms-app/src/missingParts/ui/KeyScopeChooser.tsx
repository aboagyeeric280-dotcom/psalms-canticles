import { useId } from 'react';
import {
  CALENDAR_SCOPES, CALENDAR_SCOPE_LABELS, CELEBRATION_RANKS, CELEBRATION_RANK_LABELS,
  KEY_TYPES, KEY_TYPE_LABELS, SEASON_LABELS,
  type CalendarScope, type CelebrationRank, type KeyType, type PsalterWeek,
} from '../data/types';
import type { MissingPartsDay } from '../data/day';
import { ROMAN_WEEK, WEEKDAY_NAMES } from '../data/iso';
import type { EntryKeyInput } from '../state/store';
import { explainKey } from '../data/resolve';

/** Which key types this day can actually carry. */
export function keyTypesFor(day: MissingPartsDay): KeyType[] {
  return KEY_TYPES.filter((keyType) => {
    if (keyType === 'week') return day.allowsWeekKey && day.weekOfSeason !== null;
    if (keyType === 'celebration') return day.celebrations.length > 0;
    return true;
  });
}

/** The key a new record gets by default, given the day and the section. */
export function defaultKeyFor(
  day: MissingPartsDay,
  hour: EntryKeyInput['hour'],
  preferred: KeyType,
): EntryKeyInput {
  const available = keyTypesFor(day);
  const keyType = available.includes(preferred) ? preferred : 'psalter';
  return keyFor(day, hour, keyType);
}

export function keyFor(
  day: MissingPartsDay,
  hour: EntryKeyInput['hour'],
  keyType: KeyType,
): EntryKeyInput {
  switch (keyType) {
    case 'date':
      return { keyType, hour, date: day.date };
    case 'celebration': {
      const celebration = day.celebrations[0];
      return {
        keyType, hour,
        celebrationId: celebration?.id,
        celebrationName: celebration?.name,
        calendarScope: 'general',
      };
    }
    case 'week':
      return { keyType, hour, season: day.season, weekOfSeason: day.weekOfSeason ?? undefined };
    case 'psalter':
    default:
      return {
        keyType, hour,
        season: day.season,
        psalterWeek: day.psalterWeek as PsalterWeek,
        weekday: day.weekday,
      };
  }
}

/** One line of plain language saying when the chosen scope applies. */
export function explainScope(key: EntryKeyInput): string {
  return explainKey(key.keyType, {
    season: key.season,
    psalterWeek: key.psalterWeek,
    weekday: key.weekday,
    weekOfSeason: key.weekOfSeason,
    celebrationId: key.celebrationId,
    celebrationName: key.celebrationName,
    celebrationMonth: key.celebrationMonth,
    celebrationDay: key.celebrationDay,
    date: key.date,
    hour: key.hour,
  });
}

/** A short name for the chosen scope, shown beside the Save button. */
export function scopeSummary(key: EntryKeyInput): string {
  switch (key.keyType) {
    case 'date':
      return `Exact date · ${key.date}`;
    case 'celebration':
      return `Celebration · ${key.celebrationName ?? 'unnamed'}`;
    case 'week':
      return `Week ${key.weekOfSeason} · ${key.season ? SEASON_LABELS[key.season] : ''}`;
    case 'psalter':
    default:
      return `Psalter ${ROMAN_WEEK[key.psalterWeek ?? 1]} · ${
        key.weekday === undefined ? '' : WEEKDAY_NAMES[key.weekday]
      }`;
  }
}

interface Props {
  day: MissingPartsDay;
  value: EntryKeyInput;
  onChange: (next: EntryKeyInput) => void;
  /** Editing an existing record: changing scope is a separate, explicit act. */
  locked?: boolean;
  onUnlock?: () => void;
}

export default function KeyScopeChooser({ day, value, onChange, locked, onUnlock }: Props) {
  const ids = useId();
  const available = keyTypesFor(day);

  /* The scope is stated once, in the "Saving as" summary above the Save
     button. Repeating it here only invited the two to disagree. */
  if (locked) {
    return (
      <div className="mp-field">
        <button
          type="button"
          className="btn btn--ghost mp-touch"
          onClick={onUnlock}
          aria-label={`Change what this applies to. Currently ${scopeSummary(value)}.`}
        >
          Change what this applies to
        </button>
      </div>
    );
  }

  return (
    <div className="mp-field">
      <label className="mp-field__label" htmlFor={`${ids}-keytype`}>This applies to</label>
      <select
        id={`${ids}-keytype`}
        className="mp-input mp-touch"
        value={value.keyType}
        onChange={(event) => onChange(keyFor(day, value.hour, event.target.value as KeyType))}
      >
        {available.map((keyType) => (
          <option key={keyType} value={keyType}>{KEY_TYPE_LABELS[keyType]}</option>
        ))}
      </select>

      {value.keyType === 'celebration' && day.celebrations.length > 1 ? (
        <>
          <label className="mp-field__label" htmlFor={`${ids}-celebration`}>Which celebration</label>
          <select
            id={`${ids}-celebration`}
            className="mp-input mp-touch"
            value={value.celebrationId ?? ''}
            onChange={(event) => {
              const chosen = day.celebrations.find((c) => c.id === event.target.value);
              onChange({ ...value, celebrationId: chosen?.id, celebrationName: chosen?.name });
            }}
          >
            {day.celebrations.map((celebration) => (
              <option key={celebration.id} value={celebration.id}>{celebration.name}</option>
            ))}
          </select>
        </>
      ) : null}

      {value.keyType === 'celebration' ? (
        <>
          <label className="mp-field__label" htmlFor={`${ids}-rank`}>Rank</label>
          <select
            id={`${ids}-rank`}
            className="mp-input mp-touch"
            value={value.celebrationRank ?? ''}
            onChange={(event) => onChange({
              ...value,
              celebrationRank: (event.target.value || undefined) as CelebrationRank | undefined,
            })}
          >
            <option value="">Not stated</option>
            {CELEBRATION_RANKS.map((rank) => (
              <option key={rank} value={rank}>{CELEBRATION_RANK_LABELS[rank]}</option>
            ))}
          </select>

          <label className="mp-field__label" htmlFor={`${ids}-scope`}>Calendar</label>
          <select
            id={`${ids}-scope`}
            className="mp-input mp-touch"
            value={value.calendarScope ?? 'general'}
            onChange={(event) => onChange({
              ...value, calendarScope: event.target.value as CalendarScope,
            })}
          >
            {CALENDAR_SCOPES.map((scope) => (
              <option key={scope} value={scope}>{CALENDAR_SCOPE_LABELS[scope]}</option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}

import { COLOUR_NAMES } from '../data/sanctoral';
import type { LiturgicalToday } from '../utils/generalCalendar';
import { ROMAN, formatDate } from '../utils/liturgicalCalendar';

interface Props {
  day: LiturgicalToday;
  /** Shown on the reader, where space is tighter. */
  compact?: boolean;
  onPickDate?: () => void;
}

/** The date, what is kept today, its rank and colour, and the psalter week. */
export default function LiturgicalHeader({ day, compact, onPickDate }: Props) {
  const { primary } = day;
  const other = day.celebrations.filter(c => c.name !== primary.name);

  return (
    <section className={`litbar${compact ? ' litbar--compact' : ''}`} data-colour={day.colour}>
      <div className="litbar__swatch" aria-hidden="true" />
      <div className="litbar__body">
        <p className="litbar__date">
          {formatDate(day.date)}
          {onPickDate && (
            <button className="litbar__pick" onClick={onPickDate}>Change date</button>
          )}
        </p>
        <h2 className="litbar__title">{day.title}</h2>
        <p className="litbar__meta">
          <span className={`badge badge--${primary.rank}`}>{primary.rankName}</span>
          <span className="badge badge--plain">Week {ROMAN[day.week]}</span>
          <span className="badge badge--plain">{COLOUR_NAMES[day.colour]}</span>
          {day.day === 'sun' && <span className="badge badge--plain">Year {day.sundayCycle}</span>}
        </p>
        {other.length > 0 && (
          <p className="litbar__also">
            Also today: {other.map(c => `${c.name} (${c.rankName.toLowerCase()})`).join('; ')}
          </p>
        )}
      </div>
    </section>
  );
}

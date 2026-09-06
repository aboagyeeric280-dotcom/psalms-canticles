import type { LiturgicalToday } from '../utils/generalCalendar';

interface Props {
  day: LiturgicalToday;
  /** Elect a memorial by name, or pass the day's memorials over with null. */
  onElect: (name: string | null) => void;
}

/** Keep or pass over the day's optional memorials.

    An optional memorial is a choice, not an obligation, so the weekday stands
    until the saint is chosen. Choosing one changes the title, the colour and
    the common the plan points at; it never changes the psalmody, because the
    book prints no proper psalms for a memorial. */
export default function OptionalMemorials({ day, onElect }: Props) {
  if (!day.optionalMemorials.length) return null;

  const kept = day.observing;
  // A privileged weekday — Lent, Christmastide — outranks the saint even when
  // the saint has been chosen, and the memorial is only commemorated.
  const commemoratedOnly = kept !== null && day.primary.name !== kept;

  return (
    <section className="sect">
      <div className="sect__head">
        <h3 className="sect__title">
          {day.optionalMemorials.length > 1 ? 'Optional memorials today' : 'Optional memorial today'}
        </h3>
      </div>
      <div className="chiprow">
        <button className="chip" aria-pressed={kept === null} onClick={() => onElect(null)}>
          Pass over — keep the weekday
        </button>
        {day.optionalMemorials.map(c => (
          <button key={c.name} className="chip" aria-pressed={kept === c.name}
            onClick={() => onElect(c.name)}>
            {c.name}
          </button>
        ))}
      </div>
      <p className="field__hint">
        {kept === null
          ? 'The weekday is kept. An optional memorial is only kept if it is chosen.'
          : commemoratedOnly
            ? `${kept} is commemorated only: ${day.title} outranks it, and the office stays that of the day.`
            : `${kept} is kept. The book prints no proper for a memorial, so the psalmody remains the weekday’s and the plan points at the common.`}
      </p>
    </section>
  );
}

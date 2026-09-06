import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { isFestal, liturgicalToday } from '../utils/generalCalendar';
import { DAY_NAMES, DAY_KEYS } from '../utils/liturgicalCalendar';

interface Props {
  value: Date;
  onPick: (d: Date) => void;
  onClose: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** A month at a time, each day tinted with its liturgical colour. */
export default function DatePicker({ value, onPick, onClose }: Props) {
  const [cursor, setCursor] = useState(new Date(value.getFullYear(), value.getMonth(), 1));

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());                 // back to the Sunday
    const out: { date: Date; inMonth: boolean; colour: string; rank: string; title: string }[][] = [];
    const d = new Date(start);
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let i = 0; i < 7; i++) {
        const lit = liturgicalToday(new Date(d));
        row.push({
          date: new Date(d),
          inMonth: d.getMonth() === cursor.getMonth(),
          colour: lit.colour,
          // Ringed only when the day has its own proper or common; an
          // ordinary Sunday is high-ranking but takes the plain psalter.
          rank: isFestal(lit) ? lit.primary.rank : 'ferial',
          title: lit.title,
        });
        d.setDate(d.getDate() + 1);
      }
      out.push(row);
      if (d.getMonth() !== cursor.getMonth() && w >= 3) break;
    }
    return out;
  }, [cursor]);

  const shift = (months: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1));

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const today = new Date();

  return (
    <Sheet title="Go to a date" onClose={onClose}>
      <div className="cal__head">
        <button className="stepbtn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <span className="cal__month">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
        <button className="stepbtn" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>

      <div className="cal">
        {DAY_KEYS.map(k => <span key={k} className="cal__dow">{DAY_NAMES[k].slice(0, 2)}</span>)}
        {weeks.flat().map((cell, i) => (
          <button
            key={i}
            className="cal__day"
            data-colour={cell.colour}
            data-rank={cell.rank}
            data-out={cell.inMonth ? '0' : '1'}
            data-today={sameDay(cell.date, today) ? '1' : '0'}
            data-selected={sameDay(cell.date, value) ? '1' : '0'}
            title={cell.title}
            onClick={() => { onPick(cell.date); onClose(); }}
          >
            {cell.date.getDate()}
          </button>
        ))}
      </div>

      <p className="field__hint" style={{ marginTop: '.9rem' }}>
        Each day is tinted with its liturgical colour; a ring marks a solemnity or feast.
      </p>
      <div className="chiprow" style={{ marginTop: '.8rem' }}>
        <button className="chip" onClick={() => { onPick(new Date()); onClose(); }}>Today</button>
        <button className="chip" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
          This month
        </button>
      </div>
    </Sheet>
  );
}

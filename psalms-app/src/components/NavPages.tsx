import { useMemo, useState } from 'react';
import {
  DAY_KEYS, DAY_NAMES, HOUR_NAMES, ROMAN, formatDate, liturgicalDay,
} from '../utils/liturgicalCalendar';
import { COLOUR_NAMES } from '../data/sanctoral';
import { isFestal, liturgicalToday } from '../utils/generalCalendar';
import { loadMarks, loadRecent } from '../utils/storage';
import type { DayKey, HourKey } from '../types';

interface NavProps {
  onGo: (r: string) => void;
  viewed: Date;
  setViewed: (d: Date) => void;
}

const HOURS: HourKey[] = ['morning', 'midday', 'evening'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* ------------------------------------------------------------- the psalter */

/** Any day of the four-week psalter, on its own — the browsing half of the
    app, which used to sit at the bottom of the dashboard. */
export function PsalterPage({ onGo, viewed }: NavProps) {
  const lit = useMemo(() => liturgicalDay(viewed), [viewed]);
  const [week, setWeek] = useState<1 | 2 | 3 | 4>(lit.week);
  const [day, setDay] = useState<DayKey>(lit.day);
  const following = week === lit.week && day === lit.day;

  return (
    <div className="shell">
      <div className="sect__head" style={{ marginTop: '1.25rem' }}>
        <h2 className="page__title">The Psalter</h2>
        {!following && (
          <button className="btn btn--ghost" onClick={() => { setWeek(lit.week); setDay(lit.day); }}>
            Back to today
          </button>
        )}
      </div>
      <p className="field__hint" style={{ marginTop: 0, marginBottom: '1.1rem' }}>
        Weeks I–IV, pages 37–306. What is actually kept today is on Today’s Office.
      </p>

      <div className="field">
        <span className="field__label">Psalter week</span>
        <div className="chiprow">
          {([1, 2, 3, 4] as const).map(w => (
            <button key={w} className="chip" aria-pressed={w === week} onClick={() => setWeek(w)}>
              Week {ROMAN[w]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Day</span>
        <div className="chiprow">
          {DAY_KEYS.map(d => (
            <button key={d} className="chip" aria-pressed={d === day} onClick={() => setDay(d)}>
              {DAY_NAMES[d].slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <div className="tiles">
        {HOURS.map(h => (
          <button key={h} className="tile" onClick={() => onGo(`#/office/w${week}-${day}-${h}`)}>
            <span className="tile__name">{HOUR_NAMES[h]}</span>
            <span className="tile__sub">Week {ROMAN[week]} · {DAY_NAMES[day]}</span>
          </button>
        ))}
        <button className="tile" onClick={() => onGo(`#/readings/read-w${week}-${day}`)}>
          <span className="tile__name">Office of Readings</span>
          <span className="tile__sub">Meditation psalms</span>
        </button>
        <button className="tile" onClick={() => onGo('#/invitatory')}>
          <span className="tile__name">Invitatory</span>
          <span className="tile__sub">Psalm 95 &amp; antiphons</span>
        </button>
        <button className="tile" onClick={() => onGo('#/compline')}>
          <span className="tile__name">Compline</span>
          <span className="tile__sub">{DAY_NAMES[day]} psalms</span>
        </button>
      </div>

      {day === 'sun' && (
        <div style={{ marginTop: '.8rem' }}>
          <button className="btn btn--ghost" onClick={() => onGo(`#/office/w${week}-sun-evening-before`)}>
            Sunday — Evening Before (First Vespers)
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- canticles */

const CANTICLES: [string, string, string][] = [
  ['#/canticle/zechariah', 'Canticle of Zechariah', 'Benedictus · nine settings, at Morning Prayer'],
  ['#/canticle/mary', 'Canticle of Mary', 'Magnificat · nine settings, at Evening Prayer'],
  ['#/te-deum', 'Te Deum', 'The Church’s Hymn of Praise'],
  ['#/invitatory', 'Invitatory', 'Psalm 95 with its antiphons'],
  ['#/midday-hymns', 'Midday Hymns & Antiphons', 'Three hymns, seasonal antiphons'],
  ['#/dominican', 'Compline Supplements', 'Salve Regina, O Lumen, hymns, litany'],
];

export function CanticlesPage({ onGo }: NavProps) {
  return (
    <div className="shell">
      <h2 className="page__title" style={{ marginTop: '1.25rem' }}>Canticles</h2>
      <p className="field__hint" style={{ marginTop: '.3rem', marginBottom: '1.1rem' }}>
        The gospel canticles and the other sung texts the book prints whole. The Old
        Testament canticles belong to their hour and are found inside it.
      </p>
      <div className="list">
        {CANTICLES.map(([route, label, meta]) => (
          <button key={route} className="list__item" onClick={() => onGo(route)}>
            <span className="list__label">{label}</span>
            <span className="list__meta">{meta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ liturgical calendar */

export function CalendarPage({ onGo, viewed, setViewed }: NavProps) {
  const [cursor, setCursor] = useState(new Date(viewed.getFullYear(), viewed.getMonth(), 1));
  const today = new Date();

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const out: { date: Date; inMonth: boolean; colour: string; rank: string; title: string }[] = [];
    const d = new Date(start);
    for (let w = 0; w < 6; w++) {
      for (let i = 0; i < 7; i++) {
        const lit = liturgicalToday(new Date(d));
        out.push({
          date: new Date(d),
          inMonth: d.getMonth() === cursor.getMonth(),
          colour: lit.colour,
          rank: isFestal(lit) ? lit.primary.rank : 'ferial',
          title: lit.title,
        });
        d.setDate(d.getDate() + 1);
      }
      if (d.getMonth() !== cursor.getMonth() && w >= 3) break;
    }
    return out;
  }, [cursor]);

  /* What is worth knowing is coming: the next month's worth of days that are
     more than a ferial weekday. */
  const upcoming = useMemo(() => {
    const out: { date: Date; title: string; rank: string; colour: string }[] = [];
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (let i = 0; i < 60 && out.length < 8; i++) {
      d.setDate(d.getDate() + (i === 0 ? 0 : 1));
      const lit = liturgicalToday(new Date(d));
      const rank = lit.primary.rank;
      if (rank === 'solemnity' || rank === 'feast' || rank === 'memorial') {
        out.push({ date: new Date(d), title: lit.title, rank: lit.primary.rankName, colour: lit.colour });
      }
    }
    return out;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shift = (m: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + m, 1));
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return (
    <div className="shell">
      <h2 className="page__title" style={{ marginTop: '1.25rem' }}>Liturgical Calendar</h2>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="cal__head">
          <button className="stepbtn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <span className="cal__month">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <button className="stepbtn" onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
        <div className="cal">
          {DAY_KEYS.map(k => <span key={k} className="cal__dow">{DAY_NAMES[k].slice(0, 2)}</span>)}
          {weeks.map((cell, i) => (
            <button key={i} className="cal__day"
              data-colour={cell.colour} data-rank={cell.rank}
              data-out={cell.inMonth ? '0' : '1'}
              data-today={same(cell.date, today) ? '1' : '0'}
              data-selected={same(cell.date, viewed) ? '1' : '0'}
              title={cell.title}
              onClick={() => { setViewed(cell.date); onGo('#/'); }}>
              {cell.date.getDate()}
            </button>
          ))}
        </div>
        <p className="field__hint" style={{ marginTop: '.9rem' }}>
          Each day is tinted with its liturgical colour; a ring marks a solemnity or feast.
          Choosing a day opens its office.
        </p>
      </div>

      <div className="sect">
        <div className="sect__head"><h3 className="sect__title">What is coming</h3></div>
        <div className="list">
          {upcoming.map((u, i) => (
            <button key={i} className="list__item" onClick={() => { setViewed(u.date); onGo('#/'); }}>
              <span className="list__label">
                <span className="seasondot" data-colour={u.colour} aria-hidden="true" />
                {u.title}
              </span>
              <span className="list__meta">{formatDate(u.date)} · {u.rank} · {COLOUR_NAMES[u.colour as keyof typeof COLOUR_NAMES]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- bookmarks */

export function BookmarksPage({ onGo }: NavProps) {
  const marks = useMemo(() => Object.entries(loadMarks())
    .map(([route, m]) => ({ ...m, route }))
    .sort((a, b) => b.at - a.at), []);
  const recent = useMemo(() => loadRecent(), []);

  return (
    <div className="shell">
      <h2 className="page__title" style={{ marginTop: '1.25rem' }}>Bookmarks</h2>
      <p className="field__hint" style={{ marginTop: '.3rem', marginBottom: '1.1rem' }}>
        Where prayer stopped, and what has been opened lately. The app keeps these on
        this device only.
      </p>

      <div className="sect">
        <div className="sect__head"><h3 className="sect__title">Where you stopped</h3></div>
        {marks.length ? (
          <div className="list">
            {marks.map(m => (
              <button key={m.route} className="list__item" onClick={() => onGo(m.route)}>
                <span className="list__label">{m.title}</span>
                <span className="list__meta">
                  {m.where ? `at ${m.where}` : 'at the beginning'}
                  {' · '}{new Date(m.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </button>
            ))}
          </div>
        ) : <p className="empty">Nothing yet. Open an hour and it will remember your place.</p>}
      </div>

      {recent.length > 0 && (
        <div className="sect">
          <div className="sect__head"><h3 className="sect__title">Recently prayed</h3></div>
          <div className="list">
            {recent.map(r => (
              <button key={r.route} className="list__item" onClick={() => onGo(r.route)}>
                <span className="list__label">{r.title}</span>
                <span className="list__meta">
                  {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

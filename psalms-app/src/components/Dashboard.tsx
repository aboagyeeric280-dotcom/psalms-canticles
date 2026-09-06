import { useMemo, useState } from 'react';
import {
  ROMAN, formatDate, isEveningBefore, liturgicalDay, suggestHour,
} from '../utils/liturgicalCalendar';
import { lastMark, loadRecent } from '../utils/storage';
import { keepsFirstVespers, liturgicalToday } from '../utils/generalCalendar';
import type { LiturgicalToday } from '../utils/generalCalendar';
import { officeForDay } from '../utils/officeForDay';
import { psalmsOf } from '../data/offices';
import { hourState, latinHour } from '../utils/hours';
import { COLOUR_NAMES } from '../data/sanctoral';
import DatePicker from './DatePicker';
import OptionalMemorials from './OptionalMemorials';

interface Props {
  onGo: (route: string) => void;
  viewed: Date;
  setViewed: (d: Date) => void;
  today: LiturgicalToday;
  onElect: (name: string | null) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  psalter: 'Psalter', festal: 'Festal', proper: 'Proper', common: 'Common', none: '—',
};

/** The desk: what is kept today, what is due now, and what is coming. */
export default function Dashboard({ onGo, viewed, setViewed, today, onElect }: Props) {
  const now = useMemo(() => new Date(), []);
  const [showPicker, setShowPicker] = useState(false);
  const lit = useMemo(() => liturgicalDay(viewed), [viewed]);
  const firstVespers = useMemo(() => keepsFirstVespers(viewed), [viewed]);
  const plan = useMemo(() => officeForDay(today, { firstVespers }), [today, firstVespers]);
  const isToday = viewed.toDateString() === now.toDateString();
  const suggestion = useMemo(() => suggestHour(now), [now]);
  const eveningBefore = isEveningBefore(now);
  const recent = useMemo(() => loadRecent(), []);
  const resume = useMemo(() => lastMark(), []);

  /* The hour that is due about now, and what it opens. */
  const currentHour = plan.hours.find(h => h.hour === suggestion.hour) ?? plan.hours[0];
  const currentRoute = eveningBefore && suggestion.hour === 'evening'
    ? `#/office/w${lit.week === 4 ? 1 : lit.week + 1}-sun-evening-before`
    : currentHour?.route ?? '#/';
  const currentLabel = eveningBefore && suggestion.hour === 'evening'
    ? 'First Vespers of Sunday'
    : currentHour?.label ?? suggestion.label;

  const psalms = useMemo(() => psalmsOf(currentRoute), [currentRoute]);
  const incipit = psalms[0]?.incipit ?? '';

  /* The next few days that are more than an ordinary weekday. */
  const upcoming = useMemo(() => {
    const out: { date: Date; title: string; rank: string; colour: string }[] = [];
    const d = new Date(viewed.getFullYear(), viewed.getMonth(), viewed.getDate());
    for (let i = 1; i <= 45 && out.length < 3; i++) {
      d.setDate(d.getDate() + 1);
      const l = liturgicalToday(new Date(d));
      const r = l.primary.rank;
      if (r === 'solemnity' || r === 'feast' || r === 'memorial') {
        out.push({ date: new Date(d), title: l.title, rank: l.primary.rankName, colour: l.colour });
      }
    }
    return out;
  }, [viewed]);

  return (
    <div className="dashwrap">
      {!isToday && (
        <button className="btn btn--ghost" style={{ marginBottom: '.9rem' }}
          onClick={() => setViewed(new Date())}>
          ← Back to today
        </button>
      )}

      <OptionalMemorials day={today} onElect={onElect} />

      <div className="dash">
        {/* ------------------------------------------------- the main column */}
        <div className="dash__main">
          <div className="sect__head">
            <h2 className="dash__h">The hours today</h2>
            <button className="linkbtn" onClick={() => onGo('#/psalter')}>Open the psalter</button>
          </div>

          <section className="card">
            <p className="note" style={{ marginTop: 0 }}>{plan.summary}</p>
            <div className="plan">
              {plan.hours.map(h => {
                const state = hourState(h.hour, suggestion.hour);
                return (
                  <button key={h.hour} className="plan__row" data-state={state}
                    onClick={() => onGo(h.route)}>
                    <span className="plan__tick" aria-hidden="true" />
                    <span className="plan__hour">
                      {h.label}
                      <small className="plan__latin">{latinHour(h.hour)}</small>
                    </span>
                    <span className="plan__what">
                      {h.detail}
                      {h.caveat && <em className="plan__caveat">{h.caveat}</em>}
                    </span>
                    <span className="plan__state">
                      {state === 'now' ? 'Now' : state === 'done' ? 'Earlier' : 'Later'}
                    </span>
                    <span className="plan__src">{SOURCE_LABEL[h.source]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="sect__head" style={{ marginTop: '1.6rem' }}>
            <h2 className="dash__h">Today’s feast</h2>
            <button className="linkbtn" onClick={() => onGo('#/calendar')}>Liturgical calendar</button>
          </div>

          <div className="dash__pair">
            <section className="card">
              <p className="card__kicker">{formatDate(lit.date)}</p>
              <h3 className="card__title">{today.title}</h3>
              <p className="litbar__meta" style={{ marginTop: '.55rem' }}>
                <span className={`badge badge--${today.primary.rank}`}>{today.primary.rankName}</span>
                <span className="badge badge--plain">Week {ROMAN[today.week]}</span>
                {today.day === 'sun' && <span className="badge badge--plain">Year {today.sundayCycle}</span>}
              </p>
              <p className="card__vesture">
                <span className="seasondot" data-colour={today.colour} aria-hidden="true" />
                {COLOUR_NAMES[today.colour]} vesture · {today.seasonName}
              </p>
              <button className="btn btn--ghost" style={{ marginTop: '.7rem' }}
                onClick={() => setShowPicker(true)}>
                Change date
              </button>
            </section>

            <section className="card card--forest">
              <p className="card__kicker">What is coming</p>
              {upcoming.length ? (
                <ul className="upcoming">
                  {upcoming.map((u, i) => (
                    <li key={i}>
                      <button onClick={() => setViewed(u.date)}>
                        <span className="upcoming__dot" data-colour={u.colour} aria-hidden="true" />
                        <span className="upcoming__name">{u.title}</span>
                        <span className="upcoming__when">
                          {u.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="card__muted">Ferial weekdays for the next several weeks.</p>}
            </section>
          </div>
        </div>

        {/* ------------------------------------------------- the side column */}
        <div className="dash__side">
          <div className="sect__head">
            <h2 className="dash__h">Now</h2>
            <button className="linkbtn" onClick={() => onGo('#/compline')}>Compline</button>
          </div>

          <section className="card card--hero">
            <p className="hero__eyebrow">{suggestion.reason}</p>
            <h3 className="hero__hour">{currentLabel}</h3>
            {latinHour(currentHour?.hour ?? '') && (
              <p className="hero__latin">{latinHour(currentHour?.hour ?? '')}</p>
            )}
            {incipit && <p className="hero__incipit">“{incipit}”</p>}
            <button className="btn btn--pray" onClick={() => onGo(currentRoute)}>Pray Now</button>
            {resume && resume.route !== currentRoute && (
              <button className="hero__resume" onClick={() => onGo(resume.route)}>
                Continue {resume.title}{resume.where ? ` — at ${resume.where}` : ''}
              </button>
            )}
          </section>

          <div className="sect__head" style={{ marginTop: '1.6rem' }}>
            <h2 className="dash__h">Today’s psalms</h2>
            <button className="linkbtn" onClick={() => onGo(currentRoute)}>Open the hour</button>
          </div>

          <section className="card card--rows">
            {psalms.length ? psalms.map((p, i) => (
              <button key={i} className="psalmrow" onClick={() => onGo(currentRoute)}>
                <span className="psalmrow__ref">{p.ref}</span>
                {p.title && <span className="psalmrow__title">{p.title}</span>}
                <span className="psalmrow__incipit">{p.incipit}</span>
              </button>
            )) : <p className="card__muted">This hour takes its psalms from the proper.</p>}
          </section>

          {recent.length > 0 && (
            <>
              <div className="sect__head" style={{ marginTop: '1.6rem' }}>
                <h2 className="dash__h">Recently prayed</h2>
                <button className="linkbtn" onClick={() => onGo('#/bookmarks')}>All bookmarks</button>
              </div>
              <section className="card card--rows">
                {recent.slice(0, 4).map(r => (
                  <button key={r.route} className="psalmrow" onClick={() => onGo(r.route)}>
                    <span className="psalmrow__ref">{r.title}</span>
                    <span className="psalmrow__incipit">
                      {new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                    </span>
                  </button>
                ))}
              </section>
            </>
          )}
        </div>
      </div>

      <div className="sect" style={{ marginTop: '1.8rem' }}>
        <div className="sect__head"><h3 className="sect__title">The whole book</h3></div>
        <div className="list">
          {[
            ['#/dominican', 'Compline Supplements', 'Salve Regina, O Lumen, hymns, litany'],
            ['#/canticles', 'Canticles', 'Zechariah, Mary, Te Deum, Invitatory'],
            ['#/feasts/common', 'Evening Prayer — Common Feasts', 'Dedication, Mary, Apostles, Martyrs…'],
            ['#/feasts/proper', 'Evening Prayer — Proper Feasts', 'Christmas to Christ the King'],
            ['#/readings', 'Office of Readings', 'Weeks I–IV and seasonal psalms'],
            ['#/prayers', 'Weekly Prayers', 'Thirty-four collects'],
            ['#/tables', 'Psalms for Feast Days', 'The book’s own tables'],
            ['#/about', 'How to use this book', 'Order of the hours, psalm tones'],
          ].map(([route, label, meta]) => (
            <button key={route} className="list__item" onClick={() => onGo(route)}>
              <span className="list__label">{label}</span>
              <span className="list__meta">{meta}</span>
            </button>
          ))}
        </div>
      </div>

      {showPicker && (
        <DatePicker value={viewed} onPick={setViewed} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

import { useState } from 'react';
import OfficeReader from './OfficeReader';
import type { FocusMark } from './Blocks';
import readingsData from '../data/readings.json';
import indices from '../data/indices.json';
import {
  CANTICLES, DOMINICAN_BLOCKS, FEASTS, FEAST_BLOCKS, FRONT, MIDDAY_BLOCKS, PRAYERS,
  PRAYERS_BLOCKS,
} from '../data/pageBlocks';
import { ORDER_TABLE, SINGING_LEGEND } from '../data/ordinary';
import { ROMAN, DAY_NAMES, DAY_KEYS } from '../utils/liturgicalCalendar';
import type { ReadingsOffice } from '../types';
import type { Prefs } from '../utils/storage';

const READINGS = readingsData as { weekly: ReadingsOffice[]; seasonal: ReadingsOffice[] };
const IDX = indices as any;

export interface PageProps {
  season: string;
  prefs: Prefs;
  onGo: (r: string) => void;
  onProgress: (p: number) => void;
  /** A line arrived at by searching. */
  focus?: FocusMark | null;
}

/* ---------------------------------------------------------- gospel canticles */
export function CanticlePage(
  { which, setting = 0, ...p }: PageProps & { which: 'zechariah' | 'mary'; setting?: number },
) {
  const settings = CANTICLES[which];
  // A search names the setting it found the words in, and the route carries it.
  const [pick, setPick] = useState(() => Math.min(Math.max(0, setting), settings.length - 1));
  const chosen = settings[Math.min(pick, settings.length - 1)];

  const name = which === 'zechariah' ? 'Canticle of Zechariah' : 'Canticle of Mary';
  const latin = which === 'zechariah' ? 'Benedictus · Luke 1:68–79' : 'Magnificat · Luke 1:46–55';

  return (
    <OfficeReader
      {...p}
      kicker={which === 'zechariah' ? 'At Morning Prayer' : 'At Evening Prayer'}
      title={name}
      subtitle={latin}
      blocks={chosen?.blocks ?? []}
      idPrefix={`${which}-${pick}`}
      intro={
        <div className="blk">
          <p className="label" style={{ marginTop: 0 }}>Setting</p>
          <div className="chiprow">
            {settings.map((s, i) => (
              <button key={i} className="chip" aria-pressed={i === pick} onClick={() => setPick(i)}>
                {s.num ?? '·'}{s.label ? ` · ${s.label}` : ''}
              </button>
            ))}
          </div>
          <p className="rubric" style={{ marginTop: '1.2em' }}>
            {settings.length} settings.{which === 'zechariah' ? ' Four of them appear in the book only as engraved music; their score is printed beneath the text.' : ''}
          </p>
        </div>
      }
    />
  );
}

/* --------------------------------------------------------------- invitatory */
export function InvitatoryPage(p: PageProps) {
  return (
    <OfficeReader
      {...p}
      kicker="Before the first hour of the day"
      title="Invitatory"
      subtitle="Psalm 95, or 100, 67 or 24 — pages 9–11"
      blocks={CANTICLES.invitatory}
      idPrefix="inv"
    />
  );
}

export function TeDeumPage(p: PageProps) {
  return (
    <OfficeReader
      {...p}
      kicker="The Church’s Hymn of Praise"
      title="Te Deum"
      subtitle="Pages 12–13 — printed as engraved music"
      blocks={CANTICLES.teDeum}
      idPrefix="tedeum"
    />
  );
}

export function MiddayPage(p: PageProps) {
  return (
    <OfficeReader {...p} kicker="Terce · Sext · None" title="Midday Prayer"
      subtitle="Antiphons and hymns — pages 14–15" blocks={MIDDAY_BLOCKS} idPrefix="midday" />
  );
}

/* -------------------------------------------------------------- supplements */
export function DominicanPage(p: PageProps) {
  return (
    <OfficeReader {...p} kicker="Dominican use" title="Compline Supplements"
      subtitle="Salve Regina · O Lumen · hymns · suffrages · litany — pages 414–427"
      blocks={DOMINICAN_BLOCKS} idPrefix="dom" />
  );
}

/* ------------------------------------------------------------------ feasts */
export function FeastsPage({ which, ...p }: PageProps & { which: 'common' | 'proper' }) {
  return (
    <OfficeReader
      {...p}
      kicker="Evening Prayer"
      title={which === 'common' ? 'Common Feasts' : 'Proper Feasts'}
      subtitle={which === 'common'
        ? 'Dedication of a Church, Mary, Apostles, Martyrs, Holy Men, Holy Women — pages 286–297'
        : 'Christmas to Christ the King, in order of occurrence — pages 298–306'}
      blocks={FEAST_BLOCKS[which]}
      idPrefix={`feast-${which}`}
      intro={
        <p className="rubric blk">
          Cross-references such as “Ps 113, p. 286” point at the printed page; use the search
          button in the header to open that psalm where the app holds it.
        </p>
      }
    />
  );
}

/* --------------------------------------------------------- office of readings */
export function ReadingsIndexPage({ onGo }: PageProps) {
  const [week, setWeek] = useState<1 | 2 | 3 | 4>(1);
  const list = READINGS.weekly.filter(r => r.week === week);
  return (
    <div className="shell" style={{ paddingBottom: '4rem' }}>
      <section className="hero">
        <p className="hero__eyebrow">Meditation psalms</p>
        <h2 className="hero__title">Office of Readings</h2>
        <p className="hero__meta">Weeks I–IV, pages 307–397, with seasonal extended psalms</p>
      </section>

      <section className="sect">
        <div className="sect__head"><h3 className="sect__title">Week</h3></div>
        <div className="chiprow">
          {([1, 2, 3, 4] as const).map(w => (
            <button key={w} className="chip" aria-pressed={w === week} onClick={() => setWeek(w)}>
              Week {ROMAN[w]}
            </button>
          ))}
        </div>
      </section>

      <section className="sect">
        <div className="list">
          {DAY_KEYS.map(d => {
            const r = list.find(x => x.day === d);
            if (!r) return null;
            return (
              <button key={r.id} className="list__item" onClick={() => onGo(`#/readings/${r.id}`)}>
                <span className="list__label">{DAY_NAMES[d]}</span>
                <span className="list__meta">p. {r.page}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sect">
        <div className="sect__head"><h3 className="sect__title">Seasonal extended psalms</h3></div>
        <div className="list">
          {READINGS.seasonal.map(r => (
            <button key={r.id} className="list__item" onClick={() => onGo(`#/readings/${r.id}`)}>
              <span className="list__label">{r.title}</span>
              <span className="list__meta">p. {r.page}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- weekly prayers */
export function PrayersPage(p: PageProps) {
  return (
    <OfficeReader {...p} kicker="Concluding prayers" title="Weekly Prayers"
      subtitle={`${PRAYERS.weekly.length} collects for the weeks of the year — pages 428–431`}
      blocks={PRAYERS_BLOCKS} idPrefix="prayers" />
  );
}

/* ----------------------------------------------------------------- tables */
export function TablesPage({ onGo }: PageProps) {
  const sections = (() => {
    const bySection = new Map<string, any[]>();
    for (const row of FEASTS.table as any[]) {
      if (!bySection.has(row.section)) bySection.set(row.section, []);
      bySection.get(row.section)!.push(row);
    }
    return [...bySection.entries()];
  })();

  return (
    <div className="shell" style={{ paddingBottom: '4rem' }}>
      <section className="hero">
        <p className="hero__eyebrow">From the book’s own index</p>
        <h2 className="hero__title">Psalms for Feast Days</h2>
        <p className="hero__meta">Pages 437–439</p>
      </section>

      <p className="note">
        Page numbers are the book’s. Ferials and memorials take their psalms from the four-week
        cycle, which begins afresh on the first Sundays of Advent and Lent, on Easter Sunday and
        on the first ordinary Sunday of the year.
      </p>

      {sections.map(([name, rows]) => (
        <section className="sect" key={name}>
          <div className="sect__head"><h3 className="sect__title">{name}</h3></div>
          <div className="tablewrap">
            <table className="table">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} data-head={r.head ? '1' : '0'}>
                    {r.cells.map((c: string, j: number) => <td key={j}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="sect">
        <div className="sect__head"><h3 className="sect__title">Index of psalms and canticles</h3></div>
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Psalm</th><th>Page</th></tr></thead>
            <tbody>
              {IDX.psalms.map((e: any, i: number) => (
                <tr key={i}><td>{e.label}</td><td>{e.pages.join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sect">
        <div className="sect__head"><h3 className="sect__title">Canticles</h3></div>
        <div className="tablewrap">
          <table className="table">
            <tbody>
              {IDX.canticles.map((e: any, i: number) => (
                <tr key={i}><td>{e.label}</td><td>{e.pages.join(', ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <button className="btn" onClick={() => onGo('#/')}>Back to the dashboard</button>
    </div>
  );
}

/* ------------------------------------------------------------------ about */
export function AboutPage(p: PageProps) {
  return (
    <OfficeReader
      {...p}
      kicker="Front matter"
      title="How to use this book"
      subtitle="Foreword · the order of the hours · some psalm tones — pages 4–8"
      blocks={FRONT.blocks}
      idPrefix="front"
      intro={
        <section className="blk">
          <h3 className="h2">The order of the hours</h3>
          <div className="tablewrap" style={{ margin: '1em 0' }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  {ORDER_TABLE.columns.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {ORDER_TABLE.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rubric">{ORDER_TABLE.note}</p>

          <h3 className="h2">Singing symbols</h3>
          <div className="tablewrap" style={{ margin: '1em 0' }}>
            <table className="table">
              <tbody>
                {SINGING_LEGEND.map(([sym, meaning]) => (
                  <tr key={sym}><th style={{ whiteSpace: 'nowrap' }}>{sym}</th><td>{meaning}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      }
      outro={
        <section className="blk" style={{ marginTop: '3em' }}>
          <h3 className="h2">About this app</h3>
          <p className="para">{FRONT.meta.credits}</p>
          <p className="para" style={{ color: 'var(--ink-faint)', fontSize: '.85em' }}>
            {FRONT.meta.publisher}. {FRONT.meta.province}. The texts here are transcribed from
            the printed book; pages engraved as music are reproduced as images.
          </p>
        </section>
      }
    />
  );
}

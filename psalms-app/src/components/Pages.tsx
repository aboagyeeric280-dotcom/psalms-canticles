import { useMemo, useState } from 'react';
import OfficeReader from './OfficeReader';
import canticles from '../data/canticles.json';
import dominican from '../data/dominican.json';
import feasts from '../data/feasts.json';
import prayers from '../data/prayers.json';
import readingsData from '../data/readings.json';
import compline from '../data/compline.json';
import indices from '../data/indices.json';
import front from '../data/front.json';
import { ORDER_TABLE, SINGING_LEGEND } from '../data/ordinary';
import { ROMAN, DAY_NAMES, DAY_KEYS } from '../utils/liturgicalCalendar';
import type { Block, Group, ReadingsOffice } from '../types';
import type { Prefs } from '../utils/storage';

const CANT = canticles as any;
const DOM = dominican as { groups: Group[]; litany: { c: string; text: string }[] };
const FEASTS = feasts as { common: Group[]; proper: Group[]; table: any[] };
const PRAYERS = prayers as { weekly: { n: number; lines: string[] }[]; goodFriday: Block[] };
const READINGS = readingsData as { weekly: ReadingsOffice[]; seasonal: ReadingsOffice[] };
const IDX = indices as any;
const COMPLINE_SUPP = (compline as any).supplementary as Block[];
const FRONT = front as unknown as { blocks: Block[]; meta: Record<string, string> };

export interface PageProps {
  season: string;
  prefs: Prefs;
  onGo: (r: string) => void;
  onProgress: (p: number) => void;
}

const flat = (groups: Group[]): Block[] =>
  groups.flatMap(g => [
    ...(g.title ? [{ k: 'head', text: g.title, level: 1 } as Block] : []),
    ...g.blocks,
  ]);

/* ---------------------------------------------------------- gospel canticles */
export function CanticlePage({ which, ...p }: PageProps & { which: 'zechariah' | 'mary' }) {
  const settings = (which === 'zechariah' ? CANT.zechariah : CANT.mary) as
    { num: number | null; label: string; blocks: Block[] }[];
  const [pick, setPick] = useState(0);
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
      blocks={CANT.invitatory}
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
      blocks={CANT.teDeum}
      idPrefix="tedeum"
    />
  );
}

export function MiddayPage(p: PageProps) {
  const blocks = useMemo<Block[]>(() => [
    { k: 'head', text: 'Some Antiphons for Midday', level: 1 },
    ...CANT.midday.antiphons,
    { k: 'head', text: 'Hymns for Midday', level: 1 },
    ...CANT.midday.hymns,
  ], []);
  return (
    <OfficeReader {...p} kicker="Terce · Sext · None" title="Midday Prayer"
      subtitle="Antiphons and hymns — pages 14–15" blocks={blocks} idPrefix="midday" />
  );
}

/* -------------------------------------------------------------- supplements */
export function DominicanPage(p: PageProps) {
  const blocks = useMemo<Block[]>(() => {
    // The Salve Regina, O Lumen and the suffrage for the dead are printed at
    // the end of Compline itself (pp. 413–414); the rest follows from p. 414.
    const invocations = DOM.litany.filter(l => l.c === '');
    const litany: Block[] = [
      { k: 'head', text: 'Litany of the Blessed Virgin', level: 1 },
      { k: 'rubric', text: 'Litany of Loreto — the invocations are answered “pray for us”.' },
      { k: 'vr', items: DOM.litany.filter(l => l.c !== '').map(l => ({ c: l.c, text: l.text })) },
      ...(invocations.length
        ? [{ k: 'text', paras: [invocations.map(l => ({ t: l.text, i: 0 as const }))] } as Block]
        : []),
    ];
    return [
      ...COMPLINE_SUPP,
      ...flat(DOM.groups),
      ...litany,
    ];
  }, []);

  return (
    <OfficeReader {...p} kicker="Dominican use" title="Compline Supplements"
      subtitle="Salve Regina · O Lumen · hymns · suffrages · litany — pages 414–427"
      blocks={blocks} idPrefix="dom" />
  );
}

/* ------------------------------------------------------------------ feasts */
export function FeastsPage({ which, ...p }: PageProps & { which: 'common' | 'proper' }) {
  const groups = which === 'common' ? FEASTS.common : FEASTS.proper;
  return (
    <OfficeReader
      {...p}
      kicker="Evening Prayer"
      title={which === 'common' ? 'Common Feasts' : 'Proper Feasts'}
      subtitle={which === 'common'
        ? 'Dedication of a Church, Mary, Apostles, Martyrs, Holy Men, Holy Women — pages 286–297'
        : 'Christmas to Christ the King, in order of occurrence — pages 298–306'}
      blocks={flat(groups)}
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
  const blocks = useMemo<Block[]>(() => [
    { k: 'head', text: 'Weekly Prayers', level: 1 },
    ...PRAYERS.weekly.map<Block>(w => ({
      k: 'text',
      paras: [[{ t: `${w.n}.  ${w.lines[0] ?? ''}`, i: 0 }, ...w.lines.slice(1).map(l => ({ t: l, i: 1 as const }))]],
    })),
    { k: 'head', text: 'Morning Intercessions — Good Friday and Holy Saturday', level: 1 },
    ...PRAYERS.goodFriday,
  ], []);
  return (
    <OfficeReader {...p} kicker="Concluding prayers" title="Weekly Prayers"
      subtitle={`${PRAYERS.weekly.length} collects for the weeks of the year — pages 428–431`}
      blocks={blocks} idPrefix="prayers" />
  );
}

/* ----------------------------------------------------------------- tables */
export function TablesPage({ onGo }: PageProps) {
  const sections = useMemo(() => {
    const bySection = new Map<string, any[]>();
    for (const row of FEASTS.table) {
      if (!bySection.has(row.section)) bySection.set(row.section, []);
      bySection.get(row.section)!.push(row);
    }
    return [...bySection.entries()];
  }, []);

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

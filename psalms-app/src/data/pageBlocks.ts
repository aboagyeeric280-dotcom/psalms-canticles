/* Every text the app can open, assembled once and shared.

   The reader components used to build their own block lists inline. The
   search index has to walk exactly the same lists — a result's anchor is a
   block index, and an index off by one drops the reader on the wrong verse —
   so the assembly moved here and the components import it from one place. */

import canticles from './canticles.json';
import complineData from './compline.json';
import dominican from './dominican.json';
import feasts from './feasts.json';
import prayers from './prayers.json';
import front from './front.json';
import { OFFICES, READINGS } from './offices';
import { DAY_KEYS, DAY_NAMES } from '../utils/liturgicalCalendar';
import type { Block, DayKey, Group, ReadingsOffice } from '../types';

/* ------------------------------------------------------------ raw shapes */

export interface ComplineData {
  opening: Block[];
  days: { key: DayKey; title: string; blocks: Block[] }[];
  readings: { key: string; day: string; ref: string; blocks: Block[] }[];
  responsory: Block[];
  simeon: Block[];
  collects: { key: string; blocks: Block[] }[];
  blessing: Block[];
  supplementary: Block[];
}

export interface CanticleSetting { num: number | null; label: string; blocks: Block[] }

interface CanticleData {
  zechariah: CanticleSetting[];
  mary: CanticleSetting[];
  invitatory: Block[];
  teDeum: Block[];
  midday: { antiphons: Block[]; hymns: Block[] };
}

export const COMPLINE = complineData as unknown as ComplineData;
export const CANTICLES = canticles as unknown as CanticleData;
export const FEASTS = feasts as unknown as { common: Group[]; proper: Group[]; table: unknown[] };
export const DOMINICAN = dominican as unknown as {
  groups: Group[]; litany: { c: string; text: string }[];
};
export const PRAYERS = prayers as unknown as {
  weekly: { n: number; lines: string[] }[]; goodFriday: Block[];
};
export const FRONT = front as unknown as { blocks: Block[]; meta: Record<string, string> };

/** A group's own title becomes a heading, so the group reads as one text. */
export const flat = (groups: Group[]): Block[] =>
  groups.flatMap(g => [
    ...(g.title ? [{ k: 'head', text: g.title, level: 1 } as Block] : []),
    ...g.blocks,
  ]);

/* --------------------------------------------------------------- compline */

const COLLECT_KEY: Record<DayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

/** Compline for one evening, in the order the book prints it. */
export function complineBlocks(day: DayKey, solemn: boolean): Block[] {
  const psalmSetKey: DayKey = solemn ? (day === 'sat' ? 'sat' : 'sun') : day;
  const psalms = COMPLINE.days.find(d => d.key === psalmSetKey)?.blocks ?? [];
  const reading = COMPLINE.readings.find(r => r.key === day.toLowerCase());
  const collect = COMPLINE.collects.find(c => c.key === (solemn ? 'Solemn Feasts' : COLLECT_KEY[day]))
    ?? COMPLINE.collects.find(c => c.key === COLLECT_KEY[day]);

  const head = (text: string): Block => ({ k: 'head', text, level: 1 });

  return [
    head('Opening Prayers'),
    ...COMPLINE.opening,
    head('Psalmody'),
    ...psalms,
    head('Short Reading'),
    ...(reading
      ? [{ k: 'reading', day: reading.day, ref: reading.ref } as Block, ...reading.blocks]
      : []),
    head('Responsory'),
    ...COMPLINE.responsory,
    head('Canticle of Simeon'),
    ...COMPLINE.simeon,
    head('Prayer'),
    ...(collect?.blocks ?? []),
    head('Blessing'),
    ...COMPLINE.blessing,
  ];
}

/** The id prefix Compline renders under, which its anchors are built from. */
export const complinePrefix = (day: DayKey, solemn: boolean) =>
  `compline-${day}-${solemn ? 's' : 'f'}`;

/* ------------------------------------------------- the standing text pages */

export const MIDDAY_BLOCKS: Block[] = [
  { k: 'head', text: 'Some Antiphons for Midday', level: 1 },
  ...CANTICLES.midday.antiphons,
  { k: 'head', text: 'Hymns for Midday', level: 1 },
  ...CANTICLES.midday.hymns,
];

export const DOMINICAN_BLOCKS: Block[] = (() => {
  // The Salve Regina, O Lumen and the suffrage for the dead are printed at
  // the end of Compline itself (pp. 413–414); the rest follows from p. 414.
  const invocations = DOMINICAN.litany.filter(l => l.c === '');
  const litany: Block[] = [
    { k: 'head', text: 'Litany of the Blessed Virgin', level: 1 },
    { k: 'rubric', text: 'Litany of Loreto — the invocations are answered “pray for us”.' },
    { k: 'vr', items: DOMINICAN.litany.filter(l => l.c !== '').map(l => ({ c: l.c, text: l.text })) },
    ...(invocations.length
      ? [{ k: 'text', paras: [invocations.map(l => ({ t: l.text, i: 0 as const }))] } as Block]
      : []),
  ];
  return [...COMPLINE.supplementary, ...flat(DOMINICAN.groups), ...litany];
})();

export const PRAYERS_BLOCKS: Block[] = [
  { k: 'head', text: 'Weekly Prayers', level: 1 },
  ...PRAYERS.weekly.map<Block>(w => ({
    k: 'text',
    paras: [[
      { t: `${w.n}.  ${w.lines[0] ?? ''}`, i: 0 },
      ...w.lines.slice(1).map(l => ({ t: l, i: 1 as const })),
    ]],
  })),
  { k: 'head', text: 'Morning Intercessions — Good Friday and Holy Saturday', level: 1 },
  ...PRAYERS.goodFriday,
];

export const FEAST_BLOCKS: Record<'common' | 'proper', Block[]> = {
  common: flat(FEASTS.common),
  proper: flat(FEASTS.proper),
};

/* ------------------------------------------------------ the whole book, listed */

/** One openable page: where it lives, what it renders, and under which
    anchors. `where` is the line a search result prints under its match. */
export interface Source {
  route: string;
  idPrefix: string;
  where: string;
  blocks: Block[];
}

/** Every page the router serves, in the order the book runs. Built lazily:
    nothing but the search index needs the whole book at once. */
let cached: Source[] | null = null;

export function allSources(): Source[] {
  if (cached) return cached;
  const out: Source[] = [];

  for (const o of OFFICES) {
    out.push({ route: `#/office/${o.id}`, idPrefix: o.id, where: o.title, blocks: o.blocks });
  }
  for (const r of READINGS as ReadingsOffice[]) {
    out.push({
      route: `#/readings/${r.id}`,
      idPrefix: r.id,
      where: `Office of Readings — ${r.title}`,
      blocks: r.blocks,
    });
  }
  for (const day of DAY_KEYS) {
    out.push({
      route: `#/compline/${day}`,
      idPrefix: complinePrefix(day, false),
      where: `Compline — ${DAY_NAMES[day]}`,
      blocks: complineBlocks(day, false),
    });
  }
  for (const which of ['zechariah', 'mary'] as const) {
    const name = which === 'zechariah' ? 'Canticle of Zechariah' : 'Canticle of Mary';
    CANTICLES[which].forEach((s, i) => {
      out.push({
        route: `#/canticle/${which}/${i}`,
        idPrefix: `${which}-${i}`,
        where: `${name} — setting ${s.num ?? i + 1}${s.label ? ` · ${s.label}` : ''}`,
        blocks: s.blocks,
      });
    });
  }
  out.push({ route: '#/invitatory', idPrefix: 'inv', where: 'Invitatory', blocks: CANTICLES.invitatory });
  out.push({ route: '#/te-deum', idPrefix: 'tedeum', where: 'Te Deum', blocks: CANTICLES.teDeum });
  out.push({ route: '#/midday-hymns', idPrefix: 'midday', where: 'Midday Prayer', blocks: MIDDAY_BLOCKS });
  out.push({ route: '#/dominican', idPrefix: 'dom', where: 'Compline Supplements', blocks: DOMINICAN_BLOCKS });
  out.push({ route: '#/feasts/common', idPrefix: 'feast-common', where: 'Common Feasts', blocks: FEAST_BLOCKS.common });
  out.push({ route: '#/feasts/proper', idPrefix: 'feast-proper', where: 'Proper Feasts', blocks: FEAST_BLOCKS.proper });
  out.push({ route: '#/prayers', idPrefix: 'prayers', where: 'Weekly Prayers', blocks: PRAYERS_BLOCKS });
  out.push({ route: '#/about', idPrefix: 'front', where: 'How to use this book', blocks: FRONT.blocks });

  cached = out;
  return out;
}

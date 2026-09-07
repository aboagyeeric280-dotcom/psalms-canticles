/* Searching the whole book.

   The old search read the psalm index: references, titles, and the name of
   the hour. That found "Psalm 63" and nothing else — a half-remembered line
   found nothing at all, and every result landed the reader at the top of a
   long office to scroll for the psalm.

   This reads the text itself. Every line of every psalm, canticle, antiphon,
   hymn, collect and rubric the app can open becomes one searchable unit that
   knows where it is printed and which line of which strophe it is, so a hit
   can be opened exactly where it stands.

   The index is built from `allSources()`, the same block lists the reader
   components render, so an anchor here is always an anchor there. */

import { allSources, type Source } from '../data/pageBlocks';
import type { Block } from '../types';

/* ------------------------------------------------------------ normalising */

/** What the matcher compares: unpointed, unaccented, lower case, one space
    between words. Apostrophes close up, so "God's" and "Gods" are one word;
    the tone slashes, the flex asterisk and the dagger fall away with the
    rest of the punctuation, so a phrase typed plainly still matches a
    pointed line. */
export function normalise(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when `needle` begins a word of `hay`; both already normalised. */
function atWordStart(hay: string, needle: string, from = 0): number {
  let at = hay.indexOf(needle, from);
  while (at > 0 && hay[at - 1] !== ' ') at = hay.indexOf(needle, at + 1);
  return at;
}

/* ----------------------------------------------------------------- units */

export type Kind = 'psalm' | 'canticle' | 'antiphon' | 'prayer' | 'rubric';
export type Filter = 'all' | Kind;

export const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'psalm', label: 'Psalms' },
  { key: 'canticle', label: 'Canticles' },
  { key: 'antiphon', label: 'Antiphons' },
  { key: 'prayer', label: 'Prayers' },
  { key: 'rubric', label: 'Rubrics' },
];

export interface Unit {
  /** The page it is printed on and the block it belongs to. */
  route: string;
  anchor: string;
  where: string;
  /** Where the page falls in the book, so equal answers keep book order. */
  seq: number;
  kind: Kind;
  /** A thing's own heading, rather than a line inside it. */
  head: boolean;
  /** The text as printed, tone marks and all. */
  text: string;
  /** The same text, normalised, which is what the matcher reads. */
  n: string;
  /** The psalm or canticle this line belongs to, when it belongs to one. */
  ref?: string;
  num?: number;
  title?: string;
  /** Which row: strophe and line for verse, row index for antiphons and
      versicles. This is what lets the reader open on the line itself. */
  s?: number;
  l?: number;
  /** A whole strophe, read as one run of words. The book breaks its verses
      where the singing breaks them, and a reader who remembers a phrase does
      not remember where the line ended — so each strophe is searchable whole
      as well as line by line. */
  span?: boolean;
  /** Where each line of the strophe begins in `n`, so a match found across
      the whole can still name the line it started on. */
  starts?: number[];
}

/** The line of a spanning unit that the match at `at` begins on. */
function lineAt(u: Unit, at: number): number | undefined {
  if (!u.starts) return u.l;
  let i = 0;
  while (i + 1 < u.starts.length && u.starts[i + 1] <= at) i++;
  return i;
}

/** The verses a psalm block carries, read off its printed reference. */
function verseRange(ref: string): [number, number] | null {
  const m = /:\s*(\d{1,3})\s*[-–]\s*(\d{1,3})/.exec(ref);
  if (m) return [Number(m[1]), Number(m[2])];
  const one = /:\s*(\d{1,3})/.exec(ref);
  return one ? [Number(one[1]), Number(one[1])] : null;
}

/** Add the strophe as one searchable run, remembering where its lines fall. */
function addSpan(
  out: Unit[],
  base: { route: string; anchor: string; where: string; seq: number },
  ctx: Partial<Unit> & { kind: Kind; head: boolean },
  lines: { t: string }[],
  s: number,
) {
  if (lines.length < 2) return;
  const starts: number[] = [];
  let n = '';
  for (let i = 0; i < lines.length; i++) {
    const part = normalise(lines[i].t);
    if (!part) { starts[i] = n.length; continue; }
    if (n) n += ' ';
    starts[i] = n.length;
    n += part;
  }
  if (!n) return;
  out.push({ ...base, ...ctx, text: lines.map(l => l.t).join(' '), n, s, l: 0, span: true, starts });
}

function unitsOfBlock(b: Block, anchor: string, src: Source, seq: number, out: Unit[]) {
  const base = { route: src.route, anchor, where: src.where, seq };
  const add = (u: Omit<Unit, 'n' | 'route' | 'anchor' | 'where' | 'seq'>) => {
    if (!u.text.trim()) return;
    out.push({ ...base, ...u, n: normalise(u.text) });
  };

  switch (b.k) {
    case 'head':
      add({ kind: 'rubric', head: true, text: b.text });
      break;

    case 'label':
      add({ kind: 'rubric', head: true, text: b.note ? `${b.text} (${b.note})` : b.text });
      break;

    case 'ant':
      b.items.forEach((it, j) =>
        add({ kind: 'antiphon', head: false, text: it.text, title: it.label, s: j }));
      break;

    case 'psalm':
    case 'cant': {
      const kind: Kind = b.k === 'psalm' ? 'psalm' : 'canticle';
      const num = b.k === 'psalm' ? b.num : undefined;
      const title = b.sectionTitle || b.title;
      const ctx = { kind, ref: b.ref, num, title };
      // The heading, so "Psalm 23" and "The Lord Is My Shepherd" both land.
      add({
        ...ctx, head: true,
        text: [b.ref, b.section, title, b.alt].filter(Boolean).join(' · '),
      });
      if (b.note) add({ ...ctx, head: false, text: b.note });
      b.strophes.forEach((st, si) => {
        st.forEach((line, li) => add({ ...ctx, head: false, text: line.t, s: si, l: li }));
        addSpan(out, base, { ...ctx, head: false }, st, si);
      });
      break;
    }

    case 'text':
      b.paras.forEach((p, si) => {
        p.forEach((line, li) => add({ kind: 'prayer', head: false, text: line.t, s: si, l: li }));
        addSpan(out, base, { kind: 'prayer', head: false }, p, si);
      });
      break;

    case 'vr':
      b.items.forEach((it, j) =>
        add({ kind: 'prayer', head: false, text: it.text, title: it.c, s: j }));
      break;

    case 'rubric':
    case 'ref':
      add({ kind: 'rubric', head: false, text: b.text });
      break;

    case 'reading':
      add({ kind: 'rubric', head: true, text: `${b.day} — ${b.ref}` });
      break;

    case 'setting':
      add({
        kind: 'rubric', head: true,
        text: `${b.name}${b.num ? ` ${b.num}` : ''}${b.note ? ` — ${b.note}` : ''}`,
      });
      break;

    case 'plate':
      if (b.caption) add({ kind: 'rubric', head: false, text: b.caption });
      break;
  }
}

export interface Index {
  units: Unit[];
  /** Every psalm heading in the book, by psalm number. */
  byNumber: Map<number, Unit[]>;
  /** Every word in the book, for finding near spellings. */
  vocabulary: Set<string>;
  /** How many lines hold each word. "Babylon" is worth more than "waters",
      and the loose search leans on the difference. */
  frequency: Map<string, number>;
}

let index: Index | null = null;

/** Build the index, or hand back the one already built. Roughly a tenth of a
    second once, then never again for the life of the page. */
export function getIndex(): Index {
  if (index) return index;
  const units: Unit[] = [];
  allSources().forEach((src, seq) => {
    src.blocks.forEach((b, i) => unitsOfBlock(b, `${src.idPrefix}-b${i}`, src, seq, units));
  });
  const byNumber = new Map<number, Unit[]>();
  const vocabulary = new Set<string>();
  const frequency = new Map<string, number>();
  for (const u of units) {
    if (u.head && u.num) {
      if (!byNumber.has(u.num)) byNumber.set(u.num, []);
      byNumber.get(u.num)!.push(u);
    }
    if (u.span) continue;                    // a strophe would count its lines twice
    for (const w of new Set(u.n.split(' '))) {
      if (w.length > 2) vocabulary.add(w);
      frequency.set(w, (frequency.get(w) ?? 0) + 1);
    }
  }
  index = { units, byNumber, vocabulary, frequency };
  return index;
}

/* --------------------------------------------------------- reading a query */

export interface Query {
  raw: string;
  /** The whole query, normalised — what an exact phrase match looks for. */
  phrase: string;
  words: string[];
  /** Quoted: nothing but the literal phrase counts. */
  strict: boolean;
  /** "Psalm 23", "119:105", or a bare number. */
  psalm?: { num: number; verse?: number };
}

const REFERENCE =
  /^(?:psalms?|ps)?\s*\.?\s*(\d{1,3})(?:\s*(?::|\.|\s+vv?\.?|\s+verses?)\s*(\d{1,3}))?(?:\s*[-–,]\s*\d{1,3})?\s*$/;

export function parseQuery(raw: string): Query {
  const trimmed = raw.trim();
  const quoted = /^"(.*)"$/.exec(trimmed) ?? /^“(.*)”$/.exec(trimmed);
  const body = quoted ? quoted[1] : trimmed;
  const phrase = normalise(body);
  const words = phrase.split(' ').filter(Boolean);

  const q: Query = { raw: trimmed, phrase, words, strict: !!quoted };

  const m = REFERENCE.exec(body.trim().toLowerCase());
  if (m) q.psalm = { num: Number(m[1]), verse: m[2] ? Number(m[2]) : undefined };
  return q;
}

/* ------------------------------------------------------------- the search */

export type Mode = 'reference' | 'phrase' | 'words' | 'near' | 'loose';

export interface Hit {
  unit: Unit;
  score: number;
  /** What to pick out in the text once the reader is there. */
  terms: string[];
  /** The line the match began on, when the unit is a whole strophe. */
  l?: number;
}

export interface Group {
  key: string;
  best: Hit;
  /** The same words printed elsewhere in the book. */
  others: Hit[];
}

export interface Outcome {
  groups: Group[];
  /** Places found, counting repeats. */
  total: number;
  mode: Mode | null;
  /** Set when the near-spelling pass answered instead of the words typed. */
  didYouMean?: string;
}

const KIND_WEIGHT: Record<Kind, number> = {
  psalm: 6, canticle: 5, antiphon: 3, prayer: 2, rubric: 0,
};

interface Match { score: number; at: number }

/** Where the unit answers `phrase`, and how squarely. */
function matchPhrase(u: Unit, phrase: string): Match | null {
  const n = u.n;
  let score: number;
  let at: number;
  if (n === phrase) { score = 100; at = 0; }
  else {
    // Padded, so a phrase is matched on whole words without a costly regex.
    const found = ` ${n} `.indexOf(` ${phrase} `);
    if (found === 0) { score = 92; at = 0; }            // it begins the line
    else if (found > 0) { score = 86; at = found; }
    else {
      const start = atWordStart(n, phrase);
      if (start >= 0) { score = 74; at = start; }       // the start of a word
      else {
        const inside = n.indexOf(phrase);
        if (inside < 0) return null;
        score = 56; at = inside;                        // inside one
      }
    }
  }
  return { score: score + weight(u), at };
}

/** Where the unit holds every one of `words`, in whatever order. */
function matchWords(u: Unit, words: string[]): Match | null {
  const n = u.n;
  let at = Infinity;
  for (const w of words) {
    const found = atWordStart(n, w);
    if (found < 0) return null;
    if (found < at) at = found;
  }
  // The shorter passage holding every word is the tighter answer.
  const tightness = Math.max(0, 20 - Math.floor(n.length / 24));
  return { score: 40 + tightness + weight(u), at: at === Infinity ? 0 : at };
}

/** What kind of text this is worth, and how precisely it points. */
function weight(u: Unit): number {
  return KIND_WEIGHT[u.kind] + (u.head ? 8 : 0) - (u.span ? 2 : 0);
}

/* Words that carry no weight of their own in a search: every psalm is full
   of them, and a line that holds only these has answered nothing. */
const COMMON = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'have',
  'he', 'her', 'him', 'his', 'i', 'in', 'is', 'it', 'me', 'my', 'not', 'o', 'of',
  'on', 'or', 'our', 'shall', 'she', 'that', 'the', 'their', 'them', 'they',
  'to', 'us', 'was', 'we', 'will', 'with', 'you', 'your',
]);

/** Words in the book within one or two letters of `word`. */
function nearWords(word: string, vocabulary: Set<string>): string[] {
  const allow = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
  if (!allow) return [word];
  const out = [word];
  for (const cand of vocabulary) {
    if (cand === word) continue;
    if (Math.abs(cand.length - word.length) > allow) continue;
    if (cand[0] !== word[0]) continue;              // typists rarely miss the first letter
    if (distance(word, cand, allow) <= allow) out.push(cand);
  }
  return out;
}

/** Levenshtein, abandoned as soon as it passes `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length];
}

/** One answer per strophe. A phrase can match a line and the strophe that
    holds it; the reader is owed the more precise of the two, once. */
function tighten(hits: Hit[]): Hit[] {
  const best = new Map<string, Hit>();
  for (const h of hits) {
    const u = h.unit;
    const key = `${u.route}|${u.anchor}|${u.s ?? 'x'}|${u.head ? 'h' : ''}`;
    const held = best.get(key);
    if (!held || h.score > held.score) best.set(key, h);
  }
  return [...best.values()];
}

/** Hits that are the same words in the same psalm are one answer with
    several addresses; the reader wants the text, not the repetition. */
function group(hits: Hit[]): Group[] {
  const groups = new Map<string, Group>();
  for (const h of hits) {
    const key = `${h.unit.kind}|${h.unit.ref ?? ''}|${h.unit.head ? 'h' : ''}${h.unit.n}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { key, best: h, others: [] });
    else if (h.score > g.best.score) { g.others.push(g.best); g.best = h; }
    else g.others.push(h);
  }
  return [...groups.values()].sort((a, b) =>
    b.best.score - a.best.score ||
    b.others.length - a.others.length ||
    a.best.unit.seq - b.best.unit.seq);
}

const LIMIT = 80;

export function search(raw: string, filter: Filter = 'all'): Outcome {
  const q = parseQuery(raw);
  if (!q.phrase) return { groups: [], total: 0, mode: null };

  const idx = getIndex();
  const pool = filter === 'all' ? idx.units : idx.units.filter(u => u.kind === filter);
  const hits: Hit[] = [];
  let mode: Mode | null = null;

  /* A bare reference — "23", "Psalm 119", "119:105" — is a lookup, not a
     search. The psalm's own headings answer it, and a verse number picks the
     section that prints that verse. */
  if (q.psalm && (filter === 'all' || filter === 'psalm')) {
    const heads = idx.byNumber.get(q.psalm.num) ?? [];
    for (const u of heads) {
      const range = u.ref ? verseRange(u.ref) : null;
      const covers = q.psalm.verse == null || !range ||
        (q.psalm.verse >= range[0] && q.psalm.verse <= range[1]);
      hits.push({ unit: u, score: covers ? 100 : 70, terms: [] });
    }
    if (hits.length) mode = 'reference';
  }

  if (!hits.length || !q.psalm) {
    for (const u of pool) {
      const m = matchPhrase(u, q.phrase);
      if (m) hits.push({ unit: u, score: m.score, terms: [q.phrase], l: lineAt(u, m.at) });
    }
    if (hits.length && !mode) mode = 'phrase';
  }

  // Every word, in any order — the way a half-remembered line is typed.
  if (!hits.length && !q.strict && q.words.length > 1) {
    for (const u of pool) {
      const m = matchWords(u, q.words);
      if (m) hits.push({ unit: u, score: m.score, terms: q.words, l: lineAt(u, m.at) });
    }
    if (hits.length) mode = 'words';
  }

  // Still nothing: allow a letter or two of misspelling.
  let didYouMean: string | undefined;
  if (!hits.length && !q.strict) {
    const expanded = q.words.map(w => nearWords(w, idx.vocabulary));
    if (expanded.some((list, i) => list.length > 1 || list[0] !== q.words[i])) {
      for (const u of pool) {
        const terms: string[] = [];
        let at = Infinity;
        let ok = true;
        for (const list of expanded) {
          const found = list.find(w => atWordStart(u.n, w) >= 0);
          if (!found) { ok = false; break; }
          terms.push(found);
          at = Math.min(at, atWordStart(u.n, found));
        }
        if (ok) hits.push({ unit: u, score: 30 + weight(u), terms, l: lineAt(u, at) });
      }
      if (hits.length) {
        mode = 'near';
        didYouMean = hits[0].terms.join(' ');
      }
    }
  }

  /* Nothing matched whole. Answer with the lines that hold most of what was
     typed — the reader who half-remembers a line is better served by the
     nearest verse than by an empty sheet. */
  if (!hits.length && !q.strict && q.words.length > 1) {
    const telling = q.words.filter(w => !COMMON.has(w));
    const needed = Math.max(1, Math.ceil(telling.length / 2));
    if (telling.length) {
      // A word the book uses twice says far more than one it uses everywhere.
      const worth = new Map(telling.map(w =>
        [w, Math.log(idx.units.length / (1 + (idx.frequency.get(w) ?? 0)))]));
      const whole = telling.reduce((t, w) => t + worth.get(w)!, 0) || 1;

      for (const u of pool) {
        const terms: string[] = [];
        let at = Infinity;
        let got = 0;
        for (const w of telling) {
          const found = atWordStart(u.n, w);
          if (found < 0) continue;
          terms.push(w);
          got += worth.get(w)!;
          at = Math.min(at, found);
        }
        if (terms.length < needed) continue;
        hits.push({
          unit: u,
          score: 10 + Math.round((got / whole) * 20) + weight(u),
          terms,
          l: lineAt(u, at === Infinity ? 0 : at),
        });
      }
      if (hits.length) mode = 'loose';
    }
  }

  if (!hits.length) return { groups: [], total: 0, mode: null };

  const tightened = tighten(hits);
  const groups = group(tightened);
  return { groups: groups.slice(0, LIMIT), total: tightened.length, mode, didYouMean };
}

/* ------------------------------------------------------- landmark answers */

/** Texts the book prints whole, which no psalm number will reach. Searching
    for "Magnificat" ought to find the Canticle of Mary even though the word
    is nowhere in its verses. */
export interface Landmark {
  aliases: string[];
  ref: string;
  title: string;
  route: string;
  where: string;
}

export const LANDMARKS: Landmark[] = [
  {
    aliases: ['zechariah', 'benedictus', 'canticle of zechariah'],
    ref: 'Canticle of Zechariah', title: 'Benedictus',
    route: '#/canticle/zechariah', where: 'Nine settings · at Morning Prayer',
  },
  {
    aliases: ['mary', 'magnificat', 'canticle of mary'],
    ref: 'Canticle of Mary', title: 'Magnificat',
    route: '#/canticle/mary', where: 'Nine settings · at Evening Prayer',
  },
  {
    aliases: ['simeon', 'nunc dimittis', 'canticle of simeon'],
    ref: 'Canticle of Simeon', title: 'Nunc Dimittis',
    route: '#/compline', where: 'At Compline',
  },
  {
    aliases: ['te deum'], ref: 'Te Deum', title: 'The Church’s Hymn of Praise',
    route: '#/te-deum', where: 'Office of Readings',
  },
  {
    aliases: ['invitatory', 'venite'], ref: 'Invitatory', title: 'Psalm 95 with its antiphons',
    route: '#/invitatory', where: 'Before the first hour of the day',
  },
  {
    aliases: ['salve regina', 'o lumen', 'compline supplements'],
    ref: 'Compline Supplements', title: 'Salve Regina, O Lumen',
    route: '#/dominican', where: 'Dominican Compline',
  },
  {
    aliases: ['compline', 'night prayer', 'bedtime prayer'],
    ref: 'Compline', title: 'Bedtime Prayer',
    route: '#/compline', where: 'The last hour of the day',
  },
];

/** The landmark a query names outright, if it names one. */
export function landmarkFor(raw: string): Landmark | null {
  const q = normalise(raw);
  if (q.length < 2) return null;
  return LANDMARKS.find(c => c.aliases.some(
    a => a === q || (q.length >= 3 && a.startsWith(q)))) ?? null;
}

/* ---------------------------------------------------- where a hit is opened */

/** Everything the reader needs to open a hit exactly where it stands. */
export interface Target {
  route: string;
  anchor: string;
  s?: number;
  l?: number;
  /** Words to pick out of the text once there. */
  terms: string[];
  /** What was jumped to, for the announcement. */
  label: string;
}

export function targetOf(hit: Hit): Target {
  const u = hit.unit;
  return {
    route: u.route,
    anchor: u.anchor,
    s: u.s,
    l: hit.l ?? u.l,
    terms: hit.terms,
    label: u.ref ? `${u.ref}${u.title ? ` — ${u.title}` : ''}` : u.text.slice(0, 60),
  };
}

/* ------------------------------------------------------- marking a snippet */

export interface Frag { text: string; hit?: boolean }

/** Walk the printed text beside its normalised form so a match found in the
    one can be marked in the other, accents, apostrophes and pointing intact. */
function normWithMap(text: string): { n: string; map: number[] } {
  let n = '';
  const map: number[] = [];
  let space = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/[’‘'`]/.test(ch)) continue;
    const d = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()[0] ?? ' ';
    if (/[a-z0-9]/.test(d)) { n += d; map.push(i); space = false; }
    else if (!space) { n += ' '; map.push(i); space = true; }
  }
  while (n.endsWith(' ')) { n = n.slice(0, -1); map.pop(); }
  return { n, map };
}

/** Split `text` into runs, marking every place one of `terms` begins a word. */
export function markUp(text: string, terms: string[]): Frag[] {
  const wanted = terms.map(normalise).filter(Boolean);
  if (!wanted.length) return [{ text }];

  const { n, map } = normWithMap(text);
  const ranges: [number, number][] = [];
  for (const term of wanted) {
    let from = 0;
    for (;;) {
      const at = atWordStart(n, term, from);
      if (at < 0) break;
      const start = map[at];
      const end = (map[at + term.length - 1] ?? map[map.length - 1]) + 1;
      if (start != null && end != null) ranges.push([start, end]);
      from = at + Math.max(1, term.length);
    }
  }
  if (!ranges.length) return [{ text }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r] as [number, number]);
  }

  const out: Frag[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) out.push({ text: text.slice(at, a) });
    out.push({ text: text.slice(a, b), hit: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** A window of `text` around its first match, for a result that has to fit
    on one line of a phone. Nothing is reworded — only trimmed, with the
    ellipsis the reader expects where the trimming happened. */
export function snippet(text: string, terms: string[], max = 132): Frag[] {
  const frags = markUp(text, terms);
  if (text.length <= max) return frags;

  let at = 0;
  let start = 0;
  for (const f of frags) {
    if (f.hit) { start = at; break; }
    at += f.text.length;
  }

  const from = Math.max(0, start - 36);
  const to = Math.min(text.length, from + max);
  const out: Frag[] = [];
  let cursor = 0;
  for (const f of frags) {
    const a = Math.max(from, cursor);
    const b = Math.min(to, cursor + f.text.length);
    if (b > a) out.push({ text: text.slice(a, b), hit: f.hit });
    cursor += f.text.length;
  }
  if (from > 0 && out.length) out[0] = { ...out[0], text: `…${out[0].text.replace(/^\S*\s/, '')}` };
  if (to < text.length && out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, text: `${last.text.replace(/\s\S*$/, '')}…` };
  }
  return out;
}

import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import search from '../data/search.json';
import indices from '../data/indices.json';
import type { SearchEntry } from '../types';

const ENTRIES = search as SearchEntry[];
const PSALM_INDEX = (indices as unknown as {
  psalms: { label: string; num: number; pages: string[] }[];
}).psalms;

/** Destinations the book keeps whole, which the psalm index therefore never
    lists: the gospel canticles and the other sung texts. Searching for
    "Magnificat" ought to find something. */
interface Named { aliases: string[]; ref: string; title: string; route: string; where: string }

const NAMED: Named[] = [
  {
    aliases: ['zechariah', 'benedictus'], ref: 'Canticle of Zechariah', title: 'Benedictus',
    route: '#/canticle/zechariah', where: 'Nine settings · at Morning Prayer',
  },
  {
    aliases: ['mary', 'magnificat'], ref: 'Canticle of Mary', title: 'Magnificat',
    route: '#/canticle/mary', where: 'Nine settings · at Evening Prayer',
  },
  {
    aliases: ['simeon', 'nunc dimittis'], ref: 'Canticle of Simeon', title: 'Nunc Dimittis',
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
    aliases: ['salve regina', 'o lumen'], ref: 'Compline Supplements', title: 'Salve Regina, O Lumen',
    route: '#/dominican', where: 'Dominican Compline',
  },
];

interface Props { onClose: () => void; onGo: (route: string) => void }

/** Instant jump: type a psalm number ("51", "119:33"), a canticle name
    ("Magnificat"), or any word of a title. */
export default function IndexModal({ onClose, onGo }: Props) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  /* One obvious destination, offered straight away and bound to Enter. */
  const jump = useMemo(() => {
    if (!query) return null;

    const named = NAMED.find(c => c.aliases.some(
      a => a === query || (query.length >= 3 && a.startsWith(query))));
    if (named) return { ...named, also: 0 };

    // "63" and "119:33" both mean psalm 119; anything else is a word search.
    if (/^\d{1,3}(:[\d\s,–-]*)?$/.test(query)) {
      const n = Number(/^\d{1,3}/.exec(query)![0]);
      const hits = ENTRIES.filter(e => e.num === n);
      if (hits.length) {
        const h = hits[0];
        return { ref: h.ref, title: h.title || '', route: h.route, where: h.where, also: hits.length - 1 };
      }
    }
    return null;
  }, [query]);

  const results = useMemo(() => {
    if (!query) return [];
    const numeric = /^\d+$/.test(query);
    const scored = ENTRIES.map(e => {
      const ref = e.ref.toLowerCase();
      const title = (e.title || '').toLowerCase();
      let score = 0;
      if (numeric && e.num === Number(query)) score = 100;
      else if (ref.startsWith(`psalm ${query}`)) score = 90;
      else if (ref.includes(query)) score = 60;
      else if (title.includes(query)) score = 40;
      else if (e.where.toLowerCase().includes(query)) score = 20;
      return { e, score };
    }).filter(r => r.score > 0);

    // The whole texts join the list, so a name search is not a dead end.
    const named = NAMED
      .filter(c => c.aliases.some(a => a.includes(query) || query.includes(a)))
      .map(c => ({
        e: { t: 'canticle', ref: c.ref, title: c.title, route: c.route, where: c.where } as SearchEntry,
        score: 95,
      }));

    const all = [...named, ...scored];
    all.sort((a, b) => b.score - a.score || a.e.where.localeCompare(b.e.where));
    return all.slice(0, 60).map(r => r.e);
  }, [query]);

  const go = (route: string) => { onGo(route); onClose(); };

  const psalmNumbers = useMemo(() => {
    const byNum = new Map<number, string[]>();
    for (const e of PSALM_INDEX) {
      if (!byNum.has(e.num)) byNum.set(e.num, []);
      byNum.get(e.num)!.push(...e.pages);
    }
    return [...byNum.keys()].sort((a, b) => a - b);
  }, []);

  return (
    <Sheet title="Find a psalm" onClose={onClose}>
      <input
        className="search__input"
        type="search"
        placeholder="Psalm number, canticle name, or a word from the title…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && jump) { e.preventDefault(); go(jump.route); }
        }}
        inputMode="search"
        autoComplete="off"
        aria-label="Search"
      />

      {jump && (
        <button className="quickjump" onClick={() => go(jump.route)}>
          <span className="quickjump__kicker">Go straight to</span>
          <span className="quickjump__ref">
            {jump.ref}{jump.title ? <em> · {jump.title}</em> : null}
          </span>
          <span className="quickjump__where">
            {jump.where}{jump.also > 0 ? ` · and ${jump.also} more place${jump.also > 1 ? 's' : ''}` : ''}
          </span>
          <span className="quickjump__hint">Press Enter</span>
        </button>
      )}

      {query ? (
        results.length ? (
          <div style={{ marginTop: '.75rem' }}>
            {results.map((r, i) => (
              <button key={i} className="result" onClick={() => go(r.route)}>
                <span className="result__name">
                  {r.ref}{r.title ? <span style={{ opacity: .65 }}> · {r.title}</span> : null}
                </span>
                <span className="result__where">{r.where}</span>
              </button>
            ))}
          </div>
        ) : <p className="empty">Nothing found for “{q.trim()}”.</p>
      ) : (
        <>
          <p className="field__hint" style={{ margin: '1rem 0 .6rem' }}>
            Or pick a psalm by number — the numbers below are those the book’s index lists.
          </p>
          <div className="grid2">
            {psalmNumbers.map(n => (
              <button key={n} className="psalmbtn" onClick={() => setQ(String(n))}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

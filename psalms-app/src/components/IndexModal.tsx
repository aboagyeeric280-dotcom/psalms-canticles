import { useEffect, useMemo, useRef, useState } from 'react';
import Sheet from './Sheet';
import indices from '../data/indices.json';
import {
  FILTERS, getIndex, landmarkFor, search, snippet, targetOf,
  type Filter, type Group, type Hit, type Target, type Unit,
} from '../utils/search';
import { clearSearches, loadSearches, pushSearch } from '../utils/storage';

const PSALM_INDEX = (indices as unknown as {
  psalms: { label: string; num: number; pages: string[] }[];
}).psalms;

/** What a result is, in a word, when it has no reference of its own. */
const KIND_NAME: Record<Unit['kind'], string> = {
  psalm: 'Psalm', canticle: 'Canticle', antiphon: 'Antiphon',
  prayer: 'Prayer', rubric: 'Rubric',
};

/** The line printed above the results, saying how the answer was reached. */
const MODE_NOTE: Record<string, string> = {
  reference: 'By number',
  phrase: 'Printed exactly as you typed it',
  words: 'Every word, in another order',
  near: 'Nothing printed exactly — the nearest spelling',
  loose: 'Nothing printed exactly — the closest lines',
};

interface Props {
  onClose: () => void;
  /** Open a text at the exact line, with the words picked out. */
  onJump: (target: Target) => void;
}

/** Search the whole book: a phrase from any psalm, a psalm number, a verse
    reference, or the name of a canticle. Every answer opens on its own line
    rather than at the top of the hour that prints it. */
export default function IndexModal({ onClose, onJump }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [opened, setOpened] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(loadSearches);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* The whole book is read into an index the first time the sheet opens.
     It takes a moment on an old phone, so it happens off the paint. */
  useEffect(() => {
    const build = () => { getIndex(); setReady(true); };
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (idle) { const h = idle(build, { timeout: 300 }); return () => cancelIdleCallback(h); }
    const t = window.setTimeout(build, 0);
    return () => window.clearTimeout(t);
  }, []);

  const query = q.trim();
  const landmark = useMemo(() => (query ? landmarkFor(query) : null), [query]);

  const outcome = useMemo(
    () => (ready && query ? search(query, filter) : { groups: [], total: 0, mode: null }),
    [ready, query, filter]);

  const { groups, total, mode } = outcome;

  /* One obvious destination, bound to Enter. A named canticle wins — nothing
     else answers "Magnificat" — and otherwise the best-scoring line does. */
  const jump: { target: Target; ref: string; title: string; where: string; also: number } | null =
    useMemo(() => {
      if (landmark) {
        return {
          target: { route: landmark.route, anchor: '', terms: [], label: landmark.ref },
          ref: landmark.ref, title: landmark.title, where: landmark.where, also: 0,
        };
      }
      const g = groups[0];
      if (!g) return null;
      const u = g.best.unit;
      return {
        target: targetOf(g.best),
        ref: u.ref || KIND_NAME[u.kind],
        title: u.head ? (u.title ?? '') : u.text,
        where: u.where,
        also: g.others.length,
      };
    }, [landmark, groups]);

  useEffect(() => { setCursor(-1); setOpened(null); }, [query, filter]);

  const go = (target: Target, term = query) => {
    setRecent(pushSearch(term));
    onJump(target);
    onClose();
  };

  /* The keys are read for the whole sheet, not only the box: after choosing
     a filter or reaching for a result the arrows must still work. Enter is
     left to the buttons themselves, which have their own. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if ((e.target as HTMLElement).tagName !== 'INPUT') return;
      e.preventDefault();
      if (cursor >= 0 && groups[cursor]) go(targetOf(groups[cursor].best));
      else if (jump) go(jump.target);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    inputRef.current?.focus();
    setCursor(c => {
      const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
      const at = Math.max(-1, Math.min(groups.length - 1, next));
      listRef.current?.querySelectorAll('.result')[at]
        ?.scrollIntoView({ block: 'nearest' });
      return at;
    });
  };

  const psalmNumbers = useMemo(() => {
    const seen = new Set<number>();
    for (const e of PSALM_INDEX) seen.add(e.num);
    return [...seen].sort((a, b) => a - b);
  }, []);

  return (
    <Sheet title="Search the book" onClose={onClose}>
      <div className="searchpane" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        className="search__input"
        type="search"
        placeholder="A line, a psalm number, or a canticle name…"
        value={q}
        onChange={e => setQ(e.target.value)}
        inputMode="search"
        autoComplete="off"
        aria-label="Search the whole book"
      />

      <div className="chiprow search__filters">
        {FILTERS.map(f => (
          <button key={f.key} className="chip" aria-pressed={filter === f.key}
            onClick={() => { setFilter(f.key); inputRef.current?.focus(); }}>
            {f.label}
          </button>
        ))}
      </div>

      {jump && (
        <button className="quickjump" onClick={() => go(jump.target)}>
          <span className="quickjump__kicker">Go straight to</span>
          <span className="quickjump__ref">
            {jump.ref}{jump.title ? <em> · {jump.title}</em> : null}
          </span>
          <span className="quickjump__where">
            {jump.where}
            {jump.also > 0 ? ` · and ${jump.also} more place${jump.also > 1 ? 's' : ''}` : ''}
          </span>
          <span className="quickjump__hint">Press Enter</span>
        </button>
      )}

      {query && !ready && <p className="empty">Reading the book…</p>}

      {query && ready && (
        groups.length ? (
          <>
            <p className="search__count">
              <span>
                {groups.length} {groups.length === 1 ? 'answer' : 'answers'}
                {total > groups.length ? ` · ${total} places` : ''}
              </span>
              {mode && MODE_NOTE[mode] ? <em>{MODE_NOTE[mode]}</em> : null}
            </p>
            <div className="results" ref={listRef}>
              {groups.map((g, i) => (
                <Result
                  key={g.key}
                  group={g}
                  current={i === cursor}
                  open={opened === g.key}
                  onToggle={() => setOpened(o => (o === g.key ? null : g.key))}
                  onGo={hit => go(targetOf(hit))}
                />
              ))}
            </div>
          </>
        ) : <p className="empty">Nothing in the book answers to “{query}”.</p>
      )}

      {!query && (
        <>
          {recent.length > 0 && (
            <>
              <p className="field__hint search__hint search__hint--row">
                Looked for lately
                <button className="linkbtn" onClick={() => setRecent(clearSearches())}>Clear</button>
              </p>
              <div className="chiprow">
                {recent.map(r => (
                  <button key={r} className="chip"
                    onClick={() => { setQ(r); inputRef.current?.focus(); }}>
                    {r}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="field__hint search__hint" style={{ marginTop: '1rem' }}>
            Type any line of the book — “the Lord is my shepherd” — or a reference such as
            <em> Psalm 119:105</em>. Put quotation marks round a phrase to demand it exactly.
          </p>

          <p className="field__hint search__hint" style={{ margin: '1rem 0 .6rem' }}>
            Or pick a psalm by number — the numbers below are those the book’s index lists.
          </p>
          <div className="grid2">
            {psalmNumbers.map(n => (
              <button key={n} className="psalmbtn"
                onClick={() => { setQ(String(n)); inputRef.current?.focus(); }}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- one answer */

interface ResultProps {
  group: Group;
  current: boolean;
  open: boolean;
  onToggle: () => void;
  onGo: (hit: Hit) => void;
}

function Result({ group, current, open, onToggle, onGo }: ResultProps) {
  const { best, others } = group;
  const u = best.unit;
  const name = u.ref
    ? `${u.ref}${u.title ? ` — ${u.title}` : ''}`
    : `${KIND_NAME[u.kind]}${u.title ? ` — ${u.title}` : ''}`;

  return (
    <div className="result__wrap">
      <button className="result" data-current={current ? '1' : '0'} onClick={() => onGo(best)}>
        <span className="result__name">{name}</span>
        {!u.head && (
          <span className="result__line">
            {snippet(u.text, best.terms).map((f, i) =>
              f.hit ? <mark key={i}>{f.text}</mark> : <span key={i}>{f.text}</span>)}
          </span>
        )}
        <span className="result__where">{u.where}</span>
      </button>

      {others.length > 0 && (
        <>
          <button className="result__more" aria-expanded={open} onClick={onToggle}>
            {open ? 'Hide' : `Also in ${others.length} other place${others.length > 1 ? 's' : ''}`}
          </button>
          {open && (
            <div className="result__others">
              {others.map((h, i) => (
                <button key={i} className="result__other" onClick={() => onGo(h)}>
                  {h.unit.where}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

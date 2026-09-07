import { Fragment, useMemo } from 'react';
import type { Block, Line, Strophe } from '../types';
import { fragments, markSeason, sideOf } from '../utils/choirFormatter';
import { markUp } from '../utils/search';
import plates from '../data/plates.json';

const PLATES = plates as { page: number; file: string; caption: string }[];

/** A place in a text and the words that were searched for, so a hit can be
    opened on its own line with those words picked out. */
export interface FocusMark {
  /** The block the hit is in. */
  anchor: string;
  /** Strophe (or row) and line within it. */
  s?: number;
  l?: number;
  /** The words to mark, normalised. */
  terms: string[];
}

/** The tone markers and the book's pointing, picked out for styling. */
function renderFrags(text: string) {
  return fragments(text).map((f, i) =>
    f.tone ? <span key={i} className="tone" aria-hidden="true">{f.text}</span>
      : f.point ? <span key={i} className="point" aria-hidden="true">{f.text}</span>
        : <Fragment key={i}>{f.text}</Fragment>);
}

/** Searched-for words marked inside a run of printed text. Nothing is
    reworded or reordered — the marks sit over the text as printed. */
function Marked({ text, terms }: { text: string; terms?: string[] }) {
  const key = terms?.join(' ') ?? '';
  const runs = useMemo(
    () => (key ? markUp(text, terms!) : [{ text }]),
    [text, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (runs.length === 1 && !runs[0].hit) return <>{renderFrags(text)}</>;
  return (
    <>
      {runs.map((r, i) => r.hit
        ? <mark key={i} className="found">{renderFrags(r.text)}</mark>
        : <Fragment key={i}>{renderFrags(r.text)}</Fragment>)}
    </>
  );
}

/** A single printed line, with the tone markers picked out. */
function TextLine({ line, terms, hit }: { line: Line; terms?: string[]; hit?: boolean }) {
  return (
    <span className={`line line--i${line.i}`} data-hit={hit ? '1' : undefined}>
      <Marked text={line.t} terms={terms} />
    </span>
  );
}

function Strophes({ strophes, focus }: { strophes: Strophe[]; focus?: FocusMark | null }) {
  return (
    <>
      {strophes.map((s, i) => {
        const side = sideOf(i);
        return (
          <p key={i} data-side={side}
            className={`strophe strophe--${side.toLowerCase()}${i === 0 ? ' strophe--first' : ''}`}>
            {s.map((l, j) => (
              <TextLine key={j} line={l} terms={focus?.terms}
                hit={!!focus && focus.s === i && (focus.l ?? 0) === j} />
            ))}
            <span className="strophe__n" data-side={side} aria-hidden="true">{i + 1}</span>
          </p>
        );
      })}
    </>
  );
}

export interface BlocksProps {
  blocks: Block[];
  /** The book label whose antiphons should be highlighted, or 'all'. */
  season: string;
  /** Stable id prefix so the table of contents can link to headings. */
  idPrefix?: string;
  /** A search hit to open on, when the reader arrived by searching. */
  focus?: FocusMark | null;
}

export function anchorId(prefix: string, i: number) { return `${prefix}-b${i}`; }

export default function Blocks({ blocks, season, idPrefix = 'b', focus }: BlocksProps) {
  return (
    <>
      {blocks.map((b, i) => {
        const id = anchorId(idPrefix, i);
        /* Only the block the search found is marked. Marking every "Lord" in
           the hour would be a different thing entirely. */
        const f = focus && focus.anchor === id ? focus : null;
        const terms = f?.terms;
        const found = f ? '1' : undefined;

        switch (b.k) {
          case 'head':
            return b.level === 1
              ? <h2 key={i} id={id} className="h1 blk" data-found={found} data-hit={found}>
                  <Marked text={b.text} terms={terms} />
                </h2>
              : <h3 key={i} id={id} className="h2 blk" data-found={found} data-hit={found}>
                  <Marked text={b.text} terms={terms} />
                </h3>;

          case 'label':
            return (
              <p key={i} id={id} className="label blk" data-found={found} data-hit={found}>
                <Marked text={b.text} terms={terms} />
                {b.note ? <em> (<Marked text={b.note} terms={terms} />)</em> : null}
              </p>
            );

          case 'ant': {
            const items = season === 'all'
              ? b.items.map(it => ({ ...it, active: true }))
              : markSeason(b.items, season);
            const filtered = season !== 'all' && items.some(it => !it.active);
            return (
              <div key={i} id={id} className={`ant blk${filtered ? ' ant--filtered' : ''}`}
                data-found={found}>
                {items.map((it, j) => (
                  <div key={j} className="ant__row" data-active={it.active ? '1' : '0'}
                    data-hit={f && f.s === j ? '1' : undefined}>
                    <span className="ant__label">{it.label}</span>
                    <span className="ant__text"><Marked text={it.text} terms={terms} /></span>
                  </div>
                ))}
              </div>
            );
          }

          case 'psalm':
          case 'cant':
            return (
              <section key={i} id={id} className="blk" data-found={found}>
                <header className="psalm__head" data-hit={f && f.s == null ? '1' : undefined}>
                  <span className="psalm__ref">
                    {b.ref}
                    {b.section ? <span className="psalm__section">{b.section}</span> : null}
                  </span>
                  {b.title || b.sectionTitle
                    ? <span className="psalm__title">{b.sectionTitle || b.title}</span>
                    : null}
                  {b.alt ? <span className="psalm__alt">{b.alt}</span> : null}
                </header>
                {b.note ? <p className="rubric" style={{ marginTop: 0 }}>{b.note}</p> : null}
                <Strophes strophes={b.strophes} focus={f} />
              </section>
            );

          case 'text':
            return (
              <div key={i} id={id} className="blk" data-found={found}>
                {b.paras.map((p, j) => (
                  <p key={j} className="para">
                    {p.map((l, k) => (
                      <TextLine key={k} line={l} terms={terms}
                        hit={!!f && f.s === j && (f.l ?? 0) === k} />
                    ))}
                  </p>
                ))}
              </div>
            );

          case 'vr':
            return (
              <div key={i} id={id} className="vr blk" data-found={found}>
                {b.items.map((it, j) => (
                  <div key={j} className="vr__row" data-hit={f && f.s === j ? '1' : undefined}>
                    <span className="vr__c">{it.c}.</span>
                    <span><Marked text={it.text} terms={terms} /></span>
                  </div>
                ))}
              </div>
            );

          case 'rubric':
            return (
              <p key={i} id={id} className="rubric blk" data-found={found} data-hit={found}>
                <Marked text={b.text} terms={terms} />
              </p>
            );

          case 'ref':
            return (
              <p key={i} id={id} className="xref blk" data-found={found} data-hit={found}>
                <Marked text={b.text} terms={terms} />
              </p>
            );

          case 'reading':
            return (
              <p key={i} id={id} className="label blk" data-found={found} data-hit={found}>
                {b.day.charAt(0) + b.day.slice(1).toLowerCase()}
                <span className="reading__ref"> — {b.ref}</span>
              </p>
            );

          case 'plate': {
            const plate = PLATES.find(p => p.page === b.page);
            if (!plate) return null;
            return (
              <figure key={i} id={id} className="plate blk" data-found={found} data-hit={found}>
                <img src={`./plates/${plate.file}`} alt={b.caption || plate.caption} loading="lazy" />
                <figcaption>{b.caption || plate.caption}</figcaption>
              </figure>
            );
          }

          case 'setting':
            return (
              <h3 key={i} id={id} className="h2 blk" data-found={found} data-hit={found}>
                {b.name}{b.num ? ` ${b.num}` : ''}{b.note ? ` — ${b.note}` : ''}
              </h3>
            );

          default:
            return null;
        }
      })}
    </>
  );
}

/** Headings a reader might want to jump to, for the section picker. */
export function outline(blocks: Block[], idPrefix = 'b') {
  const items: { id: string; label: string; lvl: 1 | 2 }[] = [];
  blocks.forEach((b, i) => {
    const id = anchorId(idPrefix, i);
    if (b.k === 'head') items.push({ id, label: b.text, lvl: b.level });
    else if (b.k === 'psalm' || b.k === 'cant') {
      const ref = b.section ? `${b.ref} · ${b.section}` : b.ref;
      const title = b.sectionTitle || b.title;
      items.push({ id, label: title ? `${ref} — ${title}` : ref, lvl: 2 });
    }
    else if (b.k === 'setting') items.push({ id, label: `${b.name}${b.num ? ` ${b.num}` : ''}`, lvl: 2 });
    else if (b.k === 'reading') items.push({ id, label: `${b.day} — ${b.ref}`, lvl: 2 });
    else if (b.k === 'label') items.push({ id, label: b.text, lvl: 2 });
  });
  return items;
}

import { Fragment, useMemo } from 'react';
import type { Block, Line, Strophe } from '../types';
import { fragments, markSeason, sideOf } from '../utils/choirFormatter';
import plates from '../data/plates.json';

const PLATES = plates as { page: number; file: string; caption: string }[];

/** A single printed line, with the tone markers picked out. */
function TextLine({ line }: { line: Line }) {
  const frags = useMemo(() => fragments(line.t), [line.t]);
  return (
    <span className={`line line--i${line.i}`}>
      {frags.map((f, i) =>
        f.tone ? <span key={i} className="tone" aria-hidden="true">{f.text}</span>
          : f.point ? <span key={i} className="point" aria-hidden="true">{f.text}</span>
            : <Fragment key={i}>{f.text}</Fragment>)}
    </span>
  );
}

function Strophes({ strophes }: { strophes: Strophe[] }) {
  return (
    <>
      {strophes.map((s, i) => {
        const side = sideOf(i);
        return (
          <p key={i} data-side={side}
            className={`strophe strophe--${side.toLowerCase()}${i === 0 ? ' strophe--first' : ''}`}>
            {s.map((l, j) => <TextLine key={j} line={l} />)}
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
}

export function anchorId(prefix: string, i: number) { return `${prefix}-b${i}`; }

export default function Blocks({ blocks, season, idPrefix = 'b' }: BlocksProps) {
  return (
    <>
      {blocks.map((b, i) => {
        const id = anchorId(idPrefix, i);
        switch (b.k) {
          case 'head':
            return b.level === 1
              ? <h2 key={i} id={id} className="h1 blk">{b.text}</h2>
              : <h3 key={i} id={id} className="h2 blk">{b.text}</h3>;

          case 'label':
            return (
              <p key={i} id={id} className="label blk">
                {b.text}{b.note ? <em> ({b.note})</em> : null}
              </p>
            );

          case 'ant': {
            const items = season === 'all'
              ? b.items.map(it => ({ ...it, active: true }))
              : markSeason(b.items, season);
            const filtered = season !== 'all' && items.some(it => !it.active);
            return (
              <div key={i} id={id} className={`ant blk${filtered ? ' ant--filtered' : ''}`}>
                {items.map((it, j) => (
                  <div key={j} className="ant__row" data-active={it.active ? '1' : '0'}>
                    <span className="ant__label">{it.label}</span>
                    <span className="ant__text">{it.text}</span>
                  </div>
                ))}
              </div>
            );
          }

          case 'psalm':
          case 'cant':
            return (
              <section key={i} id={id} className="blk">
                <header className="psalm__head">
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
                <Strophes strophes={b.strophes} />
              </section>
            );

          case 'text':
            return (
              <div key={i} id={id} className="blk">
                {b.paras.map((p, j) => (
                  <p key={j} className="para">
                    {p.map((l, k) => <TextLine key={k} line={l} />)}
                  </p>
                ))}
              </div>
            );

          case 'vr':
            return (
              <div key={i} id={id} className="vr blk">
                {b.items.map((it, j) => (
                  <div key={j} className="vr__row">
                    <span className="vr__c">{it.c}.</span>
                    <span>{it.text}</span>
                  </div>
                ))}
              </div>
            );

          case 'rubric':
            return <p key={i} id={id} className="rubric blk">{b.text}</p>;

          case 'ref':
            return <p key={i} id={id} className="xref blk">{b.text}</p>;

          case 'reading':
            return (
              <p key={i} id={id} className="label blk">
                {b.day.charAt(0) + b.day.slice(1).toLowerCase()}
                <span className="reading__ref"> — {b.ref}</span>
              </p>
            );

          case 'plate': {
            const plate = PLATES.find(p => p.page === b.page);
            if (!plate) return null;
            return (
              <figure key={i} id={id} className="plate blk">
                <img src={`./plates/${plate.file}`} alt={b.caption || plate.caption} loading="lazy" />
                <figcaption>{b.caption || plate.caption}</figcaption>
              </figure>
            );
          }

          case 'setting':
            return (
              <h3 key={i} id={id} className="h2 blk">
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

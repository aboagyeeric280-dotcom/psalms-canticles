import { useState } from 'react';
import type { HourShape, OrdinaryItem } from '../data/ordinary';

/** The parts of the hour that sit around the psalmody, so the reader can pray
    the whole office and not just the psalms the book prints. */
function Item({ item, onGo }: { item: OrdinaryItem; onGo: (r: string) => void }) {
  return (
    <div className="blk" style={{ margin: '1.1em 0' }}>
      <p className="label" style={{ margin: '0 0 .3em' }}>{item.label}</p>
      {item.rubric ? <p className="rubric" style={{ textAlign: 'left', margin: '.2em 0' }}>{item.rubric}</p> : null}
      {item.lines?.map((l, i) => <p key={i} className="para" style={{ margin: '.15em 0' }}>{l}</p>)}
      {item.route ? (
        <button className="btn btn--ghost" style={{ marginTop: '.4rem', padding: '.35rem .6rem' }}
          onClick={() => onGo(item.route!)}>
          {item.routeLabel ?? 'Open'} →
        </button>
      ) : null}
    </div>
  );
}

interface Props { shape: HourShape; onGo: (r: string) => void; where: 'before' | 'after' }

export default function HourShapeCard({ shape, onGo, where }: Props) {
  const [open, setOpen] = useState(false);
  const items = where === 'before' ? shape.before : shape.after;
  const heading = where === 'before' ? 'Before the psalmody' : 'After the psalmody';

  return (
    <section className="blk">
      <button className="xref" style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <strong>{heading}</strong> — {items.map(i => i.label).join(' · ')}
        <span style={{ float: 'right', opacity: .6 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ borderLeft: '2px solid var(--rule)', paddingLeft: '1rem', marginTop: '.6rem' }}>
          {items.map(i => <Item key={i.id} item={i} onGo={onGo} />)}
        </div>
      )}
      {where === 'before' && (
        <p className="rubric" style={{ marginTop: '1.4em' }}>{shape.psalmodyLabel}</p>
      )}
    </section>
  );
}

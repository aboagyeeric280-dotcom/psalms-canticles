import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Blocks, { outline, type FocusMark } from './Blocks';
import Sheet from './Sheet';
import { IconBack, IconBook, IconForward, IconHome, IconList, IconMoon, IconSun } from './icons';
import type { Block } from '../types';
import type { Prefs } from '../utils/storage';
import { scrollToElement, scrollToNode } from '../utils/scroll';
import { readMark, saveMark } from '../utils/storage';

/** The prayer-book styles, by the names the settings sheet gives them. */
const AESTHETIC_NAMES: Record<Prefs['aesthetic'], string> = {
  vellum: 'Vellum & Rubric',
  'still-point': 'Still Point',
  'green-modern': 'Green Modern',
};

/** Where the reader can step to from here. */
export interface Neighbour { route: string; label: string }

export interface ReaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  blocks: Block[];
  season: string;
  prefs: Prefs;
  onGo: (route: string) => void;
  onProgress?: (p: number) => void;
  /** Rendered above the book text — the shape of the hour, cross-links, etc. */
  intro?: ReactNode;
  outro?: ReactNode;
  idPrefix?: string;
  /** The hour before and after this one, when there is one. */
  prev?: Neighbour | null;
  next?: Neighbour | null;
  /** Reading controls, kept within reach at the foot of the page. */
  onSize?: (delta: number) => void;
  onCycleTheme?: () => void;
  onCycleAesthetic?: () => void;
  /** The traditional Latin name, shown only in the Vellum & Rubric style. */
  latin?: string;
  /** Route to remember the reading position under. Omit for texts that are
      looked up rather than prayed through. */
  resumeKey?: string;
  /** A line found by searching, to open on rather than start at the top. */
  focus?: FocusMark | null;
}

/** The distraction-free reading surface, shared by every text in the book. */
export default function OfficeReader({
  kicker, title, subtitle, blocks, season, prefs, onGo, onProgress, intro, outro,
  idPrefix = 'b', prev, next, onSize, onCycleTheme, onCycleAesthetic, latin, resumeKey, focus,
}: ReaderProps) {
  const [toc, setToc] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [sizeHint, setSizeHint] = useState(false);
  const firstSize = useRef(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => outline(blocks, idPrefix), [blocks, idPrefix]);

  // Reading progress, which heading we are inside, and where prayer stopped.
  useEffect(() => {
    let saveTimer = 0;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      onProgress?.(max > 0 ? doc.scrollTop / max : 0);

      let seen: string | null = null;
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 96) seen = it.id; else break;
      }
      setCurrent(seen);

      if (resumeKey) {
        const y = window.scrollY;
        const where = items.find(i => i.id === seen)?.label ?? '';
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(
          () => saveMark(resumeKey, { id: seen, y, at: Date.now(), title, where }), 400);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.clearTimeout(saveTimer); window.removeEventListener('scroll', onScroll); };
  }, [items, onProgress, resumeKey, title]);

  /* Come back to where prayer stopped. The app resets the scroll on every
     route change, synchronously, so this has to land after that; and it
     returns to the section rather than the pixel, because the text may have
     been resized since. */
  useEffect(() => {
    // Arriving on a searched-for line beats returning to where prayer stopped.
    if (!resumeKey || focus) return;
    const mark = readMark(resumeKey);
    if (!mark || mark.y < 40) return;
    const t = window.setTimeout(() => {
      if (mark.id && document.getElementById(mark.id)) scrollToElement(mark.id);
      else window.scrollTo(0, mark.y);
    }, 0);
    return () => window.clearTimeout(t);
  }, [resumeKey, focus]);

  /* Arrived by searching: put the line itself under the reader's eye, not the
     top of the hour that prints it. The marked line is preferred to the block
     because a psalm can run for a screenful; the block is the fallback for a
     heading, and for anything the text may have shifted under. */
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => {
      const block = document.getElementById(focus.anchor);
      const line = block?.querySelector('[data-hit="1"]');
      if (line) scrollToNode(line, 'in-view');
      else if (block) scrollToNode(block);
    }, 50);
    return () => window.clearTimeout(t);
  }, [focus]);

  // A− / A+ act on the text in place; this is the only feedback they need.
  useEffect(() => {
    if (firstSize.current) { firstSize.current = false; return; }
    setSizeHint(true);
    const t = window.setTimeout(() => setSizeHint(false), 1100);
    return () => window.clearTimeout(t);
  }, [prefs.size]);

  /* A flick left or right steps through the psalms and canticles of the
     hour, the same list the section sheet offers. It is never the only way
     there: the dock carries previous and next, and the sheet lists them all.
     Only a deliberate horizontal flick counts — not a scroll, not a tap, and
     not a slow drag that was probably a selection. */
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) { swipe.current = null; return; }
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, at: Date.now() };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from || !items.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.abs(dx) < 64) return;                    // too small to mean it
    if (Math.abs(dx) < Math.abs(dy) * 2) return;      // that was a scroll
    if (Date.now() - from.at > 600) return;           // that was a drag
    const at = items.findIndex(i => i.id === current);
    const to = dx < 0 ? at + 1 : at - 1;
    if (to < 0 || to >= items.length) return;
    scrollToElement(items[to].id);
  };

  const jump = (id: string) => {
    setToc(false);
    // The sheet locks body scrolling while it is open. Release the lock here
    // rather than waiting for the sheet to unmount: deferring to an animation
    // frame would strand the reader in any tab that is not compositing.
    document.body.style.overflow = '';
    scrollToElement(id);
  };

  const currentLabel = items.find(i => i.id === current)?.label ?? 'Jump to a section';

  return (
    <>
      <div className="shell">
        <article
          className="reader"
          ref={bodyRef}
          data-choir={prefs.choir ? 'on' : 'off'}
          data-tones={prefs.tones ? 'on' : 'off'}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <header className="reader__hat">
            {kicker ? <p className="reader__kicker">{kicker}</p> : null}
            <h2 className="reader__title">{title}</h2>
            {latin ? <p className="reader__latin">{latin}</p> : null}
            {subtitle ? <p className="reader__sub">{subtitle}</p> : null}
          </header>

          {intro}
          <Blocks blocks={blocks} season={season} idPrefix={idPrefix} focus={focus} />
          {outro}
        </article>
      </div>

      <div className="sizehint" data-show={sizeHint ? '1' : '0'} aria-live="polite">
        {prefs.size} px
      </div>

      <nav className="dock" aria-label="Reader navigation">
        <div className="dock__row">
          <button className="iconbtn" onClick={() => onGo('#/')} aria-label="Home"><IconHome /></button>

          {onSize && (
            <span className="dock__group" role="group" aria-label="Text size">
              <button className="iconbtn iconbtn--text" onClick={() => onSize(-1)} aria-label="Smaller text">A−</button>
              <button className="iconbtn iconbtn--text" onClick={() => onSize(1)} aria-label="Larger text">A+</button>
            </span>
          )}
          {onCycleTheme && (
            <button className="iconbtn" onClick={onCycleTheme} aria-label="Change theme">
              {prefs.theme === 'dark' ? <IconMoon /> : <IconSun />}
            </button>
          )}
          {onCycleAesthetic && (
            <button className="iconbtn" onClick={onCycleAesthetic}
              aria-label={`Prayer book style: ${AESTHETIC_NAMES[prefs.aesthetic]}. Change style.`}>
              <IconBook />
            </button>
          )}

          <button className="dock__jump" onClick={() => setToc(true)}>
            <IconList />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentLabel}</span>
          </button>

          <button className="iconbtn" disabled={!prev} onClick={() => prev && onGo(prev.route)}
            aria-label={prev ? `Previous: ${prev.label}` : 'No previous hour'} title={prev?.label}>
            <IconBack />
          </button>
          <button className="iconbtn" disabled={!next} onClick={() => next && onGo(next.route)}
            aria-label={next ? `Next: ${next.label}` : 'No next hour'} title={next?.label}>
            <IconForward />
          </button>
        </div>
      </nav>

      {toc && (
        <Sheet title="Sections" onClose={() => setToc(false)}>
          <div className="toc">
            {items.length ? items.map(it => (
              <button key={it.id} className="toc__item" data-lvl={it.lvl}
                data-current={it.id === current ? '1' : '0'} onClick={() => jump(it.id)}>
                {it.label}
              </button>
            )) : <p className="empty">This text has no sub-sections.</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}

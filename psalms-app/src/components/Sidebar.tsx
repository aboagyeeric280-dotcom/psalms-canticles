import { useEffect, useRef, type ReactNode } from 'react';
import {
  IconBook, IconCalendar, IconCrest, IconGrid, IconInfo, IconMusic,
  IconNote, IconSettings,
} from './icons';

/** The width at which the drawer becomes a permanent rail. */
const DESKTOP = '(min-width: 64rem)';

interface Item {
  label: string;
  icon: ReactNode;
  /** Where it goes, or nothing when it opens a sheet instead. */
  route?: string;
  onClick?: () => void;
}

interface Props {
  route: string;
  onGo: (route: string) => void;
  onSettings: () => void;
  /** Open state of the drawer; only consulted below the desktop breakpoint. */
  open: boolean;
  onClose: () => void;
}

/** Whether a nav item is the one we are looking at. Home has to match exactly
    or it would light up on every route in the app. */
function isCurrent(route: string, target: string) {
  if (target === '#/') return route === '#/' || route === '';
  return route === target || route.startsWith(target + '/');
}

export default function Sidebar({ route, onGo, onSettings, open, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  /* Below the desktop breakpoint this is a drawer laid over the page, so while
     it is open it has to behave like one: Escape closes it, Tab stays inside
     it, and the keyboard goes back to whatever opened it. Above the breakpoint
     it is a permanent rail and none of this runs. */
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button, [href]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])');
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    /* A drawer left open across a resize would strand a modal dialog on top of
       the permanent rail, so hand it back the moment the rail appears. */
    const mq = window.matchMedia(DESKTOP);
    const onWide = () => { if (mq.matches) onClose(); };

    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onWide);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onWide);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  const primary: Item[] = [
    { label: "Today's Office", icon: <IconGrid />, route: '#/' },
    { label: 'The Psalter', icon: <IconBook />, route: '#/psalter' },
    { label: 'Canticles', icon: <IconMusic />, route: '#/canticles' },
    { label: 'Liturgical Calendar', icon: <IconCalendar />, route: '#/calendar' },
    { label: 'Commons & Feasts', icon: <IconCrest />, route: '#/feasts/common' },
  ];
  const lower: Item[] = [
    { label: 'Settings', icon: <IconSettings />, onClick: onSettings },
    { label: 'Bookmarks', icon: <IconNote />, route: '#/bookmarks' },
    { label: 'About / Colophon', icon: <IconInfo />, route: '#/about' },
  ];

  const go = (it: Item) => {
    if (it.route) onGo(it.route); else it.onClick?.();
    onClose();                     // the drawer closes behind you on a phone
  };

  const render = (items: Item[]) => items.map(it => {
    const current = it.route ? isCurrent(route, it.route) : false;
    return (
      <button key={it.label} className="side__link" data-current={current ? '1' : '0'}
        aria-current={current ? 'page' : undefined} onClick={() => go(it)}>
        <span className="side__icon" aria-hidden="true">{it.icon}</span>
        <span className="side__label">{it.label}</span>
      </button>
    );
  });

  return (
    <>
      {open && <button className="side__scrim" aria-label="Close the menu" onClick={onClose} />}
      <aside
        className="side"
        data-open={open ? '1' : '0'}
        ref={panel}
        aria-label="Sections"
        {...(open ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className="side__brand">
          <span className="side__crest" aria-hidden="true"><IconCrest /></span>
          <span className="side__wordmark">
            <b>Daily Psalms</b>
            <small>and Canticles</small>
          </span>
        </div>

        <nav className="side__nav" aria-label="Main sections">{render(primary)}</nav>
        <nav className="side__nav side__nav--lower" aria-label="Settings and information">
          {render(lower)}
        </nav>

        <p className="side__foot">
          Province of St Joseph the Worker<br />Nigeria &amp; Ghana
        </p>
      </aside>
    </>
  );
}

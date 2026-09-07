import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import OfficeReader from './components/OfficeReader';
import ComplineView from './components/ComplineView';
import HourShapeCard from './components/HourShapeCard';
import IndexModal from './components/IndexModal';
import SettingsDrawer from './components/SettingsDrawer';
import {
  AboutPage, CanticlePage, DominicanPage, FeastsPage, InvitatoryPage,
  MiddayPage, PrayersPage, ReadingsIndexPage, TablesPage, TeDeumPage,
} from './components/Pages';

import { OFFICES, READINGS, neighbours } from './data/offices';
import type { FocusMark } from './components/Blocks';
import type { Target } from './utils/search';
import type { DayKey } from './types';

import { HOUR_SHAPE, READINGS_SHAPE } from './data/ordinary';
import { DAY_KEYS, HOUR_NAMES, ROMAN, liturgicalDay } from './utils/liturgicalCalendar';
import { loadObserved, pushRecent, saveObserved, usePrefs } from './utils/storage';
import { scrollToTop } from './utils/scroll';
import { latinHour } from './utils/hours';
import { liturgicalToday } from './utils/generalCalendar';
import LiturgicalHeader from './components/LiturgicalHeader';
import Sidebar from './components/Sidebar';
import { BookmarksPage, CalendarPage, CanticlesPage, PsalterPage } from './components/NavPages';

function useHashRoute() {
  const [route, setRoute] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((next: string) => {
    if (next === (window.location.hash || '#/')) return;
    window.location.hash = next;
  }, []);
  return [route, go] as const;
}

export default function App() {
  const [route, go] = useHashRoute();
  const [prefs, updatePrefs] = usePrefs();
  const [showSearch, setShowSearch] = useState(false);
  /* Where a search asked to be taken. It is held beside the route rather
     than written into it: the route names the text, and the reading mark,
     the section picker and the browser's own history all key off that. */
  const [found, setFound] = useState<(Target & { at: number }) | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [viewed, setViewed] = useState(() => new Date());

  const [observed, setObserved] = useState(loadObserved);

  const lit = useMemo(() => liturgicalDay(viewed), [viewed]);
  // Which optional memorial, if any, the reader has elected for this date.
  const today = useMemo(
    () => liturgicalToday(viewed, { observe: observed[dayKey(viewed)] ?? null }),
    [viewed, observed]);
  const electMemorial = useCallback(
    (name: string | null) => setObserved(saveObserved(dayKey(viewed), name)),
    [viewed]);
  // The antiphon rule takes the vesture colour of the day, unless the reader
  // turns it off. --accent stays the app's own gold either way.
  useEffect(() => {
    const r = document.documentElement;
    if (prefs.litColour) r.dataset.lit = today.colour; else delete r.dataset.lit;
  }, [today.colour, prefs.litColour]);

  // Which season's antiphons to bring forward.
  const antiphonSeason = prefs.antiphons === 'auto' ? lit.antiphonLabel : prefs.antiphons;

  useEffect(() => { window.scrollTo(0, 0); setProgress(0); }, [route]);

  const parts = route.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, arg, arg2] = parts;

  /* Take a search result to its own line. The page is opened first; the
     reader it renders scrolls to the line and marks the words. */
  const goToFound = useCallback((target: Target) => {
    setFound({ ...target, at: Date.now() });
    go(target.route);
  }, [go]);

  // The mark belongs to the text it was found in, and to no other.
  const focus: FocusMark | null = found && found.route === route && found.anchor
    ? { anchor: found.anchor, s: found.s, l: found.l, terms: found.terms }
    : null;

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const readerControls = {
    onSize: (d: number) => updatePrefs({ size: clamp(prefs.size + d, 14, 30) }),
    onCycleTheme: () => {
      const order = ['light', 'sepia', 'dark'] as const;
      updatePrefs({ theme: order[(order.indexOf(prefs.theme) + 1) % order.length] });
    },
    onCycleAesthetic: () => {
      const order = ['vellum', 'still-point', 'green-modern'] as const;
      updatePrefs({ aesthetic: order[(order.indexOf(prefs.aesthetic) + 1) % order.length] });
    },
  };

  const pageProps = {
    season: antiphonSeason, prefs, onGo: go, onProgress: setProgress, focus, ...readerControls,
  };

  let title = 'Daily Psalms and Canticles';
  let kicker: string | undefined;
  let body: React.ReactNode;

  if (!head) {
    kicker = 'Dominican Publications';
    body = (
      <Dashboard onGo={go} viewed={viewed} setViewed={setViewed}
        today={today} onElect={electMemorial} />
    );
  } else if (head === 'psalter') {
    title = 'The Psalter';
    body = <PsalterPage onGo={go} viewed={viewed} setViewed={setViewed} />;
  } else if (head === 'canticles') {
    title = 'Canticles';
    body = <CanticlesPage onGo={go} viewed={viewed} setViewed={setViewed} />;
  } else if (head === 'calendar') {
    title = 'Liturgical Calendar';
    body = <CalendarPage onGo={go} viewed={viewed} setViewed={setViewed} />;
  } else if (head === 'bookmarks') {
    title = 'Bookmarks';
    body = <BookmarksPage onGo={go} viewed={viewed} setViewed={setViewed} />;
  } else if (head === 'office' && arg) {
    const office = OFFICES.find(o => o.id === arg);
    if (!office) body = <NotFound onGo={go} what={arg} />;
    else {
      const shape = HOUR_SHAPE[office.hour];
      title = `${office.dayName} — ${HOUR_NAMES[office.hour]}`;
      kicker = `Week ${ROMAN[office.week]}`;
      body = (
        <OfficeReader
          {...pageProps}
          kicker={kicker}
          title={title}
          subtitle={`Page ${office.page} of the book`}
          latin={latinHour(office.hour)}
          resumeKey={route}
          blocks={office.blocks}
          idPrefix={office.id}
          {...neighbours(OFFICES, office.id)}
          intro={<>
            <LiturgicalHeader day={today} compact />
            <HourShapeCard shape={shape} onGo={go} where="before" />
          </>}
          outro={<HourShapeCard shape={shape} onGo={go} where="after" />}
        />
      );
    }
  } else if (head === 'readings' && arg) {
    const office = READINGS.find(o => o.id === arg);
    if (!office) body = <NotFound onGo={go} what={arg} />;
    else {
      title = office.seasonal ? office.title : `${office.dayName} — Office of Readings`;
      kicker = office.seasonal ? 'Seasonal psalms' : `Week ${ROMAN[office.week]}`;
      body = (
        <OfficeReader
          {...pageProps}
          kicker={kicker}
          title={title}
          subtitle={`Page ${office.page} of the book`}
          latin={latinHour('readings')}
          resumeKey={route}
          blocks={office.blocks}
          idPrefix={office.id}
          {...neighbours(READINGS, office.id)}
          intro={<>
            <LiturgicalHeader day={today} compact />
            <HourShapeCard shape={READINGS_SHAPE} onGo={go} where="before" />
          </>}
          outro={<HourShapeCard shape={READINGS_SHAPE} onGo={go} where="after" />}
        />
      );
    }
  } else if (head === 'readings') {
    title = 'Office of Readings';
    body = <ReadingsIndexPage {...pageProps} />;
  } else if (head === 'compline') {
    title = 'Compline';
    kicker = 'Bedtime Prayer';
    // A search may name the evening whose psalms it found the words in.
    const day = DAY_KEYS.includes(arg as DayKey) ? (arg as DayKey) : undefined;
    body = (
      <ComplineView {...pageProps} day={day} latin={latinHour('compline')} resumeKey={route} />
    );
  } else if (head === 'canticle' && (arg === 'zechariah' || arg === 'mary')) {
    title = arg === 'zechariah' ? 'Canticle of Zechariah' : 'Canticle of Mary';
    body = <CanticlePage which={arg} setting={Number(arg2) || 0} {...pageProps} />;
  } else if (head === 'invitatory') {
    title = 'Invitatory'; body = <InvitatoryPage {...pageProps} />;
  } else if (head === 'te-deum') {
    title = 'Te Deum'; body = <TeDeumPage {...pageProps} />;
  } else if (head === 'midday-hymns') {
    title = 'Midday Prayer'; body = <MiddayPage {...pageProps} />;
  } else if (head === 'dominican') {
    title = 'Compline Supplements'; body = <DominicanPage {...pageProps} />;
  } else if (head === 'feasts' && (arg === 'common' || arg === 'proper')) {
    title = arg === 'common' ? 'Common Feasts' : 'Proper Feasts';
    body = <FeastsPage which={arg} {...pageProps} />;
  } else if (head === 'prayers') {
    title = 'Weekly Prayers'; body = <PrayersPage {...pageProps} />;
  } else if (head === 'tables') {
    title = 'Psalms for Feast Days'; body = <TablesPage {...pageProps} />;
  } else if (head === 'about') {
    title = 'How to use this book'; body = <AboutPage {...pageProps} />;
  } else {
    title = 'Not in the book';
    body = <NotFound onGo={go} what={route} />;
  }

  /* Which way the page turned: into a text, or back out to the desk. Worked
     out once per route and then held, because the view is keyed by route and
     a later re-render must not swap the animation out from under it. The
     animation itself is a couple of rules in index.css. */
  const lastDepth = useRef(0);
  const turn = useRef<{ route: string; dir: 'in' | 'out' | 'same' }>({ route: '', dir: 'same' });
  if (turn.current.route !== route) {
    const depth = head ? 1 : 0;
    turn.current = {
      route,
      dir: depth > lastDepth.current ? 'in' : depth < lastDepth.current ? 'out' : 'same',
    };
    lastDepth.current = depth;
  }
  const move = turn.current.dir;

  useEffect(() => {
    document.title = head ? `${title} · Daily Psalms and Canticles` : 'Daily Psalms and Canticles';
    if (head) pushRecent(route, title);
  }, [route, title, head]);

  return (
    <div className="app">
      <Sidebar
        route={route}
        onGo={go}
        onSettings={() => setShowSettings(true)}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="app__body">
        <a className="skip" href="#main">Skip to the text</a>
        <Header
          title={head ? title : 'Today’s Prayer'}
          kicker={kicker}
          canGoBack={!!head}
          progress={head ? progress : undefined}
          rank={today.primary.rankName}
          colour={today.colour}
          onBack={() => (head ? go('#/') : scrollToTop())}
          onMenu={() => setNavOpen(true)}
          onSearch={() => setShowSearch(true)}
          onSettings={() => setShowSettings(true)}
        />

        <main id="main" tabIndex={-1}>
          <div className="pageview" key={route} data-move={move}>{body}</div>
        </main>

      {!head && (
        <footer className="footer shell">
          Daily Psalms and Canticles · Dominican Publications, Box 44, Yaba, Lagos<br />
          Province of St Joseph the Worker — Nigeria &amp; Ghana<br />
          <button className="btn btn--ghost" style={{ marginTop: '.7rem' }} onClick={() => go('#/about')}>
            How to use this book
          </button>
        </footer>
      )}

      </div>

      {showSearch && <IndexModal onClose={() => setShowSearch(false)} onJump={goToFound} />}
      {showSettings && (
        <SettingsDrawer prefs={prefs} update={updatePrefs} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

/* The reader's own calendar day, by local parts: the same day the engine
   normalises `viewed` to, and stable whatever the clock's offset. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function NotFound({ onGo, what }: { onGo: (r: string) => void; what: string }) {
  return (
    <div className="shell">
      <p className="empty">Nothing in the book answers to “{what}”.</p>
      <div style={{ textAlign: 'center' }}>
        <button className="btn btn--primary" onClick={() => onGo('#/')}>Back to the dashboard</button>
      </div>
    </div>
  );
}

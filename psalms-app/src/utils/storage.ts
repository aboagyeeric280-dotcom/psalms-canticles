/* Preferences and bookmarks. Everything lives in localStorage; the book
   texts themselves are bundled, so nothing here is ever load-bearing. */

import { useCallback, useEffect, useState } from 'react';
import type { AntiphonFilter } from '../types';

/** How much the chrome is lit. Never applied to the reading surfaces. */
export type Gloss = 'matte' | 'glossy';

/** Which of the prayer-book styles the app is set in. */
export type Aesthetic = 'vellum' | 'still-point' | 'green-modern';

export interface Prefs {
  theme: 'light' | 'sepia' | 'dark';
  font: 'serif' | 'sans';
  size: number;
  leading: number;
  choir: boolean;
  tones: boolean;
  /** 'auto' follows the liturgical calendar. */
  antiphons: 'auto' | AntiphonFilter;
  /** Carry the day's liturgical colour into the reader. */
  litColour: boolean;
  aesthetic: Aesthetic;
  gloss: Gloss;
  /* Offer the link out to the rest of the Hour at Universalis. The app never
     fetches anything from them; turned off, it does not even link, and is
     entirely self-contained. */
  universalis: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'light',
  font: 'serif',
  size: 19,
  leading: 1.6,
  choir: true,
  tones: true,
  antiphons: 'auto',
  litColour: true,
  aesthetic: 'vellum',
  gloss: 'matte',
  universalis: true,
};

const PREFS_KEY = 'dpc.prefs';
const RECENT_KEY = 'dpc.recent';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function loadPrefs(): Prefs { return read(PREFS_KEY, DEFAULT_PREFS); }

export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  r.dataset.theme = p.theme;
  r.dataset.font = p.font;
  r.dataset.aesthetic = p.aesthetic;
  r.dataset.gloss = p.gloss;
  r.style.setProperty('--reader-size', `${p.size}px`);
  r.style.setProperty('--reader-leading', String(p.leading));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content',
      p.theme === 'dark' ? '#000000' : p.theme === 'sepia' ? '#f2e6cf' : '#faf8f4');
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  useEffect(() => { applyPrefs(prefs); save(PREFS_KEY, prefs); }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs(prev => ({ ...prev, ...patch }));
  }, []);

  return [prefs, update] as const;
}

/* ------------------------------------------------------- reading marks */
/* Where prayer stopped, per office. An hour is long on a phone and finding
   your place again is the commonest piece of work in the app. */
const MARKS_KEY = 'dpc.marks';

export interface Mark {
  /** The anchor of the section last scrolled past, when there was one. */
  id: string | null;
  y: number;
  at: number;
  title: string;
  /** The section's own label, for the card on the home screen. */
  where: string;
}

export function loadMarks(): Record<string, Mark> {
  try { return JSON.parse(localStorage.getItem(MARKS_KEY) || '{}'); } catch { return {}; }
}

export function saveMark(route: string, mark: Mark) {
  const all = loadMarks();
  all[route] = mark;
  // Keep the twenty most recent; nobody resumes an hour from last month.
  const trimmed = Object.fromEntries(
    Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 20));
  save(MARKS_KEY, trimmed);
}

export function readMark(route: string): Mark | null {
  return loadMarks()[route] ?? null;
}

/** The office most recently left part-way through, if there is one. */
export function lastMark(): (Mark & { route: string }) | null {
  const all = Object.entries(loadMarks())
    .map(([route, m]) => ({ ...m, route }))
    .filter(m => m.y > 40)
    .sort((a, b) => b.at - a.at);
  return all[0] ?? null;
}

export function clearMark(route: string) {
  const all = loadMarks();
  delete all[route];
  save(MARKS_KEY, all);
}

/* --------------------------------------------------- optional memorials */
/* Which optional memorial the reader has elected to keep, kept by date. No
   entry means the weekday, which is what the calendar assumes on its own. */
const OBSERVED_KEY = 'dpc.observed';

export function loadObserved(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(OBSERVED_KEY) || '{}'); } catch { return {}; }
}

/** Keep `name` on `day`, or pass that day's optional memorials over with null. */
export function saveObserved(day: string, name: string | null): Record<string, string> {
  const all = loadObserved();
  if (name) all[day] = name; else delete all[day];
  // Day-sized choices; there is no reason to carry years of them around.
  const trimmed = Object.fromEntries(
    Object.entries(all).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 60));
  save(OBSERVED_KEY, trimmed);
  return trimmed;
}

/* ------------------------------------------------------------- bookmarks */
export interface Recent { route: string; title: string; at: number }

export function loadRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export function pushRecent(route: string, title: string) {
  if (!route || route === '#/') return;
  const list = loadRecent().filter(r => r.route !== route);
  list.unshift({ route, title, at: Date.now() });
  save(RECENT_KEY, list.slice(0, 8));
}

/* ------------------------------------------------------ recent searches */
/* What was looked for last, so looking for it again is one tap. */
const SEARCHES_KEY = 'dpc.searches';

export function loadSearches(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SEARCHES_KEY) || '[]');
    return Array.isArray(list) ? list.filter(s => typeof s === 'string').slice(0, 8) : [];
  } catch { return []; }
}

export function pushSearch(q: string): string[] {
  const term = q.trim();
  if (term.length < 2) return loadSearches();
  const list = [term, ...loadSearches().filter(s => s.toLowerCase() !== term.toLowerCase())].slice(0, 8);
  save(SEARCHES_KEY, list);
  return list;
}

export function clearSearches(): string[] {
  save(SEARCHES_KEY, []);
  return [];
}

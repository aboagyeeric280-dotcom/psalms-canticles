/* The psalter and the Office of Readings, flattened once and shared.

   This lived inside App.tsx while the router was the only thing that needed
   it. The dashboard now wants to look into an office as well — to name the
   psalms assigned today and quote the first line of the first one — so it
   moved here rather than being loaded twice.

   It stays under src/data/ deliberately: vite.config chunks that directory
   into data-book / data-psalter, which is what lets the service worker cache
   the texts apart from the app shell. */

import week1 from './weeks/week1.json';
import week2 from './weeks/week2.json';
import week3 from './weeks/week3.json';
import week4 from './weeks/week4.json';
import readingsData from './readings.json';
import complineData from './compline.json';
import { complineDayKey } from '../utils/liturgicalCalendar';
import type { Block, Office, ReadingsOffice } from '../types';

export const OFFICES: Office[] = [week1, week2, week3, week4]
  .flatMap(w => (w as unknown as { offices: Office[] }).offices);

export const READINGS: ReadingsOffice[] = [
  ...(readingsData as unknown as { weekly: ReadingsOffice[] }).weekly,
  ...(readingsData as unknown as { seasonal: ReadingsOffice[] }).seasonal,
];

/** The Office of Readings has its own route prefix; everything else is an hour. */
export const routeFor = (o: { id: string }) =>
  o.id.startsWith('read-') || o.id.startsWith('seasonal-')
    ? `#/readings/${o.id}`
    : `#/office/${o.id}`;

/** The hour before and after a given one, in the order the psalter runs. */
export function neighbours<T extends { id: string; title: string }>(list: T[], id: string) {
  const i = list.findIndex(o => o.id === id);
  if (i < 0) return { prev: null, next: null };
  const at = (n: number) => (list[n] ? { route: routeFor(list[n]), label: list[n].title } : null);
  return { prev: at(i - 1), next: at(i + 1) };
}

/* Compline is not in the psalter tables: the book prints it whole, and the
   app assembles it for the evening in hand. It still has psalms to name. */
const COMPLINE_DAYS = (complineData as unknown as {
  days: { key: string; blocks: Block[] }[];
}).days;

/** Whichever office a dashboard route points at, psalter or readings. */
export function officeByRoute(route: string): { blocks: Block[]; page?: number } | undefined {
  if (route.startsWith('#/compline')) {
    const key = complineDayKey(new Date());
    return COMPLINE_DAYS.find(d => d.key === key) ?? COMPLINE_DAYS.find(d => d.key === 'sun');
  }
  const id = route.replace(/^#\/(office|readings)\//, '');
  return OFFICES.find(o => o.id === id) ?? READINGS.find(o => o.id === id);
}

export interface PsalmCard {
  ref: string;
  title?: string;
  /** The opening words, for a card that has to say what the psalm sounds like. */
  incipit: string;
  anchor: string;
}

/** The psalms and canticles an office actually appoints, in order. */
export function psalmsOf(route: string): PsalmCard[] {
  const office = officeByRoute(route);
  if (!office) return [];
  const id = route.startsWith('#/compline')
    ? `compline-${complineDayKey(new Date())}-f`
    : route.replace(/^#\/(office|readings)\//, '');
  const out: PsalmCard[] = [];
  office.blocks.forEach((b, i) => {
    if (b.k !== 'psalm' && b.k !== 'cant') return;
    const first = b.strophes?.[0]?.[0]?.t ?? '';
    out.push({
      ref: b.ref,
      title: b.sectionTitle || b.title,
      // The tone slashes are for singing, not for a card three words long.
      incipit: first.replace(/\//g, '').replace(/\s+/g, ' ').trim(),
      anchor: `${id}-b${i}`,
    });
  });
  return out;
}

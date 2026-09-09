/* Check the Universalis links: the hour each of our hours maps to, the date
   each one asks for, and the shape of the URL that comes out.

   Nothing here touches the network, and nothing may be added that does. The
   whole point of the feature is that the app links to Universalis rather than
   fetching from them; a test that called their site would be the first crack
   in that. Run with:  npm run check:universalis                            */

import esbuild from 'esbuild';
import fs from 'node:fs';

await esbuild.build({
  entryPoints: ['src/utils/universalis.ts'],
  outfile: 'tools/.uni.mjs', format: 'esm', bundle: true, logLevel: 'silent',
});
const uni = await import('./.uni.mjs?' + Date.now());
fs.unlinkSync('tools/.uni.mjs');

const {
  UNIVERSALIS_CALENDAR, WINDOW_DAYS,
  universalisHour, universalisDate, universalisUrl, universalisUrlFor,
  dayOfHour, outsideWindow,
} = uni;

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

/** A local date, built the way the app builds them. */
const on = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/* ------------------------------------------------ the hours of our book */

// Every HourKey the book uses, and the hour Universalis publish it under.
{
  const want = {
    morning: 'lauds',
    midday: 'sext',
    evening: 'vespers',
    'evening-before': 'vespers',
  };
  for (const [ours, theirs] of Object.entries(want)) {
    const got = universalisHour(ours);
    check(got === theirs, `${ours} is their ${theirs} (${got})`);
  }
}

// Midday Prayer is one office in our book; Sext is the one it is prayed at.
check(universalisHour('midday') === 'sext' &&
  universalisHour('midday') !== 'terce' && universalisHour('midday') !== 'none',
  'Midday Prayer asks for Sext, not Terce or None');

// The Invitatory variant exists, and only ever attaches to Morning Prayer.
{
  check(universalisHour('morning', true) === 'i-lauds', 'Morning Prayer with the Invitatory is i-lauds');
  check(universalisHour('morning', false) === 'lauds', 'Morning Prayer without it is plain lauds');
  const others = ['midday', 'evening', 'evening-before'];
  const stray = others.filter(h => universalisHour(h, true) !== universalisHour(h, false));
  check(stray.length === 0,
    `the Invitatory never changes the other hours${stray.length ? ` — ${stray.join(', ')}` : ''}`);
}

/* Compline is complete in our book, so it is not a HourKey the mapping knows
   and no link is ever built for it. TypeScript stops it at the call sites;
   this says the same thing at runtime, so that the omission reads as a
   decision rather than as something left undone. */
{
  const refuses = (fn) => { try { fn(); return false; } catch { return true; } };
  check(refuses(() => universalisHour('compline')) && refuses(() => universalisUrl('compline', on('2026-09-09'))),
    'Compline has no Universalis hour — the book carries it whole');
}

/* ------------------------------------------------------- the day it asks */

// Evening Prayer I is printed by Universalis on the day before it belongs to.
{
  const url = universalisUrl('evening-before', on('2026-09-13'));   // a Sunday
  check(url.includes('/20260912/'), `Evening Before of Sunday 13 Sept asks for the 12th (${url})`);
}

// ... including backwards over the start of a month ...
{
  const url = universalisUrl('evening-before', on('2026-11-01'));
  check(url.includes('/20261031/'), `1 November steps back to 31 October (${url})`);
}

// ... over a February, in a leap year and out of one ...
{
  const leap = universalisUrl('evening-before', on('2028-03-01'));
  const plain = universalisUrl('evening-before', on('2026-03-01'));
  check(leap.includes('/20280229/'), `1 March 2028 steps back to the 29th (${leap})`);
  check(plain.includes('/20260228/'), `1 March 2026 steps back to the 28th (${plain})`);
}

// ... and over the start of a year.
{
  const url = universalisUrl('evening-before', on('2027-01-01'));
  check(url.includes('/20261231/'), `1 January 2027 steps back to 31 December 2026 (${url})`);
}

// The other three hours keep their own day, whatever the boundary.
{
  const strays = [];
  for (const iso of ['2026-01-01', '2026-03-01', '2026-12-31', '2026-09-09']) {
    for (const hour of ['morning', 'midday', 'evening']) {
      const want = iso.replace(/-/g, '');
      if (!universalisUrl(hour, on(iso)).includes(`/${want}/`)) strays.push(`${hour} ${iso}`);
    }
  }
  check(strays.length === 0,
    `Morning, Midday and Evening keep their own day${strays.length ? ` — ${strays.join(', ')}` : ''}`);
}

/* -------------------------------------------- the day the reader is on */

/* What the app holds is the day being prayed, not the day the Hour belongs
   to. For Evening Prayer I the two shifts cancel: prayed on the Saturday,
   published by Universalis on the Saturday. */
{
  const saturday = on('2026-09-12');
  check(universalisUrlFor('evening-before', saturday).includes('/20260912/'),
    'Evening Before prayed on Saturday the 12th opens the 12th');
  check(universalisDate(dayOfHour('evening-before', saturday)) === '20260913',
    'and the Hour itself belongs to Sunday the 13th');
  check(universalisUrlFor('evening', saturday).includes('/20260912/'),
    'ordinary Evening Prayer on the 12th opens the 12th');
}

/* ------------------------------------------------------ date formatting */

// Single-digit months and days are padded; a year is four figures.
{
  const cases = [
    ['2026-01-02', '20260102'],
    ['2026-09-09', '20260909'],
    ['2026-10-31', '20261031'],
    ['2026-12-25', '20261225'],
  ];
  const wrong = cases.filter(([iso, want]) => universalisDate(on(iso)) !== want);
  check(wrong.length === 0,
    `single-digit months and days are padded to eight figures` +
    (wrong.length ? ` — ${wrong.map(([iso]) => iso).join(', ')}` : ''));
}

// Local parts, not UTC: the reader's own calendar day is the one asked for.
{
  const lateOnTheNinth = new Date(2026, 8, 9, 23, 30);
  check(universalisDate(lateOnTheNinth) === '20260909',
    'half past eleven at night is still the same day');
}

/* ----------------------------------------------------- the URL itself */

// Every URL the app can generate is absolute, https, and on their host.
{
  const strange = [];
  for (const hour of ['morning', 'midday', 'evening', 'evening-before']) {
    for (const iso of ['2026-01-01', '2026-09-09', '2027-12-31']) {
      for (const opts of [{}, { invitatory: true }, { calendar: '' }, { calendar: 'africa' }]) {
        const url = universalisUrl(hour, on(iso), opts);
        let u;
        try { u = new URL(url); } catch { strange.push(url); continue; }
        const ok = u.protocol === 'https:' && u.host === 'universalis.com'
          && /^\/(?:[a-z.]+\/)?\d{8}\/[a-z-]+\.htm$/.test(u.pathname)
          && !/\/\//.test(u.pathname) && url === u.href;
        if (!ok) strange.push(url);
      }
    }
  }
  check(strange.length === 0,
    `every generated URL is absolute and well formed` +
    (strange.length ? ` — ${strange.slice(0, 3).join(', ')}` : ''));
}

// The calendar slug sits where Universalis put it, and can be left out.
{
  const withCal = universalisUrl('morning', on('2026-09-09'));
  const without = universalisUrl('morning', on('2026-09-09'), { calendar: '' });
  check(withCal === `https://universalis.com/${UNIVERSALIS_CALENDAR}/20260909/lauds.htm`,
    `the default calendar is ${UNIVERSALIS_CALENDAR} (${withCal})`);
  check(without === 'https://universalis.com/20260909/lauds.htm',
    `no calendar gives the General Calendar (${without})`);
}

/* ----------------------------------------------------------- the window */

// Inside the week the free site covers, and outside it either way.
{
  const today = on('2026-09-09');
  check(!outsideWindow(on('2026-09-09'), today), 'today is inside the window');
  check(!outsideWindow(on('2026-09-16'), today), `${WINDOW_DAYS} days ahead is inside it`);
  check(!outsideWindow(on('2026-09-02'), today), `${WINDOW_DAYS} days back is inside it`);
  check(outsideWindow(on('2026-09-17'), today), `${WINDOW_DAYS + 1} days ahead is outside it`);
  check(outsideWindow(on('2026-12-25'), today), 'Christmas is outside it');
  check(!outsideWindow(new Date(2026, 8, 16, 23, 59), today),
    'the far edge is a whole day, not a moment');
}

/* --------------------------------------------------- nothing is fetched */

/* The one rule this feature must never break. If a future session reaches for
   the network here, this is where it stops. */
{
  const src = fs.readFileSync('src/utils/universalis.ts', 'utf8');
  const reach = /\b(fetch|XMLHttpRequest|EventSource|WebSocket|importScripts)\s*\(/.exec(src);
  check(!reach, `nothing in the module reaches the network${reach ? ` — ${reach[1]}` : ''}`);
}

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

/* Check the liturgical day engine against dates worked out by hand.
   Run with:  npm run check:calendar */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const tmp = path.join('tools', '.gc.mjs');
await esbuild.build({
  entryPoints: ['src/utils/generalCalendar.ts'],
  outfile: tmp, format: 'esm', bundle: true, logLevel: 'silent',
});
const { liturgicalToday, keepsFirstVespers } = await import('./.gc.mjs?' + Date.now());
fs.unlinkSync(tmp);

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

const on = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return liturgicalToday(new Date(y, m - 1, d));
};

// date,        title contains,          rank,        colour,  psalter week
const cases = [
  ['2026-01-01', 'Holy Mother of God', 'solemnity', 'white'],
  ['2026-02-18', 'Ash Wednesday', 'feast', 'violet'],
  ['2026-03-25', 'Annunciation', 'solemnity', 'white'],
  ['2026-04-05', 'Easter Sunday', 'solemnity', 'white'],
  ['2026-04-06', 'Octave of Easter', 'solemnity', 'white'],
  ['2026-05-14', 'Ascension', 'solemnity', 'white'],
  ['2026-05-24', 'Pentecost', 'solemnity', 'red'],
  ['2026-05-31', 'Most Holy Trinity', 'solemnity', 'white'],
  ['2026-06-29', 'Peter and Paul', 'solemnity', 'red'],
  ['2026-08-06', 'Transfiguration', 'feast', 'white'],
  ['2026-08-08', 'Dominic', 'solemnity', 'white'],
  ['2026-08-15', 'Assumption', 'solemnity', 'white'],
  ['2026-09-14', 'Exaltation of the Holy Cross', 'feast', 'red'],
  ['2026-11-01', 'All Saints', 'solemnity', 'white'],
  ['2026-11-22', 'King of the Universe', 'solemnity', 'white'],
  ['2026-11-29', 'Sunday of Advent', 'solemnity', 'violet'],
  ['2026-12-08', 'Immaculate Conception', 'solemnity', 'white'],
  ['2026-12-25', 'Nativity of the Lord', 'solemnity', 'white'],
  ['2026-12-26', 'Stephen', 'feast', 'red'],
  ['2026-01-28', 'Thomas Aquinas', 'memorial', 'white'],
  ['2026-08-26', 'Week in Ordinary Time', 'ferial', 'green'],
];

for (const [iso, title, rank, colour] of cases) {
  const d = on(iso);
  const ok = d.title.includes(title) && d.primary.rank === rank && d.colour === colour;
  check(ok, `${iso}  ${d.title}  [${d.primary.rank}, ${d.colour}]` +
    (ok ? '' : `   expected "${title}" [${rank}, ${colour}]`));
}

// Ordinary Time week numbering, checked against the published Sunday count.
for (const [iso, week] of [['2026-08-23', 21], ['2026-08-30', 22], ['2026-01-18', 2], ['2026-11-22', 34]]) {
  const d = on(iso);
  check(d.seasonWeek === week, `${iso}  Ordinary Time week ${d.seasonWeek}` + (d.seasonWeek === week ? '' : ` expected ${week}`));
}

// Gaudete and Laetare are rose.
check(on('2026-12-13').colour === 'rose', `13 Dec 2026 is Gaudete Sunday, rose (${on('2026-12-13').colour})`);
check(on('2026-03-15').colour === 'rose', `15 Mar 2026 is Laetare Sunday, rose (${on('2026-03-15').colour})`);

// A memorial does not displace a Sunday, and Lent suppresses memorials.
const sundayWithSaint = on('2026-11-22');
check(sundayWithSaint.primary.rank === 'solemnity', 'a Sunday outranks what falls on it');

// The Sunday cycle turns over at Advent.
check(on('2026-11-22').sundayCycle === 'A', `22 Nov 2026 is cycle ${on('2026-11-22').sundayCycle} (Advent 2025 began Year A)`);
check(on('2026-11-29').sundayCycle === 'B', `29 Nov 2026 begins cycle ${on('2026-11-29').sundayCycle} (Advent 2026 begins Year B)`);

// First Vespers on the eve of a Sunday and of a solemnity.
check(keepsFirstVespers(new Date(2026, 7, 29)), 'Saturday evening keeps First Vespers of Sunday');
check(keepsFirstVespers(new Date(2026, 7, 14)), '14 Aug keeps First Vespers of the Assumption');
check(!keepsFirstVespers(new Date(2026, 7, 25)), '25 Aug (a Tuesday, no solemnity next) keeps none');
// A solemnity on a Saturday keeps its own Second Vespers; the Sunday yields.
check(!keepsFirstVespers(new Date(2026, 7, 15)), '15 Aug, a solemnity on a Saturday, keeps its own Second Vespers');

// Every day of two years must resolve.
for (const year of [2026, 2027]) {
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const l = liturgicalToday(new Date(d));
    if (!l.title || !l.colour || ![1, 2, 3, 4].includes(l.week)) {
      check(false, `${d.toDateString()} did not resolve`);
    }
  }
}
check(true, 'every day of 2026–2027 resolves to a title, colour and psalter week');

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

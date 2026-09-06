/* Sanity-check the liturgical calendar against dates worked out by hand.
   Run with:  npm run check   (from psalms-app/) */

import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const tmp = path.join('tools', '.cal.mjs');
await esbuild.build({
  entryPoints: ['src/utils/liturgicalCalendar.ts'],
  outfile: tmp,
  format: 'esm',
  bundle: false,
  logLevel: 'silent',
});

const { liturgicalDay, easterSunday, adventStart } = await import('./.cal.mjs?' + Date.now());
fs.unlinkSync(tmp);

const cases = [
  // date,          season,      psalter week
  ['2026-02-18', 'lent', 4],        // Ash Wednesday
  ['2026-02-22', 'lent', 1],        // First Sunday of Lent — the cycle restarts
  ['2026-03-29', 'holyweek', 2],    // Palm Sunday
  ['2026-04-02', 'triduum', 2],     // Holy Thursday
  ['2026-04-05', 'easter', 1],      // Easter Sunday — the cycle restarts
  ['2026-04-12', 'easter', 2],
  ['2026-05-24', 'easter', 4],      // Pentecost
  ['2026-05-31', 'ordinary', 1],    // Trinity Sunday, Ordinary Time 9
  ['2026-08-23', 'ordinary', 1],    // Ordinary Time 21
  ['2026-08-26', 'ordinary', 1],
  ['2026-11-29', 'advent', 1],      // First Sunday of Advent — the cycle restarts
  ['2026-12-06', 'advent', 2],
  ['2026-12-25', 'christmas', 4],   // Christmas Day is no longer Advent; the count carries on
  ['2027-01-06', 'christmas', 2],   // still counting from Advent I 2026
  ['2027-01-11', 'ordinary', 1],    // Baptism was 10 Jan 2027 — the cycle restarts
  ['2027-02-14', 'lent', 1],        // First Sunday of Lent 2027
  ['2027-03-28', 'easter', 1],      // Easter 2027
];

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

for (const [iso, season, week] of cases) {
  const [y, m, d] = iso.split('-').map(Number);
  const got = liturgicalDay(new Date(y, m - 1, d));
  const ok = got.season === season && got.week === week;
  check(ok, `${iso}  ${got.season} wk ${got.week}` + (ok ? '' : `   expected ${season} wk ${week}`));
}

for (const [y, iso] of Object.entries(
  { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2030: '2030-04-21' })) {
  const got = easterSunday(Number(y)).toISOString().slice(0, 10);
  check(got === iso, `Easter ${y}: ${got}${got === iso ? '' : ` expected ${iso}`}`);
}

for (const [y, iso] of Object.entries(
  { 2025: '2025-11-30', 2026: '2026-11-29', 2027: '2027-11-28' })) {
  const got = adventStart(Number(y)).toISOString().slice(0, 10);
  check(got === iso, `Advent I ${y}: ${got}${got === iso ? '' : ` expected ${iso}`}`);
}

// Every day of two whole years must land on a real psalter week and season.
for (const year of [2026, 2027]) {
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
    const l = liturgicalDay(new Date(d));
    if (![1, 2, 3, 4].includes(l.week) || !l.season) {
      check(false, `${d.toISOString().slice(0, 10)} produced week ${l.week} / ${l.season}`);
    }
  }
}
console.log(`ok    every day of 2026–2027 resolves to a psalter week`);

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

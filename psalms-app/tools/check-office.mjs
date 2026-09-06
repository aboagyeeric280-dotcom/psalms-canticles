/* Check that each kind of liturgical day is routed to the right part of the
   book. Run with:  npm run check:office */

import esbuild from 'esbuild';
import fs from 'node:fs';

for (const [entry, out] of [
  ['src/utils/generalCalendar.ts', 'tools/.gc2.mjs'],
  ['src/utils/officeForDay.ts', 'tools/.of2.mjs'],
]) {
  await esbuild.build({ entryPoints: [entry], outfile: out, format: 'esm', bundle: true, logLevel: 'silent' });
}
const { liturgicalToday } = await import('./.gc2.mjs?' + Date.now());
const { officeForDay } = await import('./.of2.mjs?' + Date.now());
fs.unlinkSync('tools/.gc2.mjs');
fs.unlinkSync('tools/.of2.mjs');

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

const on = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return liturgicalToday(new Date(y, m - 1, d));
};
const planOn = (iso, opts) => officeForDay(on(iso), opts);
const src = (plan, hour) => plan.hours.find(h => h.hour === hour).source;

// An ordinary Sunday takes the psalter's own Sunday office, not festal psalms.
{
  const p = planOn('2026-08-30');
  check(!p.festal && src(p, 'morning') === 'psalter' && src(p, 'evening') === 'psalter',
    `an ordinary Sunday keeps the psalter (morning ${src(p, 'morning')}, evening ${src(p, 'evening')})`);
}

// A solemnity of a saint: festal psalms, Evening Prayer from the common.
{
  const p = planOn('2026-08-15');
  check(p.festal && src(p, 'morning') === 'festal' && src(p, 'evening') === 'common',
    `the Assumption is festal with Evening Prayer from the common (${src(p, 'evening')})`);
}

// Easter is a Sunday and still festal, because the book prints its proper.
{
  const p = planOn('2026-04-05');
  check(p.festal && src(p, 'evening') === 'proper',
    `Easter Sunday uses the proper (${src(p, 'evening')})`);
}

// A feast: festal psalms too.
{
  const p = planOn('2026-08-06');
  check(p.festal && src(p, 'morning') === 'festal', 'the Transfiguration takes the festal psalms');
}

// A memorial: the weekday psalter, and the app says what the book lacks.
{
  const p = planOn('2026-01-28');
  const evening = p.hours.find(h => h.hour === 'evening');
  check(!p.festal && src(p, 'morning') === 'psalter' && !!evening.caveat,
    'a memorial keeps the weekday psalter and flags the missing proper');
}

// A ferial weekday: psalter throughout.
{
  const p = planOn('2026-08-26');
  const psalter = p.hours.filter(h => h.source === 'psalter').length;
  check(psalter >= 4, `a ferial weekday is psalter throughout (${psalter} of ${p.hours.length} hours)`);
}

// Only an actual Sunday is described as one. A weekday shares the shape of a
// plain Sunday — temporal, no proper — so the day of the week has to be part
// of the test, or every ferial reads as "Sunday of Week II".
{
  const mon = planOn('2026-08-31');
  const sun = planOn('2026-08-30');
  check(/^A weekday/.test(mon.summary), `Monday is described as a weekday — "${mon.summary}"`);
  check(/^Sunday of Week/.test(sun.summary), `Sunday is described as a Sunday — "${sun.summary}"`);
}

// First Vespers on the eve of a solemnity.
{
  const p = planOn('2026-08-14', { firstVespers: true });
  const evening = p.hours.find(h => h.hour === 'evening');
  check(evening.label === 'First Vespers', `14 August offers ${evening.label}`);
}

// Compline follows Sunday on a solemnity.
{
  const p = planOn('2026-08-15');
  check(/Sunday/.test(p.hours.find(h => h.hour === 'compline').detail),
    'Compline takes the Sunday psalms on a solemnity');
}

// Every day of two years yields a complete, routable plan.
{
  let broken = [];
  for (const year of [2026, 2027]) {
    for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      const p = officeForDay(liturgicalToday(new Date(d)));
      if (p.hours.length !== 5 || p.hours.some(h => !h.route || !h.detail)) {
        broken.push(d.toDateString());
      }
    }
  }
  check(broken.length === 0,
    `every day of 2026–2027 yields five routable hours` +
    (broken.length ? ` — ${broken.slice(0, 3).join(', ')}` : ''));
}

// Routes must point at things the app can actually open.
{
  const known = /^#\/(office\/w[1-4]-(sun|mon|tue|wed|thu|fri|sat)-(morning|midday|evening|evening-before)|readings\/read-w[1-4]-\w+|compline|feasts\/(common|proper)|tables)$/;
  const routes = new Set();
  for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    for (const h of officeForDay(liturgicalToday(new Date(d))).hours) routes.add(h.route);
  }
  const strange = [...routes].filter(r => !known.test(r));
  check(strange.length === 0, `every route is one the app serves` + (strange.length ? ` — ${strange.join(', ')}` : ''));
}

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

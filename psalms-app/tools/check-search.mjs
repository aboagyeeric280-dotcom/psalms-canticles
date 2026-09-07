/* Check that the book can be searched the way a reader searches it: a phrase
   from a psalm, a psalm number, a half-remembered line, a misspelling — and
   that every answer names a place the app can actually open.
   Run with:  npm run check:search */

import esbuild from 'esbuild';
import fs from 'node:fs';

await esbuild.build({
  entryPoints: ['src/utils/search.ts'],
  outfile: 'tools/.search.mjs',
  format: 'esm', bundle: true, loader: { '.json': 'json' }, logLevel: 'silent',
});
const S = await import('./.search.mjs?' + Date.now());
fs.unlinkSync('tools/.search.mjs');

let bad = 0;
const check = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${line}`); };

const t0 = Date.now();
const idx = S.getIndex();
const built = Date.now() - t0;

check(idx.units.length > 8000, `the index holds the whole book — ${idx.units.length} searchable lines`);
check(built < 2000, `it builds in ${built} ms`);

// Anchors must be the ones the reader renders, or a hit opens the wrong verse.
{
  const strange = idx.units.filter(u => !/^[a-z0-9-]+-b\d+$/.test(u.anchor));
  check(strange.length === 0,
    `every line carries a block anchor${strange.length ? ` — ${strange[0].anchor}` : ''}`);
}

// Routes must be ones the router serves.
{
  const known = /^#\/(office\/|readings\/|compline\/(sun|mon|tue|wed|thu|fri|sat)$|canticle\/(zechariah|mary)\/\d+$|invitatory$|te-deum$|midday-hymns$|dominican$|feasts\/(common|proper)$|prayers$|about$)/;
  const routes = [...new Set(idx.units.map(u => u.route))];
  const strange = routes.filter(r => !known.test(r));
  check(strange.length === 0,
    `all ${routes.length} routes are ones the app opens${strange.length ? ` — ${strange.slice(0, 3)}` : ''}`);
}

const first = (q, f) => S.search(q, f).groups[0]?.best.unit;

// A phrase from inside a psalm is found, and found in the psalm it belongs to.
{
  const u = first('let me see you in the sanctuary');
  check(!!u && u.num === 63 && u.s === 1 && u.l === 0,
    `a phrase lands on its own line — ${u ? `${u.ref}, strophe ${u.s + 1} line ${u.l + 1}` : 'not found'}`);
}

// Pointing, apostrophes and accents must not stand between reader and text.
{
  const withTones = idx.units.find(u => u.text.includes('/') && u.n.split(' ').length > 4);
  const plain = withTones ? S.normalise(withTones.text) : '';
  const u = withTones ? first(plain) : null;
  check(!!u, `a pointed line is found when typed plainly — “${plain.slice(0, 42)}…”`);
}

// A bare number is a lookup, not a word search.
{
  const out = S.search('23');
  check(out.mode === 'reference' && out.groups.every(g => g.best.unit.num === 23),
    `“23” looks up Psalm 23 — ${out.groups.length} place(s)`);
  check(out.groups[0]?.best.unit.head === true, 'and lands on the psalm’s own heading');
}
{
  const out = S.search('Psalm 119:105');
  const u = out.groups[0]?.best.unit;
  const covers = u && /119/.test(u.ref ?? '');
  check(out.mode === 'reference' && covers,
    `“Psalm 119:105” opens the section printing that verse — ${u ? u.ref : 'not found'}`);
}

// A phrase the book breaks across two printed lines is still one phrase.
{
  const out = S.search('God, you are my God, and I long for you');
  const u = out.groups[0]?.best.unit;
  check(out.mode === 'phrase' && u?.num === 63,
    `a phrase running over a line break is found — ${u ? u.ref : 'not found'}`);
  check(out.groups[0]?.best.l === 0,
    'and names the line it starts on');
}

// Words in any order, for a line remembered loosely.
{
  const out = S.search('sanctuary see mighty glorious');
  const u = out.groups[0]?.best.unit;
  check(out.mode === 'words' && u?.num === 63,
    `words in any order still find the verse — ${out.groups.length} result(s)`);
}

// One letter wrong is still the same psalm.
{
  const out = S.search('sanctuery');
  check(out.mode === 'near' && out.groups.length > 0,
    `a misspelling falls back to the near spelling — “${out.didYouMean}”`);
}

// Quoted means quoted.
{
  const out = S.search('"mighty and sanctuary"');
  check(out.groups.length === 0, 'a quoted phrase that is not printed returns nothing');
}

// Filters narrow the pool.
{
  const all = S.search('lord');
  const ants = S.search('lord', 'antiphon');
  check(ants.groups.length > 0 && ants.groups.every(g => g.best.unit.kind === 'antiphon') &&
    ants.total < all.total,
    `the antiphon filter returns antiphons only — ${ants.total} of ${all.total} places`);
}

// Repeats collapse: the psalter prints the same psalm many times.
{
  const out = S.search('the lord is my shepherd');
  const g = out.groups[0];
  check(!!g, 'a famous line is found');
  if (g) check(out.total >= g.others.length + 1,
    `its repeats collapse into one answer with ${g.others.length} other place(s)`);
}

// Landmarks the psalm numbers cannot reach.
{
  check(S.landmarkFor('magnificat')?.route === '#/canticle/mary', '“Magnificat” names the Canticle of Mary');
  check(S.landmarkFor('te deum')?.route === '#/te-deum', '“Te Deum” names the Te Deum');
}

// Marking, which is what the reader actually sees.
{
  const frags = S.markUp('Let me see you in the sanctuary;', ['sanctuary']);
  check(frags.some(f => f.hit && f.text === 'sanctuary') && frags.map(f => f.text).join('') === 'Let me see you in the sanctuary;',
    'a match is marked without altering a character of the text');
  const pointed = S.markUp('God, you are / my God,*', ['my god']);
  check(pointed.map(f => f.text).join('') === 'God, you are / my God,*' && pointed.some(f => f.hit),
    'and marks across the tone marks the book prints');
}

// Speed, on the whole book, for every keystroke.
{
  const t = Date.now();
  for (const q of ['lo', 'lord', 'lord is', 'lord is my', 'lord is my shepherd']) S.search(q);
  const ms = Date.now() - t;
  check(ms < 600, `five keystrokes across the whole book take ${ms} ms`);
}

console.log(bad ? `\n${bad} failing` : '\nall good');
process.exit(bad ? 1 : 0);

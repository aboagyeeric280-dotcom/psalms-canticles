# Daily Psalms and Canticles — offline PWA

An offline-first Progressive Web App for **Daily Psalms and Canticles**, the
Dominican prayer book of the Province of St Joseph the Worker (Nigeria &
Ghana), published by Dominican Publications, Box 44, Yaba, Lagos.

Every text in the app is transcribed from the 440-page printed book. Nothing
is paraphrased or supplied from another edition, with two clearly-labelled
exceptions noted under **Fidelity** below.

```
.
├── psalms-app/          the app
└── tools/               the pipeline that turns the PDF into the app's data
```

## Running it

```bash
cd psalms-app && npm install && npm run dev
```

```bash
npm run build       # typecheck, bundle, then stamp the service worker
```

```bash
npm run check:all   # liturgical calendar + service-worker offline behaviour
```

`npm run build` writes `dist/`, which is a plain static directory — any host
that serves files over HTTPS will do. Nothing runs on a server.

## What is in the app

| Route | Contents |
| --- | --- |
| `#/` | Dashboard: the hour to pray now, psalter week, season, everything else |
| `#/office/w{1-4}-{day}-{hour}` | 84 offices — Morning, Midday, Evening and the Sunday Evening Before, Weeks I–IV |
| `#/readings/{id}` | 28 Office of Readings sections plus 4 seasonal extended psalms (78, 105, 106) |
| `#/compline` | Night Prayer, assembled end to end for the evening in hand |
| `#/dominican` | Compline supplements: Salve Regina, O Lumen, Inviolata, Regina Caeli, Magne Pater, the Twi and Lingala hymns, De Profundis, Litany of Loreto |
| `#/canticle/zechariah`, `#/canticle/mary` | Nine settings each of the Benedictus and the Magnificat |
| `#/feasts/common`, `#/feasts/proper` | Evening Prayer for the commons and for Christmas through Christ the King |
| `#/invitatory`, `#/te-deum`, `#/midday-hymns` | The frequently-used texts |
| `#/prayers` | The 34 weekly collects, and the Good Friday / Holy Saturday intercessions |
| `#/tables` | The book's own psalm index and feast-day psalm tables |
| `#/about` | Foreword, the order of the hours, the psalm tones |

## Reading experience

- **Two-choir setting.** A line space in the book means the singing changes
  sides (its own legend, p. 5). Strophes are therefore marked **A** / **B**
  and tinted, so a community can see at a glance whose verse is next.
- **Tone marks.** The accents and slashes that mark where the pitch changes
  are shown as written and highlighted; they can be switched off.
- **Antiphons by season.** The book prints Advent, Lent, Eastertide and
  Through-the-Year antiphons stacked together. The app brings forward the one
  the calendar calls for and folds the rest away — it never removes them, and
  "Show every season" restores the printed page exactly.
- **Themes.** Light, warm sepia for chapel reading, and true-black OLED for
  Compline. The accent colour follows the liturgical season (violet in Advent
  and Lent, gold at Christmas and Easter, green through the year, red in Holy
  Week); that can be switched off too.
- Font size, line height and serif/sans are adjustable and persist.

## The liturgical calendar

Three modules. `liturgicalCalendar.ts` computes the temporal cycle — Easter,
Advent, the Baptism of the Lord, the seasons and the psalter week.
`generalCalendar.ts` adds the movable feasts, the General Roman Calendar with
the Order's own days, and the precedence that decides between them, yielding
the day's title, rank, colour and Sunday cycle. `officeForDay.ts` routes that
day to the right part of the book.

romcal would have been the obvious dependency, and neither published version
is usable: v1 is 4.6 MB and depends on the deprecated moment, and v3.0.0 does
not export its `Romcal` engine at all — `index.d.ts` declares the class, the
shipped JavaScript does not contain it. `src/data/sanctoral.ts` is a few
kilobytes instead, and the whole engine adds about 13 kB to the bundle.

Precedence is the part that repays care, because rank alone does not decide
it. A Sunday in Ordinary Time and a solemnity are both high, and the solemnity
wins — but in Lent the Sunday does. A memorial in Lent yields to the weekday
and is only commemorated. A solemnity falling on a Saturday keeps its own
Second Vespers, so the following Sunday's First Vespers gives way. The module
therefore follows the Table of Liturgical Days rather than comparing ranks.

What the app cannot do is supply texts the book does not contain. There are no
sanctoral propers in it, so on a memorial the app keeps the weekday psalter,
points at the relevant common, and says plainly that the proper antiphons and
collect are not printed here.

The psalter week still comes from the rule the book itself gives on p. 437:

> The psalms and canticles on Ferials and Memorials are from the four week
> cycle. This begins afresh on the first Sundays of Advent and Lent, Easter
> Sunday and the first ordinary Sunday of the year.

So there are exactly four restart points and the count simply carries on
between them — including straight through Pentecost into Ordinary Time, which
is what makes the app agree with the Ordinary-Time week numbering.
`npm run check` verifies this against dates worked out by hand.
`npm run check:calendar` does the same for the sanctoral cycle — Easter, Ash
Wednesday, the Assumption, Christ the King, Gaudete and Laetare, the Sunday
cycle — and `npm run check:office` asserts that each kind of day is routed to
the right part of the book. All three walk every day of two years.

## Offline

The whole build — app, texts and the engraved music pages — is precached on
install, 4.5 MB in 28 files. After one visit the app needs no network at all.
`tools/sw-build.mjs` stamps the file list and a content hash into `sw.js`
after each build, so a new release invalidates the old cache cleanly.
`npm run check:sw` runs the built worker against stub caches with the network
switched off and asserts that navigations, assets and music plates all still
resolve.

## The pipeline

The PDF is a mix of digital type and scanned engraved music. `tools/` turns it
into the app's data:

```bash
npm run data     # parse the text, audit it, split it into src/data/
npm run plates -- "<book>.pdf" public/plates   # render the music pages
npm run icons    # rasterise the app icon
```

| File | Job |
| --- | --- |
| `tools/lib.js` | OCR normalisation and the heading grammar (psalms, canticles, antiphons, sections) |
| `tools/parse.js` | Page-by-page parse into typed blocks |
| `tools/tables.js` | The three two-column tables: psalm index, feast tables, Litany of Loreto |
| `tools/render/lines.mjs` | Every line of the book with its baseline, x position and point size |
| `tools/geom.js` + `tools/regroup.js` | Re-cut the stanza boundaries from that geometry — see below |
| `tools/audit.js` | Checks the result — see below |
| `tools/split.js` | Splits into the per-feature JSON the app imports, and builds the search index |
| `tools/readdocx.js` + `tools/canticles.js` | Import the nine settings of each gospel canticle from the standardised `.docx` — see below |
| `tools/render/plates.mjs` | Renders the 17 engraved-music pages to PNG (MuPDF WASM, no native toolchain) |
| `tools/icons.mjs` | Draws the arms of the Order — per pale argent and sable, a cross fleury counterchanged — and writes the PNGs with a hand-rolled encoder |

Text extraction came from `pdftotext -layout`, whose font mapping turned the
book's curly quotes into `A` and `@`, its apostrophe into `=`, its en-dash into
` B `, and dropped the space in a few pronoun pairs (`iwill`, `Iam`). Those
substitutions are reversed in `tools/lib.js`, and the audit asserts none
survive.

### Stanza grouping

The book sets its psalms in stanzas — most often four lines, but running from
two to fourteen — and a stanza break is where the singing changes sides, so
getting it right matters more than it would in prose.

`pdftotext` cannot supply it. Its blank lines come from a spacing heuristic
that fires both too often and too rarely: it breaks Psalm 141's seven-line
second stanza into couplets, and splits Compline's third hymn into six pieces
where the book has three. Grouping on those blank lines yields 3,965 stanzas
against the book's ~1,969.

So the grouping is taken from the page itself. `tools/render/lines.mjs` reads
every line's **baseline** and point size out of the PDF with MuPDF, and
MuPDF's layout analysis emits an empty line exactly where the book leaves
vertical space. Two details keep that honest:

- The bbox is not usable as a reference — it grows whenever a line happens to
  carry one of the book's pitch accents, which reads as a change of leading.
  The baseline does not move.
- MuPDF occasionally emits a marker where there is no space at all. Measuring
  across it settles the question: a real break spans 18pt or more, and
  ordinary leading never exceeds 15.

A page turn is the one thing that cannot be measured, since no space is
visible across it. There the book's own convention decides — it prints "+n"
at the foot of a page when a stanza runs on, which it does at 120 of the 269
turns that fall inside a psalm.

`tools/regroup.js` then moves the existing line objects between arrays. It
never edits a line, and it refuses to touch any psalm whose geometry does not
account for exactly the lines the app holds, reporting it instead.
`tools/verify-regroup.js` confirms afterwards that every line sequence is
byte-for-byte what it was. As a check on the result, 98% of stanza endings
fall at the end of a sentence, and no stanza in the psalter is a single line.

### The gospel canticles

The Benedictus and the Magnificat do not come from the PDF. The book prints
nine settings of each, but four of the Zechariah settings and two of the Mary
settings appear there only as engraved music, so there was no text to extract.
They are taken instead from the manually corrected document, vendored as
`tools/canticles.docx`, which carries all eighteen.

The text is used exactly as that document writes it. Every setting marks its
tone differently and all of it is meaningful: acute and grave accents on the
syllable that changes pitch (`frée`, `hé mâde`, `sò nów`), slashes at the same
job in the Grail and Anglican settings, hyphens splitting syllables across a
neum (`Is-ra-el`, `sal/va-tion`), asterisks for the flex, and elisions
(`Bless'd`, `heav'n`). None of it is normalised.

The document has almost no blank lines; it carries its stanza breaks in each
paragraph's space-after, which `tools/readdocx.js` reads out of the XML.
`tools/check-canticles.js` re-reads the `.docx` independently of the importer
and asserts that every line of all eighteen settings is byte-identical to what
the app holds, and that every stanza division matches too — the groupings were
verified by hand and must not drift. Where the book does have the engraved score, it is kept beneath the
text rather than discarded.

One consequence worth knowing: the app renders a `/` as a slash, not as some
other accent glyph. That is what the document writes, it is what a singer
reads, and in the table of psalm tones on p. 7 the slash separates segments
rather than marking an accent at all.

### The audit

`tools/audit.js` uses the book's own index of psalms as an oracle: it lists,
for every psalm, the printed pages it appears on, so a dropped or misread
heading shows up as an index entry pointing at a page where no such psalm was
parsed. It currently reports:

```
84 offices, 32 reading sections, 383 psalms and canticles, 17 engraved plates
all 218 index references resolve to a parsed psalm
```

Two index entries are deliberately exempt: pp. 298 and 413 print a
cross-reference to a psalm rather than the psalm itself.

## Fidelity

- **Music.** 17 pages are engraved score with no machine-readable text — the
  Te Deum, four Benedictus settings, the Dominican Compline Supplement, the
  Latin Salve Regina, Inviolata, Regina Caeli, O Lumen and Magne Pater, and
  the Good Friday and Holy Thursday/Saturday intercessions. They are
  reproduced as images at 200 dpi with captions, inverted under the dark
  theme.
- **The frame of the hour.** The book prints the psalmody day by day and
  describes the surrounding structure once, in the table on p. 5. The app
  reproduces that structure around each office as a collapsible outline, and
  says plainly where the book leaves a choice to the community (hymns for
  Morning and Evening Prayer are not printed in it at all).
- **Two texts are not from the book.** The Lord's Prayer, which the book names
  but does not print, is given in its traditional English wording; both it and
  every other supplied item carry a `source` marker in
  `src/data/ordinary.ts` (`book` / `common` / `none`) and are labelled in the
  interface.
- Psalms and New Testament texts are Today's English Version (Good News), by
  permission of the American Bible Society; the Old Testament canticles were
  translated by Fr Joseph Kenny, O.P.

## Notes on the stack

React + Vite + TypeScript, no runtime dependencies beyond React itself:
routing is a hash router in 15 lines, and styling is hand-written CSS driven
by custom properties rather than Tailwind. The prompt allowed either; plain
CSS was chosen because the three themes plus the seasonal accent are a
token-swap problem, and because it keeps the offline bundle free of a build-time
style toolchain. There is no `tailwind.config.js` for that reason.

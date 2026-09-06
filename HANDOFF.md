# Project State Sync Brief — Daily Psalms and Canticles PWA

Paste this into a new session to resume. Project root:
`C:\Users\ERIC\Downloads\Claude Code\the four skills`

---

## 1. What this is, and the stack

An offline-first PWA of **Daily Psalms and Canticles**, the Dominican prayer
book of the Province of St Joseph the Worker (Nigeria & Ghana), 440 printed
pages. Every text is transcribed from the source PDF; nothing is paraphrased.

- **React 18 + Vite 6 + TypeScript.** Runtime dependencies are React and
  React-DOM only — routing is a ~15-line hash router in `App.tsx`.
- **No Tailwind.** Hand-written CSS driven by custom properties
  (`src/index.css`, ~22 kB). Three themes plus a separate liturgical colour.
- **Fonts self-hosted** (EB Garamond 400/400i/600, Cinzel 600; latin subsets,
  88 kB) in `public/fonts`. Deliberately *not* Google Fonts — a CDN would
  break the offline guarantee.
- **Two-stage architecture**: an offline Node pipeline in `tools/` turns the
  PDF and a .docx into JSON, which the app imports statically. No backend, no
  network calls at runtime.

### Decisions already made (do not redo)

- **romcal was rejected** after testing. v1.3.0 is 4.6 MB and depends on
  deprecated `moment`; **v3.0.0's build does not export its `Romcal` engine
  class at all** — `index.d.ts` declares it at line 70, neither the CJS nor
  the ESM bundle contains it, and its calendar bundles are stuck at a
  mismatched `3.0.0-alpha.0`. The calendar was written instead: 18.8 kB
  minified, 5.1 kB gzipped.
- **PowerShell `Compress-Archive` must never be used to build the zip.** It
  writes backslash path separators, which Windows tolerates and Linux hosts
  do not — this caused a blank-white-screen Netlify deploy. `tools/package.mjs`
  writes the zip itself and refuses to emit an entry containing a backslash.
- **`base: './'`** in `vite.config.ts` is correct and verified. Do not change.

---

## 2. Features implemented and verified

**Content** — 84 psalter offices (Weeks I–IV × 7 days × Morning/Midday/
Evening + Sunday Evening Before), 252 psalm/canticle blocks; 32 Office of
Readings sections; Compline assembled end to end; 24 proper feasts and 6
commons; 9 Benedictus + 9 Magnificat settings; 34 weekly collects; both
indices; 17 engraved-music pages as 200 dpi PNGs.

**Stanza grouping from PDF geometry.** `pdftotext` blank lines are unreliable
(they fire inside stanzas and miss real breaks). Grouping is taken from
MuPDF's line **baselines** and its empty-line markers, validated by measuring
across each marker: a real break spans ≥18 pt, ordinary leading never exceeds
15. Page turns use the book's own "+n" continuation mark. Result: 3,965 →
1,969 stanzas, line count identical, 0 psalms skipped.

**Liturgical calendar engine** (`generalCalendar.ts` + `data/sanctoral.ts`,
107 celebrations incl. 11 Dominican). Season, Ordinary/Advent/Lent/Easter week
number, Sunday cycle A/B/C, weekday cycle I/II, psalter week, colour (incl.
rose on Gaudete/Laetare), rank. Precedence follows the **Table of Liturgical
Days**, not a rank comparison — a solemnity beats an OT Sunday but yields to a
Lenten one; a memorial in Lent is only commemorated; a solemnity on a Saturday
keeps its own Second Vespers.

**Office routing** (`officeForDay.ts`) — festal days → Sunday I psalms +
proper/common; ferials and memorials → the four-week psalter, per the book's
own rule on p. 437.

**UI** — liturgical header (date, title, rank badge, colour, psalter week,
Year A/B/C) on Home and every reader view; hour-by-hour plan card; month
calendar with circular day badges tinted by liturgical colour and ringed for
feasts/solemnities; date picker for any past or future date; reader dock with
Home, A−/A+, theme cycle, section jump, prev/next through the psalter.

### Service worker / caching — verified end to end

`public/sw.js`, stamped after each build by `tools/sw-build.mjs` with the file
list and a SHA-256 content hash (cache name `dpc-<hash>`).

- Precaches the **entire build**: 35 files, 4.81 MB, added one at a time so a
  single failure cannot abort installation.
- Navigations: cache-first with background refresh; assets: cache-first with
  an `ignoreSearch` fallback. Cross-origin and non-GET are passed through.
- `activate` deletes every older `dpc-*` cache.
- `_redirects` and other `_`-prefixed host-config files are excluded.

**Proof (real Chromium via Playwright, not the embedded pane, which blocks
service workers):** worker reached `activated`, 31–35 files cached, then the
server was **stopped** and a reload still rendered Compline (5,768 chars) and
served a music plate PNG from cache. `npm run check:sw` re-runs the built
worker against stub caches with the network off.

**Installability**: manifest has name, short_name, start_url, scope, display,
192/512/maskable icons, 3 screenshots (narrow + wide). All hard criteria met;
only HTTPS hosting is required.

### Test suites — 120 assertions, all passing

| Command | Asserts | Covers |
|---|---|---|
| `npm run check` | 26 | Easter/Advent computus, seasons, psalter week; walks every day of 2026–27 |
| `npm run check:calendar` | 35 | Sanctoral, ranks, colours, precedence, Sunday cycle, First Vespers |
| `npm run check:office` | 12 | Each kind of day routes to the right part of the book; every route is one the app serves |
| `npm run check:sw` | 9 | Precache, versioned cleanup, offline navigation/assets/plates |
| `node ../tools/check-canticles.js` | 23 | All 18 canticle settings byte-identical to the .docx, incl. stanza shapes |
| `node ../tools/audit.js` | 15 | All 218 index references resolve; no empty psalms; OCR artifacts gone |

`npm run check:all` runs the first five.

---

## 3. Active file structure

```
psalms-app/
  src/
    App.tsx                    hash router, route table, prev/next, reader controls
    index.css                  the whole design system (~22 kB)
    types.ts                   Block union, Office, ReadingsOffice
    components/
      Dashboard.tsx  LiturgicalHeader.tsx  DayPlanCard.tsx  DatePicker.tsx
      OfficeReader.tsx  Blocks.tsx  ComplineView.tsx  Pages.tsx
      Header.tsx  Sheet.tsx  SettingsDrawer.tsx  IndexModal.tsx
      HourShapeCard.tsx  icons.tsx
    utils/
      liturgicalCalendar.ts    temporal cycle: Easter, seasons, psalter week
      generalCalendar.ts       sanctoral + movable + precedence  → LiturgicalToday
      officeForDay.ts          LiturgicalToday → DayPlan (which hour, which source)
      choirFormatter.ts        choir sides, tone-mark fragments
      storage.ts  scroll.ts
    data/
      weeks/week1-4.json       84 offices          readings.json  compline.json
      canticles.json           9+9 settings        feasts.json  dominican.json
      sanctoral.ts             107 celebrations    ordinary.ts (hand-authored)
      prayers.json  indices.json  front.json  plates.json  search.json
  public/    manifest.json  sw.js  _redirects  icons/  plates/  fonts/  screenshots/
  tools/     sw-build.mjs  package.mjs  fonts.mjs  check-*.mjs

tools/                         the offline pipeline (run from psalms-app/)
  parse.js lib.js tables.js    PDF text → typed blocks
  geom.js regroup.js           stanza boundaries from MuPDF line geometry
  canticles.js readdocx.js     the .docx → canticles-src.json
  split.js                     → src/data/*.json
  audit.js check-canticles.js verify-regroup.js
  canticles.docx               vendored source for the gospel canticles
  book.txt                     pdftotext -layout dump of the book
  render/                      plates.mjs, lines.mjs (MuPDF WASM)
```

**Pipeline**: `npm run data` = parse → regroup → audit → split → check-canticles.
`npm run build` = fonts → tsc → vite → sw-build. `npm run package` = build + zip.

---

## 4. Outstanding issues

**A. `seasonTint` preference is dead — a live regression.** The styling pass
replaced the palette and removed every `:root[data-season=…]` rule
(`grep -c data-season src/index.css` → **0**), but `App.tsx:76` still sets
`document.documentElement.dataset.season` and `SettingsDrawer.tsx:101` still
offers a "Colour by season" chip that now changes nothing. Either give it a
real effect (e.g. tint the reader's antiphon rule with the day's colour) or
remove the toggle and the dataset write. **Highest-priority fix.**

**B. Netlify deploy not reconfirmed.** The first deploy was blank (backslash
paths, since fixed and verified by extracting the zip with POSIX rules and
loading it in real Chromium). The user has not yet confirmed a successful
redeploy. Not known to be broken — just unverified in production.

**C. Dashboard has redundant sections.** The new liturgical header + plan card
sit above the older "hours today / Day / Psalter week / Season" chip rows,
which now partly duplicate them. Worth consolidating.

**D. Book limitation, not a bug: no sanctoral propers.** The book contains no
proper antiphons or collects for memorials. On a memorial the app keeps the
weekday psalter, points at the relevant common, and says so in the UI. Do not
invent these texts.

**E. Canticle indentation flattened.** The corrected .docx indents every line
uniformly, so all canticle lines are stored at `i: 0`; the book's alternating
second-line indent is gone for those 18 settings. Faithful to the supplied
document — restore only if the user asks.

**F. `+2` artifact** at the end of a line in Zechariah 2 ("in the / house of /
David his /servant, +2") — the printed book's page-continuation mark, carried
into the .docx. Preserved verbatim as instructed; meaningless in the app.

**G. Optional memorials** are displayed and labelled but there is no "keep or
pass over" control.

**H. Android APK / desktop build not attempted.** No JDK, Android SDK, Rust or
.NET on this machine. The PWA installs on both Windows (Edge) and Android
(Chrome) with no build step, which is the recommended route.

**We are not stuck.** The last completed task (UI restyle) finished green:
build clean, all five check suites passing, zip packaged and delivered.

---

## 5. Next steps, in order

1. **Fix the dead `seasonTint` toggle** (issue A) — decide effect or removal.
2. **Confirm the Netlify redeploy** renders, then install on Windows (Edge →
   install icon) and Android (Chrome → ⋮ → Install app).
3. **Tidy the Dashboard** (issue C) — fold the older chip rows into the new
   plan card, or drop the ones the calendar now answers.
4. Optional-memorial keep/pass control (issue G).
5. Optionally restore two-choir indentation in the gospel canticles (issue E).

## Environment notes

- Windows, Git Bash + PowerShell. **Heredocs mangle backslashes** — use the
  Write/Edit tools for anything containing regex or escapes, never `bash <<EOF`.
- **The embedded Browser pane cannot composite**: screenshots fail,
  `requestAnimationFrame` never fires, scroll events don't dispatch, and
  service workers will not register. Use the Playwright MCP tools for any
  visual or service-worker verification; use `read_page`/`javascript_tool` in
  the pane only for DOM assertions.
- Vite dev server binds **IPv6** — use `http://localhost:5183`, not `127.0.0.1`.
- `.claude/launch.json` defines `psalms-app` (dev, 5183) and
  `psalms-app-prod` (vite preview, 5190).
- Only `pdftotext` (Xpdf 4.06) is available — no poppler `pdfimages`/`pdftoppm`,
  no pandoc, no `zip`. MuPDF WASM (`tools/render/`) does PDF rendering and
  geometry; `tools/readdocx.js` reads .docx without pandoc.

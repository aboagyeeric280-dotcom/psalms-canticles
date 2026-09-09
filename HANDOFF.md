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
- **The app is deployed by GitHub Actions to GitHub Pages**, not by hand and
  not to Netlify. `.github/workflows/deploy.yml` runs `npm ci && npm run build`
  and publishes `psalms-app/dist/`; the live app is
  https://aboagyeeric280-dotcom.github.io/psalms-canticles/. Nothing is
  visible to anyone until it is committed and pushed. `dist/` is gitignored
  and rebuilt in CI — never commit it.
- **`npm run package` is only for an offline hand-off copy** and is no longer
  part of deploying. If it is ever used: **PowerShell `Compress-Archive` must
  never build the zip.** It writes backslash path separators, which Windows
  tolerates and Linux hosts do not — that is what once produced a blank white
  screen on the old Netlify host. `tools/package.mjs` writes the zip itself
  and refuses to emit an entry containing a backslash.
- **`base: './'`** in `vite.config.ts` is correct and verified. Do not change.
- **The rest of the Hour is linked to, never bundled. Do not "helpfully" add
  the texts.** Our book prints the psalmody and nothing else; the short
  reading, the responsory, the intercessions and the concluding prayer are
  not in it, and every English translation of them is under a copyright the
  province does not hold. Universalis answer "can I copy bits of your website
  into mine" with a flat no, and ask instead to be linked to and credited.
  So each Hour carries a link built from the date and the hour, and the app
  fetches, scrapes, caches, proxies, embeds and stores exactly nothing from
  them. A `fetch()` to universalis.com anywhere in this repository is a bug,
  not a feature; `npm run check:universalis` fails the build if one appears
  in the mapping module.

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

**Links out to the rest of the Hour.** At the foot of Morning, Midday and
Evening Prayer — after the psalmody, where the missing parts fall — a quiet
footer links to the same Hour on Universalis: the reading, responsory,
intercessions and concluding prayer a friar would otherwise have to find
elsewhere. `src/utils/universalis.ts` builds the URL and does nothing else;
`src/components/UniversalisLink.tsx` renders it.

- `https://universalis.com/africa.nigeria/<yyyymmdd>/<hour>.htm`. The slug is
  Universalis's Nigeria calendar, the larger half of the province; they
  publish no Ghana calendar, and the general `africa` one would lose the
  Nigerian proper days. **The slug was chosen from their own live URLs, not
  from their link builder — the session that built this could not reach
  universalis.com through its egress proxy. Worth confirming once in a
  browser.**
- `morning → lauds`, `midday → sext` (the one it is actually prayed at, as
  `utils/hours.ts` does for the Latin names), `evening → vespers`,
  `evening-before → vespers of the day before`, because Universalis print
  Sunday's Evening Prayer I on the Saturday. Compline is complete in our book
  and has no link at all. `i-lauds` is supported and tested but not used: the
  app carries the Invitatory itself at `#/invitatory`.
- The date is the one the app is showing, and the link names it in full, so a
  reader browsing Week III on a Tuesday can never be sent somewhere he did
  not ask for. Two shifts cancel for Evening Prayer I — it is prayed on the
  Saturday and published under the Saturday — and that is deliberate; see the
  comment on `universalisUrlFor`.
- The free website carries about a week ahead. Outside that the link still
  shows, with a quiet note; hiding it silently is more confusing than saying
  so. Offline, the link stays and a line says plainly that this one thing
  needs a connection.
- Credit to Universalis by name and address is on the face of it, as they ask.
  A rubric under the link says the psalms on their site are their own
  translation from the Latin, not the liturgical one, and that the psalms to
  pray are the ones in our book above — a friar must not be left thinking the
  two are interchangeable.
- One setting, **Reading settings → The rest of the Hour**, turns the links
  off; on by default, persisted through `storage.ts` like every other
  preference. Turned off, the string `universalis.com` does not appear in the
  DOM at all and the app is entirely self-contained.
- **The offline guarantee is untouched.** No request at load, nothing added to
  the precache, no blocking on connectivity. `public/sw.js` already returns
  early on cross-origin requests (`url.origin !== self.location.origin`), so
  the link is passed straight through to the browser; this was checked, not
  assumed. The only connectivity the component reads is `navigator.onLine`,
  which asks nothing of the network.

### Service worker / caching — verified end to end

`public/sw.js`, stamped after each build by `tools/sw-build.mjs` with the file
list and a SHA-256 content hash (cache name `dpc-<hash>`).

- Precaches the **entire build**: 41 files, 4.96 MB, added one at a time so a
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

### Test suites — 157 assertions, all passing

| Command | Asserts | Covers |
|---|---|---|
| `npm run check` | 26 | Easter/Advent computus, seasons, psalter week; walks every day of 2026–27 |
| `npm run check:calendar` | 35 | Sanctoral, ranks, colours, precedence, Sunday cycle, First Vespers |
| `npm run check:office` | 12 | Each kind of day routes to the right part of the book; every route is one the app serves |
| `npm run check:sw` | 9 | Precache, versioned cleanup, offline navigation/assets/plates |
| `npm run check:search` | 22 | Phrase, all-words, near-spelling and reference lookups; every anchor resolves |
| `npm run check:universalis` | 30 | Hour mapping, the previous-day rule across month, leap-February and year boundaries, zero-padded dates, well-formed absolute URLs — and that the module makes no network call |
| `node ../tools/check-canticles.js` | 23 | All 18 canticle settings byte-identical to the .docx, incl. stanza shapes |
| `node ../tools/audit.js` | 15 | All 218 index references resolve; no empty psalms; OCR artifacts gone |

`npm run check:all` runs the first six. No test in this repository may make a
request to universalis.com; `check:universalis` builds URLs and never opens
one.

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
      HourShapeCard.tsx  UniversalisLink.tsx  icons.tsx
    utils/
      liturgicalCalendar.ts    temporal cycle: Easter, seasons, psalter week
      generalCalendar.ts       sanctoral + movable + precedence  → LiturgicalToday
      officeForDay.ts          LiturgicalToday → DayPlan (which hour, which source)
      choirFormatter.ts        choir sides, tone-mark fragments
      universalis.ts           HourKey + date → a Universalis URL. No I/O.
      storage.ts  scroll.ts
    data/
      weeks/week1-4.json       84 offices          readings.json  compline.json
      canticles.json           9+9 settings        feasts.json  dominican.json
      sanctoral.ts             107 celebrations    ordinary.ts (hand-authored)
      prayers.json  indices.json  front.json  plates.json  search.json
  public/    manifest.json  sw.js  _redirects  icons/  plates/  fonts/  screenshots/
  tools/     sw-build.mjs  package.mjs  fonts.mjs  check-*.mjs
             (check-calendar, check-sanctoral, check-office, check-sw,
              check-search, check-universalis)

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

Three entries that stood here a week ago — the dead `seasonTint` toggle, the
duplicated Dashboard chip rows, and the missing optional-memorial control —
have all since been fixed and are gone from this list. `seasonTint` leaves no
trace in `src/`; the Dashboard now carries the liturgical header and plan card
without the older chip rows under them; `components/OptionalMemorials.tsx` is
the keep-or-pass-over control.

**A. Book limitation, not a bug: no sanctoral propers.** The book contains no
proper antiphons or collects for memorials. On a memorial the app keeps the
weekday psalter, points at the relevant common, and says so in the UI. Do not
invent these texts.

**B. The Universalis calendar slug is unconfirmed at source.** The links use
`africa.nigeria`, taken from live Universalis URLs of that form. The session
that built the feature could not open their link builder at
`universalis.com/n-link.htm` — its egress proxy blocked the domain outright —
so the slug has not been round-tripped through their own tool. Everything
else about the links is tested. Open
`https://universalis.com/africa.nigeria/20260909/lauds.htm` in a browser once
and, if it is wrong, change the single constant `UNIVERSALIS_CALENDAR` in
`src/utils/universalis.ts`; nothing else needs touching.

**C. Canticle indentation flattened.** The corrected .docx indents every line
uniformly, so all canticle lines are stored at `i: 0`; the book's alternating
second-line indent is gone for those 18 settings. Faithful to the supplied
document — restore only if the user asks.

**D. `+2` artifact** at the end of a line in Zechariah 2 ("in the / house of /
David his /servant, +2") — the printed book's page-continuation mark, carried
into the .docx. Preserved verbatim as instructed; meaningless in the app.

**E. Android APK / desktop build not attempted.** No JDK, Android SDK, Rust or
.NET on this machine. The PWA installs on both Windows (Edge) and Android
(Chrome) with no build step, which is the recommended route.

**We are not stuck.** The last completed task (links out to the rest of the
Hour) finished green: `tsc -b` clean, `npm run build` clean, all seven check
suites passing at 157 assertions, and the footer rendered and inspected in all
three prayer-book styles across Light, Sepia and Dark and both finishes.

---

## 5. Next steps, in order

1. **Confirm the Universalis calendar slug** (issue B) — one URL in a browser,
   and either nothing to do or one constant to change.
2. **Check the Pages deploy** renders after the push, then install on Windows
   (Edge → install icon) and Android (Chrome → ⋮ → Install app).
3. Optionally restore two-choir indentation in the gospel canticles (issue C).

Not a next step, and not an oversight: **the reading, responsory,
intercessions and concluding prayer stay out of this repository.** See the
decision in §1. If a future task looks like "carry the whole Hour offline",
the answer is that we may not, and the link is the answer we chose.

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

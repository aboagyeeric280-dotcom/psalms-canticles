# Daily Psalms and Canticles PWA — Project Baseline

> Canonical project baseline. Also indexed into claude-mem. Keep this file in sync
> whenever architecture, features, or build rules change.

## 1. What This Is

An offline-first Progressive Web App (PWA) of **Daily Psalms and Canticles**, the
Dominican prayer book of the Province of St. Joseph the Worker (Nigeria & Ghana),
containing 440 printed pages transcribed from the official source.

## 2. Tech Stack & Architecture

- **Framework:** React 18 + Vite 6 + TypeScript. No backend. Zero runtime external
  network calls.
- **Styling:** Hand-written CSS custom properties in `src/index.css` (no Tailwind).
- **Fonts:** 100% self-hosted latin subsets in `public/fonts/` (EB Garamond, Cinzel,
  Cormorant Garamond, Newsreader, IBM Plex Mono). **Never use the Google Fonts CDN** —
  offline operation must be guaranteed.
- **Data Pipeline:** Offline Node pipeline in `tools/` that extracts and structures
  texts into static JSON.

## 3. Core Features Implemented

- **Liturgical Calendar Engine:** Custom, zero-dependency engine
  (`src/utils/generalCalendar.ts` + `src/data/sanctoral.ts`) covering seasons,
  Sunday cycles (A/B/C), weekday cycles (I/II), psalter weeks (I–IV), liturgical
  vesture colors, and 107 celebrations (including 11 Dominican propers). Strictly
  follows the Catholic Church's **Table of Liturgical Days** for precedence.
- **Office Routing (`src/utils/officeForDay.ts`):** Festal days route to Sunday
  Week I psalms + Commons/Propers; ferials and memorials use the 4-week psalter.
  Optional memorials default to ferial unless elected by the user.
- **Gospel Canticles:** All 18 settings (9 Songs of Zechariah + 9 Songs of Mary)
  matching exact stanza shapes, verse divisions, and chant tone markings.
- **Three Switchable Visual Styles:**
  1. `vellum` (Vellum & Rubric / Paper Breviary): Classic parchment, vermilion
     rubrics, gold versal drop caps, Latin hour subtitles (*Matutinum, Laudes,
     Sexta, Vesperae, Completorium*).
  2. `still-point` (Still Point / Night Office): Cool paper white, quiet margins,
     mono verse gutter, minimal distraction.
  3. `green-modern` (Province Green): Deep emerald headers, warm cream body, tan
     action buttons, 18px rounded cards.
- **Chrome Finish Setting:** Independent Settings toggle for **Matte** (default) vs.
  **Glossy & Glass** (specular gold hairlines, frosted panels, lit top edges).
  Reading surfaces are strictly protected as matte.
- **Responsive Layout:** 264px dark left sidebar with an e-commerce-style dashboard
  grid for desktop/tablets (≥1024px); smooth slide-out drawer for phones (<1024px).
- **Time-Aware Home Screen & Reading Memory:** Highlights the current liturgical hour
  from local time; resumes reading from the exact section anchor.

## 4. Critical Build & Packaging Rules

- **Never use PowerShell `Compress-Archive`.** It writes Windows backslash path
  separators which break Linux web hosts like Netlify. Always package with
  `tools/package.mjs` via `npm run package`.
- **Preserve `base: './'` in `vite.config.ts`** so asset paths stay relative.
- **Test suites:** `npm run check:all` runs all 5 suites — calendar, office routing,
  canticle fidelity, service worker caching, and index resolution.

## 5. Key Paths & Commands

- **Project root:** `C:\Users\ERIC\Downloads\Claude Code\the four skills\psalms-app`
  (not a git repository as of 2026-09-02).
- **npm scripts** (`package.json`):
  - `npm run dev` — Vite dev server
  - `npm run build` — `fonts` + `tsc -b` + `vite build` + `tools/sw-build.mjs`
  - `npm run package` — build, then `tools/package.mjs` (the ONLY sanctioned way to
    produce a deploy archive)
  - `npm run check:all` — all 5 test suites
  - `npm run fonts` — regenerate self-hosted font subsets (`tools/fonts.mjs`)
  - Data-pipeline scripts (`data`, `plates`, `icons`, `canticles`, `lines`) invoke
    tools one directory up (`../tools/…`).

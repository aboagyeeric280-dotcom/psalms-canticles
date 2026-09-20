import { describe, expect, it } from 'vitest';

/* Structural guarantees the approved plan depends on. These read the source
   rather than run it, because what they protect is the shape of the tree:
   the data core must stay calendar-independent, and the separate Missing
   Parts app's storage key must stay untouchable. Both fail loudly the moment
   a future change crosses the line.

   Sources are pulled in with Vite's raw glob rather than node's filesystem,
   so this suite needs no node typings and the production build's global type
   environment stays purely browser-shaped. */

/* The options must be an inline literal: Vite analyses these statically. */
const MISSING_PARTS = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const PRODUCTION_CALENDAR = import.meta.glob('../utils/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const VITE_CONFIG = import.meta.glob('../../vite.config.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const isTest = (path: string) => path.endsWith('.test.ts') || path.endsWith('.test.tsx');

/* Everything the reader itself ships, with this feature's own tree removed:
   what the boundary tests measure the application against. */
const APP_SOURCES = Object.entries(
  import.meta.glob('../**/*.{ts,tsx}', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>,
).filter(([path]) => !path.includes('/missingParts/'));

const SHIPPED = Object.entries(MISSING_PARTS).filter(([path]) => !isTest(path));
const DATA_CORE = SHIPPED.filter(
  ([path]) => path.startsWith('./data/') || path.startsWith('./state/'),
);

describe('the data core is calendar-independent', () => {
  it('finds the files it is meant to be checking', () => {
    expect(DATA_CORE.length).toBeGreaterThan(5);
  });

  it.each(DATA_CORE.map(([path, source]) => [path, source]))(
    '%s does not import the production calendar',
    (_path, source) => {
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
      const offending = imports.filter(
        (specifier) =>
          specifier.includes('utils/') ||
          specifier.includes('generalCalendar') ||
          specifier.includes('liturgicalCalendar') ||
          specifier.includes('officeForDay') ||
          specifier.includes('/sanctoral'),
      );
      expect(offending).toEqual([]);
    },
  );

  it('keeps the data core clear of the adapter and the interface', () => {
    for (const [path, source] of DATA_CORE) {
      expect(source, `${path} imports the adapter`).not.toMatch(/from\s+'\.\.\/adapter/);
      expect(source, `${path} imports the interface`).not.toMatch(/from\s+'\.\.\/ui/);
    }
  });

  it('reaches the rest of the app only for shared types', () => {
    const outward = DATA_CORE.flatMap(([, source]) =>
      [...source.matchAll(/from\s+'(\.\.\/\.\.\/[^']+)'/g)].map((match) => match[1]),
    );
    // The season vocabulary is shared so the two cannot drift apart.
    expect([...new Set(outward)]).toEqual(['../../types']);
  });
});

describe('D8: nothing can write the legacy storage key', () => {
  const LEGACY_KEY = 'the-missing-parts-entries-v1';

  it('mentions the legacy key in exactly one shipped module', () => {
    const mentioning = SHIPPED.filter(([, source]) => source.includes(LEGACY_KEY)).map(([p]) => p);
    expect(mentioning).toEqual(['./data/storage.ts']);
  });

  it('never passes the legacy key to a write', () => {
    for (const [, source] of SHIPPED) {
      for (const call of source.matchAll(/\.(setItem|removeItem)\(\s*([A-Za-z_.]+)/g)) {
        expect(call[2]).not.toBe('LEGACY_STORAGE_KEY');
        expect(call[2].toLowerCase()).not.toContain('legacy');
      }
      expect(source).not.toMatch(/(setItem|removeItem)\(\s*'the-missing-parts/);
    }
  });

  it('uses the legacy key only for a read', () => {
    const source = MISSING_PARTS['./data/storage.ts'];
    // The declaration, plus exactly one getItem.
    expect([...source.matchAll(/LEGACY_STORAGE_KEY/g)]).toHaveLength(2);
    expect(source).toMatch(/getItem\(LEGACY_STORAGE_KEY\)/);
  });
});

describe('D10: no placeholder liturgical wording ships in the reader', () => {
  it('has no seed or example material', () => {
    expect(SHIPPED.map(([path]) => path).filter((path) => /seed|example/i.test(path))).toEqual([]);
  });

  it('does not carry the discarded example Scripture', () => {
    const marker = ['Douay-Rheims (1899 American edition)', 'public domain'].join(', ');
    for (const [, source] of SHIPPED) expect(source).not.toContain(marker);
  });
});

describe('test 12: the feature stays headless', () => {
  /* The calendar adapter and the data core must be usable and testable
     without a renderer. Exactly one module binds the store to React, and it
     does nothing else; everything else is plain TypeScript. */
  const REACT_BINDING = './state/useAppState.ts';

  it('keeps React out of everything but the binding and the interface', () => {
    const importers = SHIPPED
      .filter(([, source]) => /from\s+'react(-dom)?(\/[^']*)?'/.test(source))
      .map(([path]) => path);
    for (const path of importers) {
      const allowed = path === REACT_BINDING || path.startsWith('./ui/');
      expect(allowed, `${path} may not import React`).toBe(true);
    }
    expect(importers).toContain(REACT_BINDING);
  });

  it('keeps that binding to the one thing it is for', () => {
    const source = MISSING_PARTS[REACT_BINDING];
    expect(source).toContain('useSyncExternalStore');
    expect(source.split('\n').filter((l) => l.startsWith('export '))).toHaveLength(1);
  });

  it('imports no router anywhere', () => {
    for (const [path, source] of SHIPPED) {
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) {
        expect(specifier, `${path} imports a router`).not.toMatch(/router|history|wouter/i);
      }
    }
  });

  it('borrows one component from the reader, and only in the interface', () => {
    /* Sheet is reused deliberately: it already carries the focus trap and the
       scroll lock, and a second dialog system would be a second set of
       accessibility bugs. Nothing else is borrowed. */
    const borrowed = SHIPPED.flatMap(([path, source]) =>
      [...source.matchAll(/from\s+'([^']*\/components\/[^']+)'/g)].map((m) => [path, m[1]]));
    for (const [path, specifier] of borrowed) {
      expect(path, `${path} may not borrow a component`).toMatch(/^\.\/ui\//);
      expect(specifier, `${path} borrows more than the sheet`).toMatch(/components\/Sheet$/);
    }
    // Several sheets are built on it now; Sheet is still the only thing borrowed.
    expect([...new Set(borrowed.map(([, specifier]) => specifier))]).toHaveLength(1);
    expect(borrowed.length).toBeGreaterThan(0);
  });

  it('keeps the data core and the adapter free of any component', () => {
    for (const [path, source] of SHIPPED) {
      if (path.startsWith('./ui/')) continue;
      expect(source, `${path} imports a component`).not.toMatch(/\/components\//);
    }
  });

  it('has JSX only in the interface', () => {
    for (const path of Object.keys(MISSING_PARTS)) {
      if (!path.endsWith('.tsx')) continue;
      expect(path, `${path} is JSX outside the interface`).toMatch(/^\.\/ui\//);
    }
  });

  it('keeps the calendar adapter itself free of React', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./adapter/')) continue;
      expect(source, `${path} imports React`).not.toMatch(/from\s+'react/);
    }
  });
});

describe('the production build and calendar are left alone', () => {
  it('does not modify the production Vite configuration', () => {
    const vite = VITE_CONFIG['../../vite.config.ts'];
    expect(vite).toContain("base: './'");
    expect(vite).not.toContain('missingParts');
    expect(vite).not.toContain('test:');
  });

  it('keeps the production calendar untouched by this feature', () => {
    for (const name of ['generalCalendar.ts', 'liturgicalCalendar.ts', 'officeForDay.ts']) {
      const source = PRODUCTION_CALENDAR[`../utils/${name}`];
      expect(source, `expected to find ../utils/${name}`).toBeTypeOf('string');
      // The calendar never reaches back into the feature: the dependency
      // runs one way, from the adapter to the calendar, and only that way.
      expect(source).not.toContain('missingParts');
    }
  });

  it('reads the production calendar only from the adapter and migration', () => {
    const readers = SHIPPED
      .filter(([, source]) => /from\s+'\.\.\/\.\.\/utils\//.test(source))
      .map(([path]) => path)
      .sort();
    // The data core and the store are not among them, which is the point.
    for (const path of readers) {
      expect(path, `${path} may not read the production calendar`)
        .toMatch(/^\.\/(adapter|migration)\//);
    }
    expect(readers.length).toBeGreaterThan(0);
  });
});

describe('the migration engine is not reachable from the application', () => {
  /* Phase 3 builds the engine only. Nothing in the reader may import it, and
     no migration may run on startup: it is driven by a screen that does not
     exist yet, and until it does, none of this can touch a reader's data. */

  it('finds the application source to check', () => {
    expect(APP_SOURCES.length).toBeGreaterThan(20);
  });

  it.each(APP_SOURCES.map(([path, source]) => [path, source]))(
    '%s does not import the migration engine',
    (_path, source) => {
      expect(source).not.toMatch(/from\s+'[^']*missingParts\/migration/);
      expect(source).not.toMatch(/import\s*\(\s*'[^']*missingParts\/migration/);
    },
  );

  it('imports the feature only through its two interface entry points', () => {
    const importers = APP_SOURCES
      .filter(([, source]) => /from\s+'[^']*missingParts/.test(source))
      .flatMap(([path, source]) =>
        [...source.matchAll(/from\s+'([^']*missingParts[^']*)'/g)].map((m) => [path, m[1]]));
    for (const [path, specifier] of importers) {
      expect(specifier, `${path} reaches past the entry points`)
        .toMatch(/missingParts\/ui\/(OfficeSections|MissingPartsPage)$/);
    }
    // The office imports the sections, the shell imports the page: nothing else.
    expect(importers.length).toBeGreaterThan(0);
  });

  it('leaves the hour shape and the block pipeline alone', () => {
    const ordinary = APP_SOURCES.find(([p]) => p.endsWith('/data/ordinary.ts'))?.[1];
    const pageBlocks = APP_SOURCES.find(([p]) => p.endsWith('/data/pageBlocks.ts'))?.[1];
    const search = APP_SOURCES.find(([p]) => p.endsWith('/utils/search.ts'))?.[1];
    expect(ordinary).not.toContain('missingParts');
    expect(pageBlocks).not.toContain('missingParts');
    expect(search).not.toContain('missingParts');
  });

  it('keeps the reader\u2019s own material out of the search index', () => {
    /* The index is built from pageBlocks; personal text is rendered beside
       the blocks, never inside them, so it cannot reach the index. */
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./ui/')) continue;
      expect(source, `${path} touches the block pipeline`).not.toMatch(/pageBlocks|utils\/search/);
    }
  });

  it('never reads the legacy key from the interface', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./ui/')) continue;
      expect(source, `${path} names the legacy store`).not.toContain('the-missing-parts-entries-v1');
      expect(source, `${path} imports migration`).not.toMatch(/from\s+'\.\.\/migration/);
    }
  });

  it('runs no migration on import: the engine only exports functions', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./migration/')) continue;
      // No top-level call that could write while a module is being loaded.
      expect(source, `${path} writes at import time`).not.toMatch(/^\s*commitMigration\(/m);
      expect(source, `${path} migrates at import time`).not.toMatch(/^\s*previewMigration\(/m);
    }
  });

  it('keeps the migration engine free of React', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./migration/')) continue;
      expect(source, `${path} imports React`).not.toMatch(/from\s+'react/);
    }
  });

  it('routes every migration write through the guarded store', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./migration/')) continue;
      // Nothing reaches for window.localStorage directly except the one
      // place that builds the guarded wrapper.
      if (path === './migration/storageIo.ts') continue;
      // Prose may name it; code may not reach for it.
      expect(source, `${path} touches localStorage directly`)
        .not.toMatch(/(window\s*\.\s*)?localStorage\s*\.\s*(get|set|remove|clear|key)/);
    }
  });
});

describe('the browser checks stay portable', () => {
  const CONFIG = import.meta.glob('../../playwright.config.ts', {
    query: '?raw', import: 'default', eager: true,
  }) as Record<string, string>;

  it('hard-codes no machine-specific browser path', () => {
    const source = CONFIG['../../playwright.config.ts'];
    expect(source, 'expected to find playwright.config.ts').toBeTypeOf('string');
    expect(source).not.toMatch(/\/opt\/[^'"\s]*chrom/i);
    expect(source).not.toMatch(/chromium-\d+/);
  });

  it('takes the browser from the environment, with Playwright’s own as default', () => {
    const source = CONFIG['../../playwright.config.ts'];
    expect(source).toContain('PLAYWRIGHT_EXECUTABLE_PATH');
    expect(source).toMatch(/executablePath\s*\?\s*\{\s*executablePath\s*\}\s*:\s*\{\}/);
  });
});

describe('Phase 5: the three screens keep the same boundaries', () => {
  const SCREENS = ['./ui/LibraryScreen.tsx', './ui/ProgressScreen.tsx', './ui/ReviewScreen.tsx'];

  it('ships all three screens and their shell', () => {
    for (const path of [...SCREENS, './ui/MissingPartsPage.tsx', './ui/selectors.ts']) {
      expect(Object.keys(MISSING_PARTS), path).toContain(path);
    }
  });

  it('keeps the derived calculations out of the components', () => {
    /* Library, Progress and Review render what selectors hand them. None of
       them re-implements matching, key building or calendar arithmetic. */
    for (const path of SCREENS) {
      const source = MISSING_PARTS[path];
      expect(source, `${path} matches days itself`).not.toContain('entryMatchesDay');
      expect(source, `${path} builds keyIds itself`).not.toContain('keyId(');
      expect(source, `${path} resolves offices itself`).not.toContain('resolveOffice');
    }
  });

  it('never reaches the migration engine from a screen', () => {
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./ui/')) continue;
      expect(source, `${path} imports migration`).not.toMatch(/from\s+'\.\.\/migration/);
    }
  });

  it('adds the three routes and one navigation entry, and nothing else', () => {
    const app = APP_SOURCES.find(([p]) => p === '../App.tsx')?.[1] ?? '';
    const sidebar = APP_SOURCES.find(([p]) => p.endsWith('/Sidebar.tsx'))?.[1] ?? '';
    // One branch in the shell, one entry in the drawer, three routes below it.
    expect(app).toContain("head === 'missing'");
    expect([...app.matchAll(/head === 'missing'/g)]).toHaveLength(1);
    expect([...sidebar.matchAll(/'#\/missing/g)]).toHaveLength(1);
    expect(sidebar).toContain("route: '#/missing'");

    const page = MISSING_PARTS['./ui/MissingPartsPage.tsx'];
    for (const route of ['#/missing', '#/missing/progress', '#/missing/review']) {
      expect(page, route).toContain(`'${route}'`);
    }

    // No Backup, Restore or migration route crept in with them.
    for (const forbidden of ['backup', 'restore', 'migrate']) {
      for (const [where, source] of [['App', app], ['the drawer', sidebar], ['the page', page]]) {
        expect(source, `${where} adds #/missing/${forbidden}`)
          .not.toContain(`#/missing/${forbidden}`);
      }
    }
  });

  it('leaves the book’s own search and block pipeline alone', () => {
    const pageBlocks = APP_SOURCES.find(([p]) => p.endsWith('/data/pageBlocks.ts'))?.[1];
    const search = APP_SOURCES.find(([p]) => p.endsWith('/utils/search.ts'))?.[1];
    expect(pageBlocks).not.toContain('missingParts');
    expect(search).not.toContain('missingParts');
    for (const [path, source] of SHIPPED) {
      if (!path.startsWith('./ui/')) continue;
      expect(source, `${path} touches the book index`).not.toMatch(/pageBlocks|utils\/search/);
    }
  });

  it('keeps the selectors free of React', () => {
    expect(MISSING_PARTS['./ui/selectors.ts']).not.toMatch(/from\s+'react/);
  });
});

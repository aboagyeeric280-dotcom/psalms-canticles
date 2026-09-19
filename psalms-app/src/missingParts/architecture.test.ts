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

  it('lets only the documented binding import React', () => {
    const importers = SHIPPED
      .filter(([, source]) => /from\s+'react(-dom)?(\/[^']*)?'/.test(source))
      .map(([path]) => path);
    expect(importers).toEqual([REACT_BINDING]);
  });

  it('keeps that binding to the one thing it is for', () => {
    const source = MISSING_PARTS[REACT_BINDING];
    expect(source).toContain('useSyncExternalStore');
    expect(source.split('\n').filter((l) => l.startsWith('export '))).toHaveLength(1);
  });

  it('imports no router, and no component from the reader', () => {
    for (const [path, source] of SHIPPED) {
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) {
        expect(specifier, `${path} imports a router`).not.toMatch(/router|history|wouter/i);
        expect(specifier, `${path} imports a component`).not.toMatch(/\/components\//);
      }
    }
  });

  it('has no JSX anywhere in the feature', () => {
    expect(Object.keys(MISSING_PARTS).filter((p) => p.endsWith('.tsx'))).toEqual([]);
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

  const APP_SOURCES = Object.entries(
    import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>,
  ).filter(([path]) => !path.includes('/missingParts/'));

  it('finds the application source to check', () => {
    expect(APP_SOURCES.length).toBeGreaterThan(20);
  });

  it.each(APP_SOURCES.map(([path, source]) => [path, source]))(
    '%s does not import the missing-parts feature',
    (_path, source) => {
      expect(source).not.toMatch(/from\s+'[^']*missingParts/);
      expect(source).not.toMatch(/import\s*\(\s*'[^']*missingParts/);
    },
  );

  it('leaves the entry point with no reference to it', () => {
    for (const name of ['../main.tsx', '../App.tsx']) {
      const source = APP_SOURCES.find(([path]) => path === name)?.[1];
      expect(source, `expected to find ${name}`).toBeTypeOf('string');
      expect(source).not.toContain('missingParts');
      expect(source).not.toContain('migrat');
    }
  });

  it('adds no route, no navigation entry and no change to the hour shape', () => {
    const sidebar = APP_SOURCES.find(([p]) => p.endsWith('/Sidebar.tsx'))?.[1];
    const ordinary = APP_SOURCES.find(([p]) => p.endsWith('/data/ordinary.ts'))?.[1];
    expect(sidebar).not.toContain('missing');
    expect(ordinary).not.toContain('missingParts');
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

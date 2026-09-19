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
      expect(source).not.toContain('missingParts');
    }
  });
});

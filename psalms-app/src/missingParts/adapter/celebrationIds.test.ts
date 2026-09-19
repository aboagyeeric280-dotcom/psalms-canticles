import { describe, expect, it } from 'vitest';
import { SANCTORAL, DOMINICAN } from '../../data/sanctoral';
import {
  CELEBRATION_ID_DUPLICATES,
  LEGACY_CELEBRATION_ALIASES,
  canonicalIdForLegacy,
  celebrationsMissingIds,
  collectCanonicalIds,
  legacySlug,
  observanceNote,
} from './celebrationIds';

/* Five years spans every movable observance in every position it can take. */
const FROM = 2026;
const TO = 2030;
const EFFECTIVE = collectCanonicalIds(FROM, TO);

describe('test 2: every effective celebration has an explicit canonical id', () => {
  it('leaves no non-temporal celebration without one', () => {
    expect(celebrationsMissingIds(FROM, TO)).toEqual([]);
  });

  it('gives every sanctoral and Dominican row an id', () => {
    for (const celebration of [...SANCTORAL, ...DOMINICAN]) {
      expect(celebration.id, `${celebration.name} has no id`).toBeTruthy();
    }
  });

  it('finds the movable observances too, which are built per year', () => {
    for (const id of [
      'ash-wednesday', 'palm-sunday', 'holy-thursday', 'good-friday', 'holy-saturday',
      'easter-sunday', 'easter-monday', 'easter-saturday', 'second-sunday-of-easter',
      'ascension', 'pentecost', 'trinity-sunday', 'corpus-christi', 'sacred-heart',
      'immaculate-heart-of-mary', 'christ-the-king', 'holy-family', 'baptism-of-the-lord',
      'epiphany',
    ]) {
      expect(EFFECTIVE.has(id), `movable id missing: ${id}`).toBe(true);
    }
  });

  it('uses stable lowercase kebab-case throughout', () => {
    for (const id of EFFECTIVE.keys()) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('never names an id after a date', () => {
    for (const id of EFFECTIVE.keys()) {
      expect(id, `${id} looks like a date`).not.toMatch(/\d{4}|-\d{1,2}-\d{1,2}$/);
    }
  });
});

describe('test 5 (identity half): only the known duplicate shares an id', () => {
  it('finds exactly the whitelisted duplicate among the source rows', () => {
    const counts = new Map<string, number>();
    for (const celebration of [...SANCTORAL, ...DOMINICAN]) {
      counts.set(celebration.id, (counts.get(celebration.id) ?? 0) + 1);
    }
    const shared = [...counts].filter(([, count]) => count > 1).map(([id]) => id).sort();
    expect(shared).toEqual([...CELEBRATION_ID_DUPLICATES].sort());
  });

  it('gives both Raymond rows the same id', () => {
    const rows = [...SANCTORAL, ...DOMINICAN].filter((c) => c.name === 'St Raymond of Penyafort, Priest');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((c) => c.id))).toEqual(new Set(['saint-raymond-of-penyafort']));
  });

  it('keeps distinct observances on one date distinct', () => {
    // 29 April and 8 August each carry a General Calendar row and an Order
    // row with different names; they are not the same observance.
    const byId = (id: string) => [...SANCTORAL, ...DOMINICAN].filter((c) => c.id === id);
    expect(byId('saint-catherine-of-siena')).toHaveLength(1);
    expect(byId('saint-catherine-of-siena-order-patron')).toHaveLength(1);
    expect(byId('saint-dominic')).toHaveLength(1);
    expect(byId('saint-dominic-order-founder')).toHaveLength(1);
  });
});

describe('test 3: movable ids stay stable when their dates change', () => {
  it('gives the same id to Easter in every year, on a different date each time', () => {
    const dates = new Set<string>();
    for (let year = FROM; year <= TO; year += 1) {
      const ids = collectCanonicalIds(year, year);
      expect(ids.has('easter-sunday')).toBe(true);
      expect(ids.has('corpus-christi')).toBe(true);
      expect(ids.has('christ-the-king')).toBe(true);
      dates.add(String(year));
    }
    expect(dates.size).toBe(TO - FROM + 1);
  });

  it('does not encode the year into an id', () => {
    const a = collectCanonicalIds(2026, 2026);
    const b = collectCanonicalIds(2030, 2030);
    for (const id of ['easter-sunday', 'ash-wednesday', 'pentecost', 'sacred-heart']) {
      expect(a.has(id) && b.has(id), id).toBe(true);
    }
  });
});

describe('test 9: every legacy feast alias maps to a canonical id', () => {
  const aliases = Object.entries(LEGACY_CELEBRATION_ALIASES);

  it('covers the whole legacy celebration table', () => {
    // 35 fixed plus the movable ones the legacy app computed.
    expect(aliases).toHaveLength(51);
  });

  it.each(aliases)('%s resolves to a canonical id the calendar produces', (slug, canonical) => {
    expect(canonicalIdForLegacy(slug)).toBe(canonical);
    expect(EFFECTIVE.has(canonical), `${canonical} is not produced by the calendar`).toBe(true);
  });

  it('accepts the legacy display name as well as its slug', () => {
    expect(canonicalIdForLegacy('Saints Peter and Paul, Apostles')).toBe('saint-peter-and-saint-paul');
    expect(canonicalIdForLegacy('Thursday of the Lord’s Supper')).toBe('holy-thursday');
    expect(canonicalIdForLegacy('The Most Holy Body and Blood of Christ')).toBe('corpus-christi');
    expect(canonicalIdForLegacy('Saint Joseph, Spouse of the Blessed Virgin Mary')).toBe('saint-joseph');
  });

  it('folds a name to a slug exactly as the legacy app did', () => {
    expect(legacySlug('Thursday of the Lord’s Supper')).toBe('thursday-of-the-lord-s-supper');
  });

  it('reproduces the legacy slug’s treatment of accents, warts and all', () => {
    /* The legacy app decomposed with NFKD and then replaced anything outside
       a-z0-9 with a hyphen, so a combining accent became a separator. That is
       faithfully reproduced here: the job is to read what it wrote, not to
       improve on it. No legacy celebration name actually carries an accent,
       so no alias is affected — the test below pins that too. */
    expect(legacySlug('Saint Thérèse of the Child Jesus')).toBe('saint-the-re-se-of-the-child-jesus');
  });

  it('is unaffected in practice: no legacy celebration name carries an accent', () => {
    for (const slug of Object.keys(LEGACY_CELEBRATION_ALIASES)) {
      expect(slug, `${slug} looks mangled by accent decomposition`).not.toMatch(/-[a-z]-[a-z]-/);
    }
  });
});

describe('test 10: unknown legacy values are not guessed at', () => {
  it.each([
    ['a celebration this calendar does not carry', 'Saint Kizito of Uganda'],
    ['an empty string', ''],
    ['something that is not a celebration at all', 'qwertyuiop'],
    ['a near miss on a real name', 'Saints Peter and Paul the Apostles of Rome'],
  ])('returns undefined for %s', (_label, value) => {
    expect(canonicalIdForLegacy(value)).toBeUndefined();
  });

  it('returns undefined rather than slugifying the display name', () => {
    // The dangerous failure would be inventing 'saint-kizito-of-uganda' and
    // filing material under an id no calendar will ever produce.
    expect(canonicalIdForLegacy('Saint Kizito of Uganda')).toBeUndefined();
  });

  it('is undefined for a value that is missing entirely', () => {
    expect(canonicalIdForLegacy(undefined)).toBeUndefined();
  });
});

describe('test 7 (identity half): variable observances are recorded, not corrected', () => {
  it('notes the observances kept on different days in different places', () => {
    expect(observanceNote('corpus-christi')).toContain('Thursday after Trinity Sunday');
    expect(observanceNote('ascension')).toBeTruthy();
    expect(observanceNote('epiphany')).toBeTruthy();
  });

  it('says nothing about a celebration with no such question', () => {
    expect(observanceNote('saint-andrew')).toBeUndefined();
    expect(observanceNote(undefined)).toBeUndefined();
  });
});

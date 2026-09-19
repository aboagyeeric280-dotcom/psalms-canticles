/* Canonical celebration identity, and the bridge from the legacy app's names.
 *
 * The canonical ids themselves live in the production celebration definitions
 * — `SANCTORAL` and `DOMINICAN` in src/data/sanctoral.ts, and the movable
 * table in src/utils/generalCalendar.ts. This module does not invent them and
 * must never derive one from a display name at runtime. What lives here is
 * only what the missing-parts feature needs on top of them:
 *
 *   · the whitelist of observances the calendar lists twice;
 *   · the mapping from the separate Missing Parts app's name-slugs onto them;
 *   · a sweep that reports which ids the calendar actually produces.
 */

import { liturgicalToday } from '../../utils/generalCalendar';

/* Observances the production calendar carries on more than one source row.
 *
 * St Raymond of Penyafort is listed both in the General Calendar (an optional
 * memorial) and among the Dominican propers (a memorial). Both rows describe
 * the same observance on the same day, so both carry one canonical id. The
 * production calendar already collapses them, because it deduplicates by
 * display name and the two names are identical; the adapter deduplicates by
 * id as well, so the reader sees a single identity either way.
 *
 * Nothing else may share an id. A test asserts exactly this list, so a second
 * duplicate appearing later fails loudly instead of passing unnoticed.
 */
export const CELEBRATION_ID_DUPLICATES: readonly string[] = ['saint-raymond-of-penyafort'];

/* Celebrations kept on different days in different places. The production
 * calendar's dates stand and are not altered here — this table exists so that
 * a correction, once there is authoritative word on the Province's own
 * practice, has one obvious place to land rather than being scattered.
 *
 * No claim is made about which day is right for this Province.
 */
export interface ObservanceNote {
  id: string;
  note: string;
}

export const VARIABLE_OBSERVANCES: readonly ObservanceNote[] = [
  { id: 'epiphany', note: 'Kept on the Sunday between 2 and 8 January in some countries.' },
  { id: 'ascension', note: 'Transferred to the Seventh Sunday of Easter in many countries.' },
  {
    id: 'corpus-christi',
    note: 'This calendar keeps it on the Thursday after Trinity Sunday. It is kept on the following Sunday in many countries.',
  },
];

export function observanceNote(id: string | undefined): string | undefined {
  return id ? VARIABLE_OBSERVANCES.find((entry) => entry.id === id)?.note : undefined;
}

/**
 * Fold a legacy display name the way the separate Missing Parts app did, so a
 * record stored under its slug can be looked up.
 *
 * This is NOT a way of minting canonical ids. It only reproduces the legacy
 * app's own transformation in order to read what it wrote.
 */
export function legacySlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* Every celebration name the separate Missing Parts app could store, by the
   slug it stored, mapped onto this calendar's canonical id. Its house style
   spelled out "Saint" and "Saints"; this book uses "St" and "Ss", so almost
   every name differs and none of them would match without this table. */
export const LEGACY_CELEBRATION_ALIASES: Readonly<Record<string, string>> = {
  'all-saints': 'all-saints',
  'ash-wednesday': 'ash-wednesday',
  'easter-sunday-of-the-resurrection-of-the-lord': 'easter-sunday',
  'friday-of-the-passion-of-the-lord-good-friday': 'good-friday',
  'holy-saturday': 'holy-saturday',
  'mary-the-holy-mother-of-god': 'mary-mother-of-god',
  'our-lord-jesus-christ-king-of-the-universe': 'christ-the-king',
  'palm-sunday-of-the-passion-of-the-lord': 'palm-sunday',
  'pentecost-sunday': 'pentecost',
  'saint-andrew-apostle': 'saint-andrew',
  'saint-bartholomew-apostle': 'saint-bartholomew',
  'saint-james-apostle': 'saint-james',
  'saint-john-apostle-and-evangelist': 'saint-john-apostle',
  'saint-joseph-spouse-of-the-blessed-virgin-mary': 'saint-joseph',
  'saint-lawrence-deacon-and-martyr': 'saint-lawrence',
  'saint-luke-evangelist': 'saint-luke',
  'saint-mark-evangelist': 'saint-mark',
  'saint-mary-magdalene': 'saint-mary-magdalene',
  'saint-matthew-apostle-and-evangelist': 'saint-matthew',
  'saint-matthias-apostle': 'saint-matthias',
  'saint-stephen-the-first-martyr': 'saint-stephen',
  'saint-thomas-apostle': 'saint-thomas-apostle',
  'saints-michael-gabriel-and-raphael-archangels': 'saint-michael-saint-gabriel-and-saint-raphael',
  'saints-peter-and-paul-apostles': 'saint-peter-and-saint-paul',
  'saints-philip-and-james-apostles': 'saint-philip-and-saint-james',
  'saints-simon-and-jude-apostles': 'saint-simon-and-saint-jude',
  'second-sunday-of-easter-divine-mercy': 'second-sunday-of-easter',
  'the-annunciation-of-the-lord': 'annunciation',
  'the-ascension-of-the-lord': 'ascension',
  'the-assumption-of-the-blessed-virgin-mary': 'assumption',
  'the-baptism-of-the-lord': 'baptism-of-the-lord',
  'the-chair-of-saint-peter-the-apostle': 'chair-of-saint-peter',
  'the-commemoration-of-all-the-faithful-departed': 'all-souls',
  'the-conversion-of-saint-paul-the-apostle': 'conversion-of-saint-paul',
  'the-dedication-of-the-lateran-basilica': 'dedication-of-the-lateran-basilica',
  'the-epiphany-of-the-lord': 'epiphany',
  'the-exaltation-of-the-holy-cross': 'exaltation-of-the-holy-cross',
  'the-holy-family-of-jesus-mary-and-joseph': 'holy-family',
  'the-holy-innocents-martyrs': 'holy-innocents',
  'the-immaculate-conception-of-the-blessed-virgin-mary': 'immaculate-conception',
  'the-immaculate-heart-of-the-blessed-virgin-mary': 'immaculate-heart-of-mary',
  'the-most-holy-body-and-blood-of-christ': 'corpus-christi',
  'the-most-holy-trinity': 'trinity-sunday',
  'the-most-sacred-heart-of-jesus': 'sacred-heart',
  'the-nativity-of-saint-john-the-baptist': 'nativity-of-saint-john-the-baptist',
  'the-nativity-of-the-blessed-virgin-mary': 'nativity-of-mary',
  'the-nativity-of-the-lord': 'christmas',
  'the-presentation-of-the-lord': 'presentation-of-the-lord',
  'the-transfiguration-of-the-lord': 'transfiguration',
  'the-visitation-of-the-blessed-virgin-mary': 'visitation',
  'thursday-of-the-lord-s-supper': 'holy-thursday',
};

/**
 * The canonical id a legacy value refers to, or undefined when it is not
 * recognised.
 *
 * Accepts either the slug the legacy app stored in `celebrationId` or the
 * display name it stored beside it. Returning undefined is the point: an
 * unrecognised value is preserved and flagged for review, never guessed at by
 * slugifying whatever the record happened to say.
 */
export function canonicalIdForLegacy(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const slug = legacySlug(value);
  return LEGACY_CELEBRATION_ALIASES[slug];
}

/**
 * Every canonical id the calendar actually produces over a span of years,
 * with the name last seen for each.
 *
 * Sweeping the calendar rather than reading the tables is deliberate: it
 * reports what is *effective* — the movable observances included, which are
 * built per year and are not exported as a table.
 */
export function collectCanonicalIds(fromYear: number, toYear: number): Map<string, string> {
  const found = new Map<string, string>();
  for (let year = fromYear; year <= toYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
        const when = new Date(year, month, dayOfMonth);
        if (when.getMonth() !== month) continue;
        for (const celebration of liturgicalToday(when).celebrations) {
          if (celebration.temporal) continue;
          if (celebration.id) found.set(celebration.id, celebration.name);
        }
      }
    }
  }
  return found;
}

/** Non-temporal celebrations the calendar produces without a canonical id. */
export function celebrationsMissingIds(fromYear: number, toYear: number): string[] {
  const missing = new Set<string>();
  for (let year = fromYear; year <= toYear; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      for (let dayOfMonth = 1; dayOfMonth <= 31; dayOfMonth += 1) {
        const when = new Date(year, month, dayOfMonth);
        if (when.getMonth() !== month) continue;
        for (const celebration of liturgicalToday(when).celebrations) {
          if (!celebration.temporal && !celebration.id) missing.add(celebration.name);
        }
      }
    }
  }
  return [...missing];
}

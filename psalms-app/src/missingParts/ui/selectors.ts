/* Everything the three screens need to know, worked out from the stored
 * entries and nothing else.
 *
 * Pure by construction: these functions take entries in and return
 * descriptions out. None of them writes, and none of them reimplements the
 * resolver, the calendar or key generation — matching comes from
 * `entryMatchesDay`, identity from `keyId`, day facts from the adapter.
 */

import {
  SECTIONS, SECTION_META, keyId, sectionHasContent,
  type Entry, type Hour, type KeyType, type Season, type SectionId,
} from '../data/types';
import type { PsalterWeek } from '../data/day';
import { classifySection, type SectionComparison } from '../data/backup';
import { describeKey } from '../data/resolve';
import type { CoverageDay } from '../adapter/coverage';
import { resolvesWithin } from '../adapter/coverage';
import { provenanceOf } from './provenance';

/* ------------------------------------------------------------- the Library */

export interface LibraryFilters {
  /** Free text, matched against the reader's own wording and key labels. */
  query: string;
  section: SectionId | 'all';
  hour: Hour | 'all';
  keyType: KeyType | 'all';
  review: 'all' | 'needs-review' | 'settled';
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '', section: 'all', hour: 'all', keyType: 'all', review: 'all',
};

/** Everything about one entry the Library shows, derived once. */
export interface LibraryRow {
  entry: Entry;
  /** The sections that actually carry text. */
  present: SectionId[];
  badge: string;
  detail: string;
  description: string;
  needsReview: boolean;
  /** Other stored entries with the very same key. */
  duplicateCount: number;
}

/** Group entries by key identity, so duplicates can be counted and shown. */
export function byKeyIdentity(entries: Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = keyId(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return groups;
}

/** The searchable text of one entry: the reader's words and its key labels. */
export function searchableText(entry: Entry): string {
  const provenance = provenanceOf(entry);
  return [
    entry.reference, entry.readingText, entry.translation,
    entry.responsory, entry.intercessions, entry.concludingPrayer,
    entry.note ?? '', entry.celebrationName ?? '',
    provenance.badge, describeKey(entry),
  ].join('\n');
}

export function libraryRows(entries: Entry[]): LibraryRow[] {
  const groups = byKeyIdentity(entries);
  return entries.map((entry) => {
    const provenance = provenanceOf(entry);
    return {
      entry,
      present: SECTIONS.filter((section) => sectionHasContent(entry, section)),
      badge: provenance.badge,
      detail: provenance.detail,
      description: describeKey(entry),
      needsReview: Boolean(entry.needsReview),
      duplicateCount: (groups.get(keyId(entry))?.length ?? 1) - 1,
    };
  });
}

/** Apply every filter at once. All of them narrow; none of them widens. */
export function filterRows(rows: LibraryRow[], filters: LibraryFilters): LibraryRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.section !== 'all' && !row.present.includes(filters.section)) return false;
    if (filters.hour !== 'all' && row.entry.hour !== filters.hour) return false;
    if (filters.keyType !== 'all' && row.entry.keyType !== filters.keyType) return false;
    if (filters.review === 'needs-review' && !row.needsReview) return false;
    if (filters.review === 'settled' && row.needsReview) return false;
    if (needle && !searchableText(row.entry).toLowerCase().includes(needle)) return false;
    return true;
  });
}

/* ------------------------------------------------------------ the Progress */

export const PSALTER_WEEKS: PsalterWeek[] = [1, 2, 3, 4];
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export interface PsalterSlot {
  psalterWeek: PsalterWeek;
  weekday: number;
  /** The sections a psalter-keyed record supplies for this exact slot. */
  present: SectionId[];
  missing: SectionId[];
  state: 'complete' | 'partial' | 'empty';
  /** The psalter records themselves, so a click can edit the right one. */
  entries: Entry[];
}

export interface ProgressTotals {
  slots: number;
  complete: number;
  partial: number;
  empty: number;
  /** How many of the 28 slots carry each section. */
  bySection: Record<SectionId, number>;
  sectionsStored: number;
  sectionsPossible: number;
}

/**
 * The 28 recurring psalter slots for one season and hour.
 *
 * DIRECT psalter coverage only. A record keyed to an exact date, a week of the
 * season or a celebration may well supply the reading on some particular day,
 * but it says nothing about whether the recurring foundation is in place —
 * counting it would report a psalter as complete that is mostly holes.
 */
export function psalterSlots(entries: Entry[], season: Season, hour: Hour): PsalterSlot[] {
  const slots: PsalterSlot[] = [];
  for (const psalterWeek of PSALTER_WEEKS) {
    for (const weekday of WEEKDAYS) {
      const matching = entries.filter(
        (entry) =>
          entry.keyType === 'psalter'
          && entry.hour === hour
          && entry.season === season
          && entry.psalterWeek === psalterWeek
          && entry.weekday === weekday,
      );
      const present = SECTIONS.filter((section) =>
        matching.some((entry) => sectionHasContent(entry, section)));
      const missing = SECTIONS.filter((section) => !present.includes(section));
      slots.push({
        psalterWeek,
        weekday,
        present,
        missing,
        state: present.length === SECTIONS.length ? 'complete' : present.length === 0 ? 'empty' : 'partial',
        entries: matching,
      });
    }
  }
  return slots;
}

/** Counts derived from the very same slots the grid draws. */
export function progressTotals(slots: PsalterSlot[]): ProgressTotals {
  const bySection = Object.fromEntries(
    SECTIONS.map((section) => [section, slots.filter((s) => s.present.includes(section)).length]),
  ) as Record<SectionId, number>;
  return {
    slots: slots.length,
    complete: slots.filter((s) => s.state === 'complete').length,
    partial: slots.filter((s) => s.state === 'partial').length,
    empty: slots.filter((s) => s.state === 'empty').length,
    bySection,
    sectionsStored: slots.reduce((total, slot) => total + slot.present.length, 0),
    sectionsPossible: slots.length * SECTIONS.length,
  };
}

/* -------------------------------------------------------------- the Review */

export type ReviewReasonKind =
  | 'flagged'
  | 'duplicate-key'
  | 'conflicting-wording'
  | 'unknown-celebration'
  | 'unresolvable-key'
  | 'content-free'
  | 'unknown-fields';

export interface ReviewReason {
  kind: ReviewReasonKind;
  /** Said in words, for the reader rather than for a log. */
  message: string;
  sections?: SectionId[];
}

export interface ReviewItem {
  entry: Entry;
  description: string;
  badge: string;
  reasons: ReviewReason[];
  /** Other entries sharing this key, kept separate and shown as they are. */
  duplicates: Entry[];
  /** Per section, how this entry's wording compares with each duplicate. */
  conflicts: { section: SectionId; other: Entry; comparison: SectionComparison }[];
  /** True when nothing here can be settled without information we lack. */
  blocked: boolean;
}

export interface ReviewContext {
  /** Canonical celebration ids the calendar actually produces. */
  knownCelebrationIds: Set<string>;
  /** The window used to ask whether a key resolves at all. */
  window: CoverageDay[];
  /** Keys the reader has marked as looked at. */
  acknowledged?: Set<string>;
}

export const REVIEW_REASON_LABELS: Record<ReviewReasonKind, string> = {
  flagged: 'Flagged when it was read in',
  'duplicate-key': 'Another record has the same key',
  'conflicting-wording': 'Two records give different wording',
  'unknown-celebration': 'This calendar does not know the celebration',
  'unresolvable-key': 'This key matches no day in the next three years',
  'content-free': 'Kept, but every section is empty',
  'unknown-fields': 'Carries fields this version does not understand',
};

/**
 * Every stored record that wants a human eye, and exactly why.
 *
 * Nothing is merged, chosen, trimmed or dropped here: this only describes.
 */
export function reviewItems(entries: Entry[], context: ReviewContext): ReviewItem[] {
  const groups = byKeyIdentity(entries);
  const items: ReviewItem[] = [];

  for (const entry of entries) {
    const reasons: ReviewReason[] = [];
    const duplicates = (groups.get(keyId(entry)) ?? []).filter((other) => other.id !== entry.id);
    const conflicts: ReviewItem['conflicts'] = [];
    let blocked = false;

    if (entry.needsReview || entry.reviewNote) {
      reasons.push({
        kind: 'flagged',
        message: entry.reviewNote
          ?? 'It was marked for checking when it was read in, but no reason was recorded.',
      });
    }

    if (duplicates.length > 0) {
      reasons.push({
        kind: 'duplicate-key',
        message: `${duplicates.length} other record${duplicates.length === 1 ? ' shares' : 's share'} this exact key. Both are kept; the office shows the most recently edited.`,
      });
      for (const other of duplicates) {
        for (const section of SECTIONS) {
          if (!sectionHasContent(entry, section) || !sectionHasContent(other, section)) continue;
          const comparison = classifySection(entry, other, section);
          if (comparison !== 'identical') conflicts.push({ section, other, comparison });
        }
      }
      const differing = [...new Set(conflicts.map((c) => c.section))];
      if (differing.length > 0) {
        reasons.push({
          kind: 'conflicting-wording',
          message: 'The wording differs. Both are shown below; nothing has been chosen for you.',
          sections: differing,
        });
      }
    }

    if (entry.keyType === 'celebration' && entry.celebrationId
        && !context.knownCelebrationIds.has(entry.celebrationId)) {
      reasons.push({
        kind: 'unknown-celebration',
        message: `This record is filed under “${entry.celebrationId}”, which this calendar does not carry. It has been kept exactly as it is; re-key it to a celebration the calendar knows, or to an exact date.`,
      });
      blocked = true;
    }

    if (!resolvesWithin(entry, context.window)) {
      const past = entry.keyType === 'date' && entry.date
        && entry.date < (context.window[0]?.iso ?? '');
      reasons.push({
        kind: 'unresolvable-key',
        message: past
          ? 'This is an exact date that has already passed, so it will not come round again. It is kept in case you want its wording.'
          : 'No day in the next three years of the calendar falls on this key, so the office will not reach it. It is kept exactly as it is.',
      });
    }

    if (SECTIONS.every((section) => !sectionHasContent(entry, section))) {
      reasons.push({
        kind: 'content-free',
        message: 'Every section is empty. The record is kept because it may still carry your note or its key.',
      });
    }

    if (entry.extra && Object.keys(entry.extra).length > 0) {
      reasons.push({
        kind: 'unknown-fields',
        message: `Carries ${Object.keys(entry.extra).join(', ')}, which this version does not understand. They are preserved untouched.`,
      });
      blocked = true;
    }

    if (reasons.length === 0) continue;
    items.push({
      entry,
      description: describeKey(entry),
      badge: provenanceOf(entry).badge,
      reasons,
      duplicates,
      conflicts,
      blocked,
    });
  }

  return items;
}

/** A section's stored wording, for showing two versions side by side. */
export function sectionWording(entry: Entry, section: SectionId): string {
  return SECTION_META[section].fields
    .map((field) => String(entry[field] ?? ''))
    .filter((value) => value.length > 0)
    .join('\n');
}

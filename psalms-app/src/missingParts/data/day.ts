/* The adapter contract.

   This is the ONLY shape the missing-parts resolver knows about. Phase 2 will
   add `src/missingParts/adapter/day.ts`, which builds one of these from the
   production calendar's `LiturgicalToday` and is the single place the two
   systems meet. Keeping the contract here — rather than importing the
   production calendar's types directly — is what makes the data core
   testable without a calendar, and what makes a change to the production
   calendar break loudly in one file instead of drifting quietly through the
   resolver.

   Decisions this contract carries (approved plan, D1 / D4 / D5 / D6):

   D1  `psalterWeek` is whatever the production calendar says. The data core
       never derives it.
   D4  `celebrations` is the COMPLETE list for the day, not just the primary
       one, so material keyed to a celebration the day does not lead with — the
       Baptism of the Lord behind a Sunday, for instance — still resolves.
       Which celebration the day is *called* by is not decided here.
   D5  `weekOfSeason` is null where the production calendar has no week for the
       day; `allowsWeekKey` is false where a week key must not be used at all.
   D6  `evening-before` is its own hour and never inherits `evening`.         */

import type { SeasonKey } from '../../types';
import type { ISODate } from './iso';

/** The seasons the production calendar distinguishes. */
export type Season = SeasonKey;

/** The four-week psalter cycle. */
export type PsalterWeek = 1 | 2 | 3 | 4;

/* The hours that can carry missing-parts material.

   `night` is the book's Compline. The Office of Readings is deliberately
   absent: its shape (two readings, responsorial verses, the Te Deum) does not
   correspond to the four-section model, and is deferred to a separately
   designed extension (D6).                                                   */
export type Hour = 'morning' | 'midday' | 'evening' | 'evening-before' | 'night';

/** A celebration, identified by a stable canonical id rather than its name. */
export interface CanonicalCelebration {
  /* Stable across display-name edits and across calendar years. Assigned in
     the celebration definitions themselves (D2a option (a)); never derived at
     runtime from the display name. Two source rows describing the same
     observance may legitimately share one id, in which case the adapter
     presents them as a single identity. */
  id: string;
  /** Display wording only. Never used for matching. */
  name: string;
}

/** One liturgical day, as the missing-parts resolver needs it. */
export interface MissingPartsDay {
  date: ISODate;
  season: Season;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** The four-week psalter cycle, from the production calendar (D1). */
  psalterWeek: PsalterWeek;
  /** Week within the season, or null where the calendar has none (D5). */
  weekOfSeason: number | null;
  /** False where a week-keyed record must not apply, e.g. the Triduum (D5). */
  allowsWeekKey: boolean;
  /** Every celebration kept today, deduplicated by canonical id (D4). */
  celebrations: CanonicalCelebration[];
}

/* Turning the printed page into something two choirs can actually sing.

   The book's own legend (p. 5):
     Bold / Accent (’)  = pitch changes, according to the psalm tone
     Line space         = singing changes sides
     Plus (+)           = the verse continues on the next page

   So a blank line in the source is a change of side, and the "/" characters
   the typesetter used inside the gospel canticles mark the pitch changes.  */

import type { AntiphonItem, Strophe } from '../types';

export type Side = 'A' | 'B';

/** Which side sings a strophe, counting from the first of the psalm. */
export function sideOf(index: number): Side {
  return index % 2 === 0 ? 'A' : 'B';
}

/** Split a line into plain text and tone markers so markers can be styled.

    The slash is shown as it is written. It marks the syllable where the tone
    changes, and that is how a singer reads it — putting some other glyph in
    its place would misquote the text, and in the table of psalm tones the
    slash separates segments rather than marking an accent at all. */
export interface Frag { text: string; tone?: boolean; point?: boolean }

/* The book's own pointing: the flex asterisk, and the dagger where a verse is
   divided. These are picked out of the text so they can be set apart
   typographically. Nothing is ever inserted — the printed page carries very
   few of them, and inventing pointing would be inventing the text. */
const POINTING = '*†‡';

export function fragments(line: string): Frag[] {
  const out: Frag[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ text: buf }); buf = ''; } };
  for (const ch of line) {
    if (ch === '/') { flush(); out.push({ text: ch, tone: true }); }
    else if (POINTING.includes(ch)) { flush(); out.push({ text: ch, point: true }); }
    else buf += ch;
  }
  flush();
  return out.length ? out : [{ text: line }];
}

export function hasTones(strophes: Strophe[]): boolean {
  return strophes.some(s => s.some(l => l.t.includes('/')));
}

/* ------------------------------------------------------- antiphon picking */

/** Book labels, normalised so a season can be matched against them. */
const LABEL_ALIASES: Record<string, string[]> = {
  'Through the Year': ['through the year', 'outside easter', 'ordinary time'],
  Advent: ['advent'],
  Christmastide: ['christmastide', 'christmas'],
  Lent: ['lent', 'passiontide'],
  'Holy Week': ['holy week', 'lent', 'passiontide'],
  Eastertide: ['eastertide', 'easter'],
};

/**
 * Mark the antiphons that belong to `season`. Nothing is thrown away — the
 * reader can always fall back to showing every antiphon the book prints.
 */
export function markSeason(items: AntiphonItem[], season: string): (AntiphonItem & { active: boolean })[] {
  const wanted = LABEL_ALIASES[season] ?? [season.toLowerCase()];
  const isMatch = (label: string) => {
    const l = label.toLowerCase();
    if (season === 'Through the Year' && l.startsWith('outside easter')) return true;
    if (season !== 'Eastertide' && l.startsWith('outside easter')) return true;
    return wanted.some(w => l.startsWith(w));
  };

  const marked = items.map(it => ({ ...it, active: isMatch(it.label) }));
  // "or: ..." belongs to whichever antiphon it follows.
  for (let i = 1; i < marked.length; i++) {
    if (/^or$/i.test(marked[i].label) && marked[i - 1].active) marked[i].active = true;
  }
  // Never hide everything: if the season is not printed here, show it all.
  return marked.some(m => m.active) ? marked : items.map(it => ({ ...it, active: true }));
}

/** A short heading for an antiphon block, used in the table of contents. */
export function antiphonSummary(items: AntiphonItem[]): string {
  const first = items[0];
  return first ? `Antiphon — ${first.text.slice(0, 48)}${first.text.length > 48 ? '…' : ''}` : 'Antiphon';
}

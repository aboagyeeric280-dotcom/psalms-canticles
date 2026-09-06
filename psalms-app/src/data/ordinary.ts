/* The unchanging frame of each hour.

   The book prints the psalmody day by day but describes the surrounding
   structure once, in "How to use this book" (p. 5). Everything marked
   source: 'book' is quoted from those pages; the two items marked
   source: 'common' are texts the book names but does not print, given here
   in their traditional English wording so the hour can be prayed straight
   through. Hymns for Morning and Evening Prayer are not in the book at all —
   the app says so rather than substituting something.                      */

import type { HourKey } from '../types';

export interface OrdinaryItem {
  id: string;
  label: string;
  /** Lines of text, or a pointer into the book. */
  lines?: string[];
  rubric?: string;
  route?: string;
  routeLabel?: string;
  source: 'book' | 'common' | 'none';
}

export const CALL_FIRST: OrdinaryItem = {
  id: 'call-first',
  label: 'Call to Prayer',
  rubric: 'For the first prayer of the day (Morning Prayer or the Office of Readings) — Psalm 51:15',
  lines: ['V.  Help me to speak, Lord.', 'R.  And I will praise you.'],
  source: 'book',
};

export const CALL_OTHER: OrdinaryItem = {
  id: 'call-other',
  label: 'Call to Prayer',
  rubric: 'For every other hour — Psalm 70:1',
  lines: ['V.  Save me, God.', 'R.  Lord, help me now.'],
  source: 'book',
};

export const GLORY_BE: OrdinaryItem = {
  id: 'glory',
  label: 'Glory Be',
  lines: [
    'Glory be to the Father and to the Son, and to the Holy Spirit,',
    'As it was in the beginning, is now, and ever shall be,',
    'world without end. Amen.',
    'Halleluia!',
  ],
  source: 'book',
};

export const OUR_FATHER: OrdinaryItem = {
  id: 'our-father',
  label: 'The Lord’s Prayer',
  rubric: 'Named but not printed in the book',
  lines: [
    'Our Father, who art in heaven, hallowed be thy name;',
    'thy kingdom come; thy will be done on earth as it is in heaven.',
    'Give us this day our daily bread;',
    'and forgive us our trespasses as we forgive those who trespass against us;',
    'and lead us not into temptation, but deliver us from evil. Amen.',
  ],
  source: 'common',
};

export const GREETING: OrdinaryItem = {
  id: 'greeting',
  label: 'The Lord be with you',
  rubric: 'At Morning and Evening Prayer only',
  lines: ['V.  The Lord be with you.', 'R.  And with your spirit.'],
  source: 'book',
};

const HYMN_NOT_PRINTED: OrdinaryItem = {
  id: 'hymn',
  label: 'Hymn',
  rubric: 'A long hymn. The book leaves the choice to the community — it prints hymns only for Midday Prayer and Compline.',
  source: 'none',
};

const HYMN_MIDDAY: OrdinaryItem = {
  id: 'hymn-midday',
  label: 'Hymn',
  rubric: 'Midday 1, 2 or 3',
  route: '#/midday-hymns',
  routeLabel: 'Open the three Midday hymns',
  source: 'book',
};

const READING_LONG: OrdinaryItem = {
  id: 'reading',
  label: 'Scripture Reading',
  rubric: 'A short reading, chosen from the day’s lectionary',
  source: 'none',
};

const RESPONSORY: OrdinaryItem = {
  id: 'responsory',
  label: 'Responsory',
  rubric: 'A brief responsory follows the reading',
  source: 'none',
};

const BENEDICTUS: OrdinaryItem = {
  id: 'benedictus',
  label: 'Canticle of Zechariah — Benedictus',
  rubric: 'Luke 1:68–79, with the antiphon of the day',
  route: '#/canticle/zechariah',
  routeLabel: 'Open the nine settings',
  source: 'book',
};

const MAGNIFICAT: OrdinaryItem = {
  id: 'magnificat',
  label: 'Canticle of Mary — Magnificat',
  rubric: 'Luke 1:46–55, with the antiphon of the day',
  route: '#/canticle/mary',
  routeLabel: 'Open the nine settings',
  source: 'book',
};

const PETITIONS: OrdinaryItem = {
  id: 'petitions',
  label: 'Petitions',
  rubric: 'Intercessions, concluding with the Lord’s Prayer',
  source: 'none',
};

const COLLECT: OrdinaryItem = {
  id: 'collect',
  label: 'Concluding Prayer',
  rubric: 'The collect of the day, or one of the thirty-four weekly prayers',
  route: '#/prayers',
  routeLabel: 'Open the Weekly Prayers',
  source: 'book',
};

const BLESSING: OrdinaryItem = {
  id: 'blessing',
  label: 'Blessing and Dismissal',
  rubric: 'At Morning and Evening Prayer',
  source: 'none',
};

const DISMISSAL: OrdinaryItem = {
  id: 'dismissal',
  label: 'Dismissal',
  source: 'none',
};

export interface HourShape {
  before: OrdinaryItem[];   // everything printed before the psalmody
  after: OrdinaryItem[];    // everything printed after it
  psalmodyLabel: string;
}

export const HOUR_SHAPE: Record<HourKey, HourShape> = {
  morning: {
    before: [CALL_FIRST, { ...GLORY_BE, rubric: 'Then the Invitatory' }, {
      id: 'invitatory', label: 'Invitatory', rubric: 'Psalm 95, with the antiphon of the day',
      route: '#/invitatory', routeLabel: 'Open the Invitatory', source: 'book',
    }, HYMN_NOT_PRINTED],
    psalmodyLabel: 'Psalmody — psalm, Old Testament canticle, psalm',
    after: [READING_LONG, RESPONSORY, BENEDICTUS, PETITIONS, OUR_FATHER, COLLECT, GREETING, BLESSING],
  },
  midday: {
    before: [CALL_OTHER, GLORY_BE, HYMN_MIDDAY],
    psalmodyLabel: 'Psalmody — three sections with antiphons',
    after: [{ ...READING_LONG, label: 'Short Reading' }, { ...COLLECT, label: 'Collect' }, DISMISSAL],
  },
  evening: {
    before: [CALL_OTHER, GLORY_BE, HYMN_NOT_PRINTED],
    psalmodyLabel: 'Psalmody — psalm, psalm, New Testament canticle',
    after: [READING_LONG, RESPONSORY, MAGNIFICAT, PETITIONS, OUR_FATHER, COLLECT, GREETING, BLESSING],
  },
  'evening-before': {
    before: [CALL_OTHER, GLORY_BE, HYMN_NOT_PRINTED],
    psalmodyLabel: 'Psalmody — psalm, psalm, New Testament canticle',
    after: [READING_LONG, RESPONSORY, MAGNIFICAT, PETITIONS, OUR_FATHER, COLLECT, GREETING, BLESSING],
  },
};

export const READINGS_SHAPE: HourShape = {
  before: [CALL_FIRST, GLORY_BE, { ...HYMN_NOT_PRINTED, rubric: 'A short hymn' }],
  psalmodyLabel: 'Three meditation psalms with antiphons',
  after: [
    { id: 'verse', label: 'Responsorial verses', source: 'none' },
    { ...READING_LONG, label: 'First Reading — Scripture', rubric: 'A long reading' },
    { id: 'reading2', label: 'Second Reading', rubric: 'From the Fathers, or a Dominican author', source: 'none' },
    { id: 'tedeum', label: 'Te Deum', rubric: 'The Church’s Hymn of Praise, on Sundays and feasts', route: '#/te-deum', routeLabel: 'Open the Te Deum', source: 'book' },
    COLLECT, DISMISSAL,
  ],
};

/** The order-of-hours table printed on p. 5. */
export const ORDER_TABLE = {
  columns: ['Readings', 'Morning', 'Midday', 'Evening', 'Compline'],
  rows: [
    ['Call to prayer', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Hymn', 'short', 'long', 'short', 'long', 'short'],
    ['Psalms & canticles', '3', '3', '3', '3', '1 or 2'],
    ['Scripture reading', 'long', 'short', 'short', 'short or long', 'short'],
    ['Second reading', 'yes', 'no', 'no', 'sometimes', 'no'],
    ['Responsorial psalm', 'verses', 'yes', 'brief', 'yes', 'yes'],
    ['Praise canticle', 'Te Deum', 'Zechariah', 'no', 'Mary', 'Simeon'],
    ['Petitions & Our Father', 'no', 'yes', 'no', 'yes', 'no'],
    ['Concluding prayer', 'yes', 'yes', 'yes', 'yes', 'yes'],
    ['“The Lord be with you”', 'no', 'yes', 'no', 'yes', 'no'],
    ['Blessing', 'no', 'yes', 'no', 'yes', 'yes'],
    ['Dismissal', 'yes', 'yes', 'yes', 'yes', 'anthem'],
  ],
  note: 'The above Order of Hours is included as a guide. What is important is not that you follow each detail, but that you pray.',
};

export const SINGING_LEGEND = [
  ['Accent ‘', 'the pitch changes, according to the psalm tone'],
  ['Line space', 'the singing changes sides'],
  ['Plus +', 'the verse continues on the next page'],
];

/* Shapes produced by tools/parse.js + tools/split.js. */

export type Indent = 0 | 1 | 2;
export interface Line { t: string; i: Indent }
export type Strophe = Line[];

export interface AntiphonItem { label: string; text: string }

export type Block =
  | { k: 'head'; text: string; raw?: string; level: 1 | 2; page?: number }
  | { k: 'label'; text: string; note?: string; page?: number }
  | { k: 'ant'; items: AntiphonItem[]; page?: number }
  | {
    k: 'psalm'; ref: string; num: number; title: string;
    /** A cross-reference printed beside the heading. */
    alt?: string;
    /** A rubric printed under the heading, before the verses. */
    note?: string;
    /** Long psalms are divided into sections numbered with Roman numerals. */
    section?: string; sectionTitle?: string;
    strophes: Strophe[]; page?: number;
  }
  | {
    k: 'cant'; ref: string; title: string; alt?: string; note?: string;
    section?: string; sectionTitle?: string;
    strophes: Strophe[]; page?: number;
  }
  | { k: 'text'; paras: Strophe[]; page?: number }
  | { k: 'vr'; items: { c: string; text: string }[]; page?: number }
  | { k: 'rubric'; text: string; page?: number }
  | { k: 'ref'; text: string; page?: number }
  | { k: 'reading'; day: string; ref: string; page?: number }
  | { k: 'plate'; page: number; printed?: number; caption?: string }
  | { k: 'setting'; name: string; num: number | null; note: string; page?: number };

export type HourKey = 'evening-before' | 'morning' | 'midday' | 'evening';
export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface Office {
  id: string;
  week: 1 | 2 | 3 | 4;
  day: DayKey;
  dayName: string;
  hour: HourKey;
  title: string;
  page: number;
  blocks: Block[];
}

export interface ReadingsOffice {
  id: string;
  week: 1 | 2 | 3 | 4;
  day: DayKey;
  dayName: string;
  seasonal: boolean;
  title: string;
  page: number;
  blocks: Block[];
}

export interface Group { title: string; page?: number; blocks: Block[] }

export interface Plate { page: number; file: string; caption: string; w: number; h: number }

export interface SearchEntry {
  t: 'psalm' | 'canticle' | 'section';
  ref: string;
  num?: number;
  title?: string;
  route: string;
  where: string;
}

export type SeasonKey =
  | 'advent' | 'christmas' | 'lent' | 'holyweek' | 'triduum' | 'easter' | 'ordinary';

/** The antiphon labels the book prints, in the order it prints them. */
export type AntiphonFilter =
  | 'all' | 'Through the Year' | 'Advent' | 'Christmastide'
  | 'Lent' | 'Holy Week' | 'Eastertide';

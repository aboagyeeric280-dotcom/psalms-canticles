/* Bundled entries and the reader's own changes to them.
 *
 * The bundle is merged in on every load and never written to the device as
 * it ships. These tests hold the other half of that bargain: whatever the
 * reader does to a bundled entry — edit it, acknowledge it, delete it — is
 * still true after the app is closed and opened again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./publishedEntries.json', () => ({
  default: [
    {
      id: 'published-20260922-morning',
      keyType: 'psalter',
      hour: 'morning',
      season: 'ordinary',
      psalterWeek: 1,
      weekday: 2,
      reference: 'Bundled 1:1',
      readingText: 'Bundled reading.',
      responsory: '',
      intercessions: '',
      concludingPrayer: '',
      origin: 'published',
      needsReview: true,
      reviewNote: 'Bundled note.',
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
  ],
}));

import { STORAGE_KEY } from './storage';
import * as store from '../state/store';

const ID = 'published-20260922-morning';
const find = () => store.getState().file.entries.find((e) => e.id === ID);
const reopen = () => store.reloadFromStorage();

describe('bundled entries', () => {
  beforeEach(() => {
    window.localStorage.clear();
    reopen();
  });

  it('appear on a fresh device and are not written to it untouched', () => {
    expect(find()?.readingText).toBe('Bundled reading.');
    store.markExported('2026-11-22T00:00:00.000Z'); // any unrelated write
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(saved.entries).toEqual([]);
    reopen();
    expect(find()?.origin).toBe('published');
  });

  it('keep an edit across a reload', () => {
    const result = store.saveSectionOn(ID, 'reading', { reference: 'Mine 2:2', readingText: 'My reading.' });
    expect(result.ok).toBe(true);
    reopen();
    const entry = find();
    expect(entry?.readingText).toBe('My reading.');
    expect(entry?.origin).toBe('personal');
    expect(store.getState().file.entries.filter((e) => e.id === ID)).toHaveLength(1);
  });

  it('keep an acknowledged review across a reload', () => {
    store.acknowledgeReview(ID, '2026-11-22T10:00:00.000Z');
    reopen();
    expect(find()?.needsReview).toBeUndefined();
    expect(find()?.reviewedAt).toBe('2026-11-22T10:00:00.000Z');
  });

  it('stay deleted after a reload', () => {
    store.deleteEntry(ID);
    reopen();
    expect(find()).toBeUndefined();
  });

  it('stay deleted after being edited and then deleted', () => {
    store.saveSectionOn(ID, 'reading', { reference: 'Mine', readingText: 'Mine.' });
    store.deleteEntry(ID);
    reopen();
    expect(find()).toBeUndefined();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissingPartsPage, { MISSING_PARTS_ROUTES, tabFromRoute } from './MissingPartsPage';
import { getState, reloadFromStorage, saveSection, saveEntry } from '../state/store';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../data/storage';
import { EMPTY_CONTENT, type Entry } from '../data/types';

function entry(partial: Partial<Entry> & Pick<Entry, 'keyType' | 'hour'>): Entry {
  return {
    ...EMPTY_CONTENT,
    id: Math.random().toString(36).slice(2),
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    ...partial,
  };
}

function seed(entries: Entry[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: 4, entries, meta: { createdAt: 'x' },
  }));
  reloadFromStorage();
}

const READING = entry({
  keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
  reference: 'Romans 13:11', readingText: 'It is now the hour, with lamps.', translation: 'DR',
});
const PRAYER = entry({
  keyType: 'week', hour: 'evening', season: 'advent', weekOfSeason: 2,
  concludingPrayer: 'A prayer for Advent.', needsReview: true, reviewNote: 'Please check.',
});

beforeEach(() => {
  window.localStorage.clear();
  reloadFromStorage();
});

const show = (tab: Parameters<typeof MissingPartsPage>[0]['tab'], onGo = vi.fn()) =>
  render(<MissingPartsPage tab={tab} onGo={onGo} />);

describe('1 and 2: the three screens and their navigation', () => {
  it('maps each route to its screen', () => {
    expect(tabFromRoute('#/missing')).toBe('library');
    expect(tabFromRoute('#/missing/progress')).toBe('progress');
    expect(tabFromRoute('#/missing/review')).toBe('review');
    expect(tabFromRoute('#/missing/anything-else')).toBe('library');
  });

  it('renders each screen', () => {
    const library = show('library');
    expect(screen.getByRole('search', { name: 'Search your own material' })).toBeInTheDocument();
    library.unmount();

    const progress = show('progress');
    expect(screen.getByRole('table')).toBeInTheDocument();
    progress.unmount();

    show('review');
    expect(screen.getByText(/wants a human eye/)).toBeInTheDocument();
  });

  it('marks the active tab and navigates to the others', async () => {
    const onGo = vi.fn();
    show('progress', onGo);
    const tabs = within(screen.getByRole('navigation', { name: 'Your own material' }));
    expect(tabs.getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-current', 'page');
    expect(tabs.getByRole('button', { name: 'Library' })).not.toHaveAttribute('aria-current');

    const user = userEvent.setup();
    await user.click(tabs.getByRole('button', { name: 'Review' }));
    expect(onGo).toHaveBeenCalledWith(MISSING_PARTS_ROUTES.review);
  });
});

describe('3 and 4: the Library shows and searches what is stored', () => {
  it('shows every entry exactly once', () => {
    seed([READING, PRAYER]);
    show('library');
    expect(screen.getAllByText('Yours')).toHaveLength(2);
    expect(screen.getByText(/2 records/)).toBeInTheDocument();
  });

  it('finds personal wording locally', async () => {
    seed([READING, PRAYER]);
    show('library');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search your material'), 'lamps');
    expect(screen.getByText(/1 of 2 records/)).toBeInTheDocument();
  });

  it('filters combine', async () => {
    seed([READING, PRAYER]);
    show('library');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Hour'), 'evening');
    expect(screen.getByText(/1 of 2 records/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Review'), 'settled');
    expect(screen.getByText(/0 of 2 records/)).toBeInTheDocument();
  });

  it('says so plainly when nothing is stored', () => {
    show('library');
    expect(screen.getByText(/Nothing is stored yet/)).toBeInTheDocument();
  });
});

describe('7 and 8: editing targets the chosen record', () => {
  it('edits the selected entry, not another with the same key', async () => {
    const a = entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, id: 'aaa', responsory: 'First wording.' });
    const b = entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, id: 'bbb', responsory: 'Second wording.' });
    seed([a, b]);
    show('library');

    const user = userEvent.setup();
    // The second card's responsory button.
    const cards = screen.getAllByRole('listitem');
    await user.click(within(cards[1]).getByRole('button', { name: /^Edit the responsory/ }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByLabelText('Responsory')).toHaveValue('Second wording.');
    await user.clear(sheet.getByLabelText('Responsory'));
    await user.type(sheet.getByLabelText('Responsory'), 'Rewritten.');
    await user.click(sheet.getByRole('button', { name: 'Save' }));

    const entries = getState().file.entries;
    expect(entries.find((e) => e.id === 'aaa')?.responsory).toBe('First wording.');
    expect(entries.find((e) => e.id === 'bbb')?.responsory).toBe('Rewritten.');
    expect(entries).toHaveLength(2);
  });

  it('preserves the other sections and unknown fields', async () => {
    const rich = entry({
      keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1,
      id: 'rich', reference: 'Rom 13', readingText: 'A reading.', translation: 'DR',
      responsory: 'A responsory.', intercessions: 'Some intercessions.',
      concludingPrayer: 'A prayer.', note: 'my note',
      extra: { fromTheFuture: { deep: [1, 2] } },
    });
    seed([rich]);
    show('library');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/ }));
    const sheet = within(screen.getByRole('dialog'));
    await user.clear(sheet.getByLabelText('Responsory'));
    await user.type(sheet.getByLabelText('Responsory'), 'Changed.');
    await user.click(sheet.getByRole('button', { name: 'Save' }));

    const saved = getState().file.entries[0];
    expect(saved.responsory).toBe('Changed.');
    expect(saved.readingText).toBe('A reading.');
    expect(saved.intercessions).toBe('Some intercessions.');
    expect(saved.concludingPrayer).toBe('A prayer.');
    expect(saved.note).toBe('my note');
    expect(saved.extra?.fromTheFuture).toEqual({ deep: [1, 2] });
  });

  it('20: keeps exact text through a Library edit', async () => {
    // CRLF through a textarea is normalised by the browser (a documented
    // platform limit); everything else must survive exactly.
    const awkward = '  V.  Line one.\n\n  R.  Line two.   ';
    seed([entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, responsory: 'placeholder' })]);
    show('library');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/ }));
    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    await user.click(box);
    await user.paste(awkward);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(getState().file.entries[0].responsory).toBe(awkward);
  });
});

describe('9: a storage failure is not announced as success', () => {
  it('keeps the sheet open and reports the error', async () => {
    seed([entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, responsory: 'Something.' })]);
    show('library');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/ }));
    const real = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage, key: string, value: string,
    ) {
      if (key === STORAGE_KEY) {
        const error = new Error('full');
        error.name = 'QuotaExceededError';
        throw error;
      }
      real.call(this, key, value);
    });

    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    await user.type(box, 'Will not fit.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    spy.mockRestore();

    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' '))
      .toMatch(/run out of space/i);
    expect(screen.getByRole('status', { name: 'Notifications' })).not.toHaveTextContent(/saved/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('14: a slot is edited against its own psalter key', () => {
  it('creates the slot key, not today’s', async () => {
    show('progress');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Season'), 'ordinary');
    await user.selectOptions(screen.getByLabelText('Hour'), 'evening');

    // Psalter week III, Thursday.
    await user.click(screen.getByRole('button', {
      name: /^Psalter week III, Thursday, Evening Prayer/,
    }));
    const sheet = within(screen.getByRole('dialog'));
    await user.type(sheet.getByLabelText('The reading'), 'For that slot.');
    await user.click(sheet.getByRole('button', { name: 'Save' }));

    const saved = getState().file.entries[0];
    expect(saved.keyType).toBe('psalter');
    expect(saved.season).toBe('ordinary');
    expect(saved.psalterWeek).toBe(3);
    expect(saved.weekday).toBe(4);
    expect(saved.hour).toBe('evening');
    expect(saved.date).toBeUndefined();
    expect(saved.celebrationId).toBeUndefined();
    expect(saved.weekOfSeason).toBeUndefined();
  });

  it('shows 28 cells and totals that agree with them', async () => {
    seed([entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
      psalterWeek: 1, weekday: 1, responsory: 'x' })]);
    show('progress');
    const cells = screen.getAllByRole('button', { name: /^Psalter week/ });
    expect(cells).toHaveLength(28);
    expect(screen.getByText('0 of 28')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('1/4')).toHaveLength(1);
  });
});

describe('16 to 19: the Review screen', () => {
  const a = entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
    psalterWeek: 1, weekday: 1, id: 'aaa', responsory: 'First wording.' });
  const b = entry({ keyType: 'psalter', hour: 'morning', season: 'ordinary',
    psalterWeek: 1, weekday: 1, id: 'bbb', responsory: 'Second wording.' });

  it('lists flagged, duplicated and content-free records', () => {
    seed([a, b, PRAYER, entry({ keyType: 'psalter', hour: 'midday', season: 'ordinary',
      psalterWeek: 2, weekday: 2, note: 'empty but kept' })]);
    show('review');
    expect(screen.getByText(/4 records to look at/)).toBeInTheDocument();
    expect(screen.getByText(/Kept, but every section is empty/)).toBeInTheDocument();
    expect(screen.getAllByText(/Another record has the same key/)).toHaveLength(2);
  });

  it('shows conflicting wording side by side and merges nothing', async () => {
    seed([a, b]);
    show('review');
    /* Both records are listed, and each shows the pair — so each wording
       appears once as "this record" and once as "the other". */
    expect(screen.getAllByText('First wording.')).toHaveLength(2);
    expect(screen.getAllByText('Second wording.')).toHaveLength(2);
    expect(screen.getAllByText(/nothing here has been merged or chosen/i).length)
      .toBeGreaterThan(0);
    expect(getState().file.entries).toHaveLength(2);
  });

  it('lets duplicates be inspected without changing them', async () => {
    seed([a, b]);
    show('review');
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button', { name: /Inspect the 1 record/ });
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true');
    expect(getState().file.entries).toHaveLength(2);
  });

  it('marks reviewed without touching the wording, and can put it back', async () => {
    seed([PRAYER]);
    show('review');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    const after = getState().file.entries[0];
    expect(after.needsReview).toBeUndefined();
    expect(after.reviewedAt).toBeTruthy();
    expect(after.reviewNote).toBe('Please check.');
    expect(after.concludingPrayer).toBe('A prayer for Advent.');

    await user.click(screen.getByRole('button', { name: 'Put it back on the list' }));
    expect(getState().file.entries[0].needsReview).toBe(true);
    expect(getState().file.entries[0].reviewedAt).toBeUndefined();
  });

  it('will not let a blocked record be marked reviewed', () => {
    seed([entry({ keyType: 'celebration', hour: 'morning', celebrationId: 'saint-nobody',
      celebrationName: 'Saint Nobody', responsory: 'x', needsReview: true })]);
    show('review');
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeDisabled();
    expect(screen.getByText(/cannot be settled from here yet/)).toBeInTheDocument();
  });
});

describe('21 and 22: the legacy store and the migration engine stay out of reach', () => {
  it('never touches the legacy key on any screen', async () => {
    seed([READING, PRAYER]);
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (const tab of ['library', 'progress', 'review'] as const) {
      const view = show(tab);
      view.unmount();
    }
    for (const [key] of getItem.mock.calls) expect(key).not.toBe(LEGACY_STORAGE_KEY);
    for (const [key] of setItem.mock.calls) expect(key).not.toBe(LEGACY_STORAGE_KEY);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('writes nothing merely by opening a screen or changing a filter', async () => {
    seed([READING, PRAYER]);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    show('library');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search your material'), 'lamps');
    await user.selectOptions(screen.getByLabelText('Hour'), 'evening');
    expect(setItem.mock.calls.filter(([k]) => k === STORAGE_KEY)).toHaveLength(0);
    setItem.mockRestore();
  });
});

describe('the store keeps working alongside the office editor', () => {
  it('saveSection and saveEntry still reach the same store', () => {
    saveSection(
      { keyType: 'psalter', hour: 'morning', season: 'ordinary', psalterWeek: 1, weekday: 1 },
      'responsory', { responsory: 'From the office.' },
    );
    expect(getState().file.entries).toHaveLength(1);
    saveEntry({ ...getState().file.entries[0], responsory: 'Edited whole.' });
    expect(getState().file.entries[0].responsory).toBe('Edited whole.');
  });
});

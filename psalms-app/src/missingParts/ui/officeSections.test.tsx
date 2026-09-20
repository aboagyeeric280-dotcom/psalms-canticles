import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfficeSections from './OfficeSections';
import { reloadFromStorage, getState } from '../state/store';
import { STORAGE_KEY, LEGACY_STORAGE_KEY } from '../data/storage';
import { SECTION_META, type SectionId } from '../data/types';

/* A plain Tuesday in Ordinary Time: no celebration, every key type in play. */
const TUESDAY = new Date(2027, 5, 15);
const TITLE = 'Tuesday of the 11th Week in Ordinary Time';

function renderOffice(props: Partial<Parameters<typeof OfficeSections>[0]> = {}) {
  return render(
    <OfficeSections when={TUESDAY} hour="morning" dayTitle={TITLE} {...props} />,
  );
}

async function addSection(section: SectionId, text: string) {
  const user = userEvent.setup();
  const label = SECTION_META[section].label.toLowerCase();
  await user.click(screen.getByRole('button', { name: new RegExp(`^Add the ${label}`, 'i') }));
  const sheet = within(screen.getByRole('dialog'));
  const box = sheet.getByLabelText(section === 'reading' ? 'The reading' : SECTION_META[section].label);
  await user.clear(box);
  await user.type(box, text);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  return user;
}

beforeEach(() => {
  window.localStorage.clear();
  reloadFromStorage();
});

describe('1: the four empty states', () => {
  it('offers all four sections for adding', () => {
    renderOffice();
    for (const section of ['reading', 'responsory', 'intercessions', 'concludingPrayer'] as SectionId[]) {
      const label = SECTION_META[section].label.toLowerCase();
      expect(screen.getByRole('button', { name: new RegExp(`^Add the ${label}`, 'i') })).toBeInTheDocument();
    }
    expect(screen.getAllByText('Not yet added — tap to add it')).toHaveLength(4);
  });

  it('names the section, the hour and the day in the accessible label', () => {
    renderOffice();
    const add = screen.getByRole('button', { name: /^Add the short reading/i });
    expect(add).toHaveAccessibleName(`Add the short reading for Morning Prayer, ${TITLE}`);
  });

  it('offers no placeholder wording of its own', () => {
    renderOffice();
    expect(screen.queryByText(/Douay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/It is now the hour/i)).not.toBeInTheDocument();
  });
});

describe('2: each section can be added and appears at once', () => {
  it.each([
    ['reading', 'It is now the hour for us to rise from sleep.'],
    ['responsory', 'V. In the morning.\nR. In the morning.'],
    ['intercessions', 'For the Church: Lord, hear us.'],
    ['concludingPrayer', 'Almighty God, hear us.'],
  ] as [SectionId, string][])('%s', async (section, text) => {
    renderOffice();
    await addSection(section, text);
    expect(await screen.findByText(text.split('\n')[0], { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(`^Edit the ${SECTION_META[section].label.toLowerCase()}`, 'i') }))
      .toBeInTheDocument();
  });

  it('marks what is shown as the reader’s own', async () => {
    renderOffice();
    await addSection('responsory', 'V. Mine.');
    expect(screen.getByText('Yours')).toBeInTheDocument();
  });

  it('says in words what the material repeats on', async () => {
    renderOffice();
    await addSection('responsory', 'V. Mine.');
    expect(screen.getByText('Psalter IV · Tuesday')).toBeInTheDocument();
    expect(screen.getByText(/Repeats every four weeks/)).toBeInTheDocument();
  });

  it('announces the save politely', async () => {
    renderOffice();
    await addSection('responsory', 'V. Mine.');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/Responsory saved for Morning Prayer/);
  });
});

describe('3: material persists across a fresh store', () => {
  it('is still there after the store is reinitialised', async () => {
    const { unmount } = renderOffice();
    await addSection('reading', 'A reading that must survive.');
    unmount();

    reloadFromStorage();
    renderOffice();
    expect(screen.getByText('A reading that must survive.')).toBeInTheDocument();
  });

  it('writes it under the integrated key', async () => {
    renderOffice();
    await addSection('reading', 'Stored here.');
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('Stored here.');
  });
});

describe('4 and 5: sections are independent of one another', () => {
  async function addAllFour() {
    renderOffice();
    await addSection('reading', 'The reading.');
    await addSection('responsory', 'The responsory.');
    await addSection('intercessions', 'The intercessions.');
    await addSection('concludingPrayer', 'The prayer.');
  }

  it('edits one without touching the other three', async () => {
    await addAllFour();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    await user.type(box, 'A rewritten responsory.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('A rewritten responsory.')).toBeInTheDocument();
    expect(screen.getByText('The reading.')).toBeInTheDocument();
    expect(screen.getByText('The intercessions.')).toBeInTheDocument();
    expect(screen.getByText('The prayer.')).toBeInTheDocument();
  });

  it('deletes one and keeps the rest', async () => {
    await addAllFour();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the intercessions/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));

    expect(screen.queryByText('The intercessions.')).not.toBeInTheDocument();
    expect(screen.getByText('The reading.')).toBeInTheDocument();
    expect(screen.getByText('The responsory.')).toBeInTheDocument();
    expect(screen.getByText('The prayer.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Intercessions deleted/);
  });

  it('keeps a record whose every section has been cleared, and flags it', async () => {
    renderOffice();
    await addSection('responsory', 'The only section.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));

    const entries = getState().file.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].needsReview).toBe(true);
    expect(entries[0].reviewNote).toContain('kept rather than discarded');
  });
});

describe('6: editing works on the record that produced what is shown', () => {
  it('does not create a second, more specific record', async () => {
    renderOffice();
    await addSection('responsory', 'First wording.');
    const idBefore = getState().file.entries[0].id;

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    await user.type(box, 'Second wording.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const entries = getState().file.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(idBefore);
    expect(entries[0].keyType).toBe('psalter');
    expect(entries[0].responsory).toBe('Second wording.');
  });

  it('shows the scope as fixed until the reader chooses to change it', async () => {
    renderOffice();
    await addSection('responsory', 'Mine.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));

    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.queryByLabelText('This applies to')).not.toBeInTheDocument();
    // Stated exactly once, in the "Saving as" summary — not twice over.
    expect(sheet.getAllByText('Psalter IV · Tuesday')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Change what this applies to/ }));
    expect(within(screen.getByRole('dialog')).getByLabelText('This applies to')).toBeInTheDocument();
  });
});

describe('7: partial overrides still resolve independently', () => {
  it('takes each section from the most specific record that has it', async () => {
    renderOffice();
    await addSection('reading', 'Psalter reading.');
    await addSection('responsory', 'Psalter responsory.');

    // Now add intercessions keyed to this exact date only.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Add the intercessions/i }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('This applies to'), 'date');
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Intercessions'), 'Exact-date intercessions.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Psalter reading.')).toBeInTheDocument();
    expect(screen.getByText('Psalter responsory.')).toBeInTheDocument();
    expect(screen.getByText('Exact-date intercessions.')).toBeInTheDocument();
    expect(screen.getByText(/Exact date · 15 June 2027/)).toBeInTheDocument();
  });

  it('explains an override without deleting what it overrode', async () => {
    renderOffice();
    await addSection('responsory', 'Psalter responsory.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    await user.click(screen.getByRole('button', { name: /^Change what this applies to/ }));
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('This applies to'), 'date');
    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    await user.type(box, 'Exact-date responsory.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Exact-date responsory.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been deleted/)).toBeInTheDocument();
    expect(getState().file.entries).toHaveLength(2);
  });
});

describe('13: a storage failure is reported, not celebrated', () => {
  it('shows the error and does not announce a save', async () => {
    renderOffice();
    /* Only the real key fails, so the availability probe still succeeds —
       which is what running out of room actually looks like. */
    const real = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage, key: string, value: string,
    ) {
      if (key === STORAGE_KEY) {
        const error = new Error('full');
        error.name = 'QuotaExceededError';
        throw error;
      }
      real.call(this, key, value);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Add the responsory/i }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Responsory'), 'Will not fit.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    setItem.mockRestore();

    // Reported both inside the sheet and on the office behind it.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.map((a) => a.textContent).join(' ')).toMatch(/run out of space/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/saved/i);
    // The sheet stays open, with the reader's words still in it.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByLabelText('Responsory')).toHaveValue('Will not fit.');
  });
});

describe('14: Strict Mode does not write on its own', () => {
  it('writes nothing merely by rendering twice', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <StrictMode>
        <OfficeSections when={TUESDAY} hour="morning" dayTitle={TITLE} />
      </StrictMode>,
    );
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('writes once for one save, under Strict Mode', async () => {
    render(
      <StrictMode>
        <OfficeSections when={TUESDAY} hour="morning" dayTitle={TITLE} />
      </StrictMode>,
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await addSection('responsory', 'Once only.');
    const writes = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY);
    expect(writes).toHaveLength(1);
    setItem.mockRestore();
  });
});

describe('the legacy key is never read or written by the interface', () => {
  it('is never touched while adding material', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderOffice();
    await addSection('responsory', 'Mine.');
    for (const [key] of getItem.mock.calls) expect(key).not.toBe(LEGACY_STORAGE_KEY);
    for (const [key] of setItem.mock.calls) expect(key).not.toBe(LEGACY_STORAGE_KEY);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('18: the keyboard gets into the sheet and back out', () => {
  it('returns focus to the control that opened it', async () => {
    renderOffice();
    const user = userEvent.setup();
    const add = screen.getByRole('button', { name: /^Add the responsory/i });
    add.focus();
    await user.click(add);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^Add the responsory/i }),
    );
  });

  it('gives the sheet a dialog role and an accessible name', async () => {
    renderOffice();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Add the responsory/i }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Add the responsory');
  });
});

describe('the live region and the status line are for screen readers only', () => {
  it('uses the reader’s own visually-hidden class, which exists', () => {
    renderOffice();
    expect(screen.getByRole('status')).toHaveClass('sr');
    expect(screen.getByText(/of four sections are not yet added/)).toHaveClass('sr');
  });

  it('never shows the announcement as body text', async () => {
    renderOffice();
    await addSection('responsory', 'Mine.');
    const visible = screen.getAllByText(/Responsory saved for Morning Prayer/);
    for (const node of visible) expect(node).toHaveClass('sr');
  });
});

describe('the scope is stated once, and names itself to a screen reader', () => {
  it('does not repeat the scope when editing', async () => {
    renderOffice();
    await addSection('responsory', 'Mine.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getAllByText(/^Psalter IV · Tuesday$/)).toHaveLength(1);
    expect(sheet.getAllByText(/repeat every four weeks/i)).toHaveLength(1);
  });

  it('names the current scope on the control that changes it', async () => {
    renderOffice();
    await addSection('responsory', 'Mine.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Edit the responsory/i }));
    expect(screen.getByRole('button', { name: /^Change what this applies to/ }))
      .toHaveAccessibleName('Change what this applies to. Currently Psalter IV · Tuesday.');
  });

  it('states it once when adding, too', async () => {
    renderOffice();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Add the responsory/i }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getAllByText(/repeat every four weeks/i)).toHaveLength(1);
  });
});

describe('R35: material is shown only where the calendar puts it', () => {
  it('shows nothing when the page is a psalter office opened for reference', () => {
    render(
      <OfficeSections
        when={TUESDAY} hour="morning" dayTitle={TITLE} boundToCalendar={false}
      />,
    );
    expect(screen.queryByText('Not yet added — tap to add it')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add the/i })).not.toBeInTheDocument();
    expect(screen.getByText(/belong to a date in the calendar/)).toBeInTheDocument();
  });

  it('does not show stored material on such a page either', async () => {
    const { unmount } = renderOffice();
    await addSection('responsory', 'Today’s responsory.');
    unmount();

    render(
      <OfficeSections
        when={TUESDAY} hour="morning" dayTitle={TITLE} boundToCalendar={false}
      />,
    );
    expect(screen.queryByText('Today’s responsory.')).not.toBeInTheDocument();
  });

  it('offers a way back to the office the calendar does appoint', async () => {
    const onOpenToday = vi.fn();
    render(
      <OfficeSections
        when={TUESDAY} hour="morning" dayTitle={TITLE}
        boundToCalendar={false} onOpenToday={onOpenToday}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Open today/ }));
    expect(onOpenToday).toHaveBeenCalledTimes(1);
  });

  it('shows everything as usual when the page is today’s office', async () => {
    renderOffice({ boundToCalendar: true });
    expect(screen.getAllByText('Not yet added — tap to add it')).toHaveLength(4);
  });
});

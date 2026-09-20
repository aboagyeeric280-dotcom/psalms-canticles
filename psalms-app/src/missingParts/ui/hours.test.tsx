import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OfficeSections from './OfficeSections';
import { reloadFromStorage, getState, saveSection } from '../state/store';
import { missingPartsDayFor } from '../adapter/day';
import { HOUR_META, HOURS, type Hour } from '../data/types';
import { keyTypesFor } from './KeyScopeChooser';

const SATURDAY = new Date(2027, 11, 24);   // Christmas Eve
const TUESDAY = new Date(2027, 5, 15);

beforeEach(() => {
  window.localStorage.clear();
  reloadFromStorage();
});

/* Adds a responsory for one hour and then takes the tree down again, so the
   next render starts from an empty document rather than finding this one. */
async function add(hour: Hour, when: Date, text: string) {
  const view = render(<OfficeSections when={when} hour={hour} dayTitle="The day" />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Add the responsory/i }));
  await user.type(within(screen.getByRole('dialog')).getByLabelText('Responsory'), text);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  view.unmount();
}

describe('9: First Vespers is separate from Evening Prayer', () => {
  it('belongs to the day that is coming', () => {
    const day = missingPartsDayFor(SATURDAY, 'evening-before');
    expect(day.date).toBe('2027-12-25');
    expect(day.celebrations.map((c) => c.id)).toContain('christmas');
  });

  it('does not show Evening Prayer material', async () => {
    await add('evening', TUESDAY, 'Ordinary Evening Prayer.');
    const { unmount } = render(
      <OfficeSections when={TUESDAY} hour="evening-before" dayTitle="The day" />,
    );
    expect(screen.queryByText('Ordinary Evening Prayer.')).not.toBeInTheDocument();
    unmount();
  });

  it('keeps its own material to itself', async () => {
    await add('evening-before', SATURDAY, 'First Vespers of Christmas.');
    const entry = getState().file.entries[0];
    expect(entry.hour).toBe('evening-before');

    const { unmount } = render(
      <OfficeSections when={SATURDAY} hour="evening" dayTitle="The day" />,
    );
    expect(screen.queryByText('First Vespers of Christmas.')).not.toBeInTheDocument();
    unmount();

    render(<OfficeSections when={SATURDAY} hour="evening-before" dayTitle="The day" />);
    expect(screen.getByText('First Vespers of Christmas.')).toBeInTheDocument();
  });

  it('names itself as its own hour in the labels', () => {
    render(<OfficeSections when={SATURDAY} hour="evening-before" dayTitle="Christmas" />);
    expect(screen.getByRole('button', { name: /^Add the responsory/i }))
      .toHaveAccessibleName(/First Vespers, the evening before/);
  });
});

describe('10: Compline maps to the night hour', () => {
  it('stores and shows material under `night`', async () => {
    await add('night', TUESDAY, 'Into thy hands.');
    expect(getState().file.entries[0].hour).toBe('night');
    render(<OfficeSections when={TUESDAY} hour="night" dayTitle="The day" />);
    expect(screen.getByText('Into thy hands.')).toBeInTheDocument();
  });

  it('describes itself as Compline', () => {
    expect(HOUR_META.night.description).toBe('Compline');
    render(<OfficeSections when={TUESDAY} hour="night" dayTitle="The day" />);
    expect(screen.getByRole('button', { name: /^Add the responsory/i }))
      .toHaveAccessibleName(/Compline/);
  });

  it('is kept apart from Evening Prayer', async () => {
    await add('night', TUESDAY, 'Night material.');
    const { unmount } = render(
      <OfficeSections when={TUESDAY} hour="evening" dayTitle="The day" />,
    );
    expect(screen.queryByText('Night material.')).not.toBeInTheDocument();
    unmount();
  });
});

describe('11: the Office of Readings is not offered an editor', () => {
  it('is not one of the hours this feature supports', () => {
    expect(HOURS).toEqual(['morning', 'midday', 'evening', 'evening-before', 'night']);
    expect(HOURS).not.toContain('readings');
  });

  it('has no missing-parts hour it could be stored under', () => {
    // A record keyed to 'readings' is not expressible: the type has no such
    // member, and nothing in the interface offers one.
    expect(Object.keys(HOUR_META)).not.toContain('readings');
  });
});

describe('12: an optional memorial is offered only when it is kept', () => {
  const HILARY = new Date(2027, 0, 13);
  const NAME = 'St Hilary, Bishop and Doctor';

  it('offers no celebration key while the weekday is kept', () => {
    const day = missingPartsDayFor(HILARY, 'morning', {});
    expect(day.celebrations).toHaveLength(0);
    expect(keyTypesFor(day)).not.toContain('celebration');
  });

  it('offers it once the reader has elected the memorial', () => {
    const day = missingPartsDayFor(HILARY, 'morning', { '2027-01-13': NAME });
    expect(day.celebrations.map((c) => c.id)).toContain('saint-hilary');
    expect(keyTypesFor(day)).toContain('celebration');
  });

  it('shows material keyed to it only when it is elected', () => {
    saveSection(
      { keyType: 'celebration', hour: 'morning', celebrationId: 'saint-hilary', celebrationName: NAME },
      'responsory',
      { responsory: 'For Saint Hilary.' },
    );

    const { unmount } = render(
      <OfficeSections when={HILARY} hour="morning" dayTitle="Wednesday" observed={{}} />,
    );
    expect(screen.queryByText('For Saint Hilary.')).not.toBeInTheDocument();
    unmount();

    render(
      <OfficeSections
        when={HILARY} hour="morning" dayTitle="Saint Hilary"
        observed={{ '2027-01-13': NAME }}
      />,
    );
    expect(screen.getByText('For Saint Hilary.')).toBeInTheDocument();
  });
});

describe('the key chooser offers only what the day can carry', () => {
  it('offers no week key in the Triduum', () => {
    const day = missingPartsDayFor(new Date(2027, 2, 25), 'morning');
    expect(day.season).toBe('triduum');
    expect(keyTypesFor(day)).not.toContain('week');
  });

  it('offers a week key in Holy Week, which recurs', () => {
    const day = missingPartsDayFor(new Date(2027, 2, 23), 'morning');
    expect(day.season).toBe('holyweek');
    expect(keyTypesFor(day)).toContain('week');
  });

  it('always offers psalter and exact date', () => {
    for (const when of [TUESDAY, SATURDAY, new Date(2027, 2, 25)]) {
      const types = keyTypesFor(missingPartsDayFor(when, 'morning'));
      expect(types).toContain('psalter');
      expect(types).toContain('date');
    }
  });
});

describe('8: exact text survives add, reload and edit', () => {
  const AWKWARD = '  V.  Line one.\n\n  R.  Line two.   ';

  it('is byte-identical after a save, a reload and a second save', async () => {
    render(<OfficeSections when={TUESDAY} hour="morning" dayTitle="The day" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Add the responsory/i }));
    const box = within(screen.getByRole('dialog')).getByLabelText('Responsory');
    await user.clear(box);
    // paste, not type: typing would interpret the leading spaces as keystrokes
    // but either way the value must be stored exactly as the box holds it.
    await user.click(box);
    await user.paste(AWKWARD);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(getState().file.entries[0].responsory).toBe(AWKWARD);

    reloadFromStorage();
    expect(getState().file.entries[0].responsory).toBe(AWKWARD);

    const { unmount } = render(
      <OfficeSections when={TUESDAY} hour="morning" dayTitle="The day" />,
    );
    const edit = screen.getAllByRole('button', { name: /^Edit the responsory/i })[0];
    await user.click(edit);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Responsory')).toHaveValue(AWKWARD);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(getState().file.entries[0].responsory).toBe(AWKWARD);
    unmount();
  });
});

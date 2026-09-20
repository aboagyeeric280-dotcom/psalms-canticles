import { expect, test, type Page } from '@playwright/test';

/* Seed the reader's own material directly, so these checks are about the
   three screens rather than about re-typing four sections each time. */
const ENTRIES = [
  {
    id: 'lib-1', keyType: 'psalter', hour: 'morning', season: 'ordinary',
    psalterWeek: 1, weekday: 1,
    reference: 'Romans 13:11', readingText: 'It is now the hour, with lamps.',
    translation: 'Douay-Rheims', responsory: 'V. A responsory.', intercessions: '',
    concludingPrayer: '', createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
  },
  {
    id: 'lib-2', keyType: 'psalter', hour: 'morning', season: 'ordinary',
    psalterWeek: 1, weekday: 1,
    reference: '', readingText: '', translation: '',
    responsory: 'V. A different responsory.', intercessions: '', concludingPrayer: '',
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-02T00:00:00.000Z',
  },
  {
    id: 'lib-3', keyType: 'week', hour: 'evening', season: 'advent', weekOfSeason: 2,
    reference: '', readingText: '', translation: '', responsory: '', intercessions: '',
    concludingPrayer: 'A prayer for Advent.', needsReview: true,
    reviewNote: 'Read in from an older version; please check the wording.',
    createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
  },
  {
    id: 'lib-4', keyType: 'celebration', hour: 'morning',
    celebrationId: 'saint-nobody', celebrationName: 'Saint Nobody',
    reference: '', readingText: '', translation: '',
    responsory: 'For a saint this calendar does not carry.', intercessions: '',
    concludingPrayer: '', createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
  },
];

async function seeded(page: Page, route = '#/missing') {
  await page.addInitScript((entries) => {
    try {
      localStorage.setItem('dpc.missing-parts.v1', JSON.stringify({
        schemaVersion: 4, entries, meta: { createdAt: 'x' },
      }));
    } catch { /* private mode */ }
  }, ENTRIES);
  await page.goto(`./${route}`);
}

test('1: all three routes render', async ({ page }) => {
  await seeded(page, '#/missing');
  await expect(page.getByRole('search', { name: 'Search your own material' })).toBeVisible();

  await page.goto('./#/missing/progress');
  await expect(page.getByRole('table')).toBeVisible();

  await page.goto('./#/missing/review');
  await expect(page.getByText(/wants a human eye/)).toBeVisible();
});

test('2: the sidebar reaches the personal material area', async ({ page }, info) => {
  await page.goto('./#/');
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Sections' }).click();
  }
  await page.getByRole('button', { name: 'Your own material' }).click();
  await expect(page).toHaveURL(/#\/missing$/);
  await expect(page.getByRole('search', { name: 'Search your own material' })).toBeVisible();
});

test('local navigation moves between the three screens', async ({ page }) => {
  await seeded(page);
  const tabs = page.getByRole('navigation', { name: 'Your own material' });
  await tabs.getByRole('button', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/#\/missing\/progress$/);
  await tabs.getByRole('button', { name: 'Review' }).click();
  await expect(page).toHaveURL(/#\/missing\/review$/);
  await expect(tabs.getByRole('button', { name: 'Review' })).toHaveAttribute('aria-current', 'page');
});

test('3 and 4: the Library lists and searches personal material', async ({ page }) => {
  await seeded(page);
  await expect(page.getByText('4 records.')).toBeVisible();
  await page.getByLabel('Search your material').fill('lamps');
  await expect(page.getByText('1 of 4 records.')).toBeVisible();
});

test('6: filters narrow together', async ({ page }) => {
  await seeded(page);
  await page.getByLabel('Hour', { exact: true }).selectOption('evening');
  await expect(page.getByText('1 of 4 records.')).toBeVisible();
  await page.getByLabel('Review', { exact: true }).selectOption('settled');
  await expect(page.getByText('0 of 4 records.')).toBeVisible();
});

test('5: personal wording stays out of the book search', async ({ page }) => {
  await seeded(page);
  await page.locator('button.hdr__search, button.hdr__find').locator('visible=true').first().click();
  const box = page.locator('input.search__input');
  await box.fill('lamps');
  await page.waitForTimeout(500);
  await expect(page.locator('.searchpane').getByText('It is now the hour, with lamps.'))
    .toHaveCount(0);
});

test('10: Progress shows 28 slots', async ({ page }) => {
  await seeded(page, '#/missing/progress');
  await expect(page.getByRole('button', { name: /^Psalter week/ })).toHaveCount(28);
  await expect(page.getByText('0 of 28')).toBeVisible();
});

test('11 and 12: only direct psalter entries fill a slot', async ({ page }) => {
  await seeded(page, '#/missing/progress');
  await page.getByLabel('Season', { exact: true }).selectOption('ordinary');
  await page.getByLabel('Hour', { exact: true }).selectOption('morning');
  // lib-1 and lib-2 are both Psalter I Monday: reading + responsory between them.
  await expect(page.getByRole('button', {
    name: /^Psalter week I, Monday, Morning Prayer: 2 of 4 sections stored/,
  })).toBeVisible();
  // The Advent week entry and the celebration entry fill nothing.
  await expect(page.getByRole('button', { name: /0 of 4 sections stored/ })).toHaveCount(27);
});

test('16: Review lists every kind of trouble', async ({ page }) => {
  await seeded(page, '#/missing/review');
  await expect(page.getByText(/records to look at/)).toBeVisible();
  await expect(page.getByText(/Another record has the same key/).first()).toBeVisible();
  await expect(page.getByText(/This calendar does not know the celebration/)).toBeVisible();
  await expect(page.getByText(/Flagged when it was read in|please check the wording/i).first())
    .toBeVisible();
});

test('18: conflicting wording is shown side by side', async ({ page }) => {
  await seeded(page, '#/missing/review');
  await expect(page.getByText('V. A responsory.').first()).toBeVisible();
  await expect(page.getByText('V. A different responsory.').first()).toBeVisible();
  await expect(page.getByText(/nothing here has been merged or chosen/i).first()).toBeVisible();
});

test('the editor Sheet opens from the Library and returns focus', async ({ page }) => {
  await seeded(page);
  const edit = page.getByRole('button', { name: /^Edit the responsory/ }).first();
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(edit).toBeFocused();
});

test('the editor Sheet opens from Progress and from Review', async ({ page }) => {
  await seeded(page, '#/missing/progress');
  await page.getByRole('button', { name: /^Psalter week I, Monday/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('./#/missing/review');
  await page.getByRole('button', { name: /^Edit the / }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('25: no horizontal overflow at 375px on any of the three', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'width-specific');
  for (const route of ['#/missing', '#/missing/progress', '#/missing/review']) {
    await seeded(page, route);
    /* Measure the settled layout. The app animates every page in, and during
       that transition the shell is briefly offset — on the book's own pages
       as much as on these — so measuring the first frame would be measuring
       the animation rather than the layout. */
    await expect(page.getByRole('navigation', { name: 'Your own material' })).toBeVisible();
    await page.waitForTimeout(400);
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll, route).toBeLessThanOrEqual(size.client + 1);
  }
});

test('a single-section editor shows Save without scrolling on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'height-specific');
  /* The sheet has always scrolled, so Save was never unreachable. But on a
     phone the ten-row box used to push it past the fold, and the one control
     a reader is looking for should be in front of them. */
  await seeded(page, '#/missing/progress');
  await page.getByRole('button', { name: /^Psalter week I, Monday/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const save = await page.getByRole('button', { name: 'Save' }).boundingBox();
  const height = page.viewportSize()!.height;
  expect(save).not.toBeNull();
  expect(save!.y + save!.height).toBeLessThanOrEqual(height);
});

test('24: every control on the three screens clears 44px', async ({ page }) => {
  for (const route of ['#/missing', '#/missing/progress', '#/missing/review']) {
    await seeded(page, route);
    for (const control of await page.locator('.mp-page button, .mp-page select, .mp-page input').all()) {
      const box = await control.boundingBox();
      if (!box) continue;
      expect(box.height, route).toBeGreaterThanOrEqual(43.5);
    }
  }
});

test('23: all three screens reopen with no network', async ({ page, context }) => {
  await seeded(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole('search', { name: 'Search your own material' })).toBeVisible();
  await expect(page.getByText('4 records.')).toBeVisible();

  await page.goto('./#/missing/progress');
  await expect(page.getByRole('table')).toBeVisible();

  await page.goto('./#/missing/review');
  await expect(page.getByText(/records to look at/)).toBeVisible();

  await context.setOffline(false);
});

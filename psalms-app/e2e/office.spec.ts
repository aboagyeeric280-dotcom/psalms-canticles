import { expect, test, type Page } from '@playwright/test';

/* The office the reader lands on is whatever today is, so the tests navigate
   by hash to a known psalter office instead: Week I, Tuesday, Morning. */
const OFFICE = '#/office/w1-tue-morning';

async function openOffice(page: Page) {
  await page.goto(`./${OFFICE}`);
  await page.getByRole('heading', { name: 'Your own material' }).scrollIntoViewIfNeeded();
}

async function addSection(page: Page, addLabel: RegExp, fieldLabel: string, text: string) {
  await page.getByRole('button', { name: addLabel }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(fieldLabel, { exact: true }).fill(text);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test('19: the office has no horizontal overflow at 375px', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'width-specific');
  await openOffice(page);
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
});

test('the four sections render, empty, inside the office', async ({ page }) => {
  await openOffice(page);
  await expect(page.getByText('Not yet added — tap to add it')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Short reading' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Concluding prayer' })).toBeVisible();
});

test('the surrounding office is untouched', async ({ page }) => {
  await openOffice(page);
  // The book's own text, the shape of the hour and the links all still there.
  await expect(page.getByRole('button', { name: /After the psalmody/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Morning Prayer/ }).first()).toBeVisible();
  await expect(page.locator('.reader')).toBeVisible();
});

test('adding a section shows it at once and it survives a reload', async ({ page }) => {
  await openOffice(page);
  await addSection(page, /^Add the responsory/i, 'Responsory', 'V. In the morning.\nR. In the morning.');
  await expect(page.getByText('V. In the morning.')).toBeVisible();
  await expect(page.getByText('Yours')).toBeVisible();

  await page.reload();
  await expect(page.getByText('V. In the morning.')).toBeVisible();
});

test('20: saved material survives the app being closed and reopened', async ({ page }) => {
  await openOffice(page);
  await addSection(page, /^Add the intercessions/i, 'Intercessions', 'For the Church: Lord, hear us.');
  await expect(page.getByText('For the Church: Lord, hear us.')).toBeVisible();

  // The whole build is taken into the cache, so there is something to reopen.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return (await cache.keys()).length;
  });
  expect(cached).toBeGreaterThan(30);

  // Reopened from scratch, the reader's own material is still there.
  await page.reload();
  await expect(page.getByText('For the Church: Lord, hear us.')).toBeVisible();
});

/* KNOWN DEFECT, reported and awaiting approval to fix.
 *
 * The service worker matches the cache without `ignoreVary`, so a host that
 * sends `Vary: Origin` makes every precached asset invisible to the module
 * script requests the page makes — which are CORS-mode and therefore carry an
 * Origin header the service worker's own precache fetch did not.
 *
 * Confirmed by serving the same dist twice: with `Vary: Origin` (vite
 * preview) the offline reload fails four asset requests and renders nothing;
 * without it, the same build reopens offline perfectly.
 *
 * The fix is one option bag on two cache.match calls in public/sw.js, which
 * Phase 4 is not permitted to touch. Marked as an expected failure so that it
 * is reported the moment it starts passing rather than quietly forgotten.
 */
test('offline reopening is broken by Vary: Origin (known service-worker defect)', async ({ page, context }) => {
  test.fail();
  await openOffice(page);
  await addSection(page, /^Add the responsory/i, 'Responsory', 'Offline responsory.');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your own material' })).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText('Offline responsory.')).toBeVisible();
  await context.setOffline(false);
});

test('18: the keyboard reaches the sheet and comes back', async ({ page }) => {
  await openOffice(page);
  const add = page.getByRole('button', { name: /^Add the responsory/i });
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(add).toBeFocused();
});

test('every control clears a 44px touch target', async ({ page }) => {
  await openOffice(page);
  for (const button of await page.locator('.mp-office button').all()) {
    const box = await button.boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
});

test('16: the search index still finds the book, and not personal text', async ({ page }) => {
  await openOffice(page);
  await addSection(page, /^Add the responsory/i, 'Responsory', 'Zzzqqx a word found nowhere in the book.');
  // The header shows one of two search controls depending on width.
  await page.locator('button.hdr__search, button.hdr__find').locator('visible=true').first().click();
  const box = page.locator('input.search__input');
  await expect(box).toBeVisible();

  /* Scoped to the search pane: the office behind it of course still shows
     the reader's own words — the point is that the INDEX does not carry
     them, so they never come back as a result. */
  const pane = page.locator('.searchpane');
  await box.fill('Zzzqqx');
  await page.waitForTimeout(500);
  // The query itself is echoed in the pane; the reader's SENTENCE is not,
  // because it was never indexed.
  await expect(pane.getByText('a word found nowhere in the book', { exact: false })).toHaveCount(0);

  // The book itself is still searchable, exactly as before.
  await box.fill('shepherd');
  await page.waitForTimeout(500);
  await expect(pane).toContainText(/psalm/i);
});

test('17: the published weekly prayers page is unchanged', async ({ page }) => {
  await page.goto('./#/prayers');
  await expect(page.getByRole('heading', { name: 'Weekly Prayers' }).first()).toBeVisible();
  await expect(page.locator('body')).toContainText('collects for the weeks of the year');
  // No claim is made about which of them belongs to today.
  await expect(page.locator('body')).not.toContainText(/this week.s prayer/i);
});

test('the Office of Readings offers no editor', async ({ page }) => {
  await page.goto('./#/readings/read-w1-tue');
  await expect(page.getByRole('heading', { name: 'Your own material' })).toHaveCount(0);
  await expect(page.getByText('Not yet added — tap to add it')).toHaveCount(0);
});

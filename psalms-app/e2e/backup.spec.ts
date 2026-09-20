import { expect, test, type Page } from '@playwright/test';

/* The backup and transfer screen, driven the way a reader drives it.
 *
 * The engine's guarantees are proved in the unit suites; what these check is
 * the seam — that the gates are actually wired to the buttons, that the
 * legacy key survives the whole journey, and that none of it needs a network.
 */

const LEGACY_KEY = 'the-missing-parts-entries-v1';
const STORE_KEY = 'dpc.missing-parts.v1';

const LEGACY = JSON.stringify({
  schemaVersion: 3,
  entries: [
    {
      id: 'l1', keyType: 'psalter', hour: 'morning',
      season: 'ordinary', psalterWeek: 1, weekday: 1,
      reference: 'Romans 13:11', readingText: 'It is now the hour.  ',
      translation: 'Douay-Rheims', responsory: 'V. From the older app.',
    },
    {
      id: 'l2', keyType: 'psalter', hour: 'evening',
      season: 'ordinary', psalterWeek: 2, weekday: 3,
      concludingPrayer: 'A prayer from the older app.',
    },
  ],
});

/** Something the reader has already written, on the same key as l1. */
const MINE = {
  id: 'mine', keyType: 'psalter', hour: 'morning', season: 'ordinary',
  psalterWeek: 1, weekday: 1,
  reference: 'My reference', readingText: 'My own wording, which must stand.',
  translation: '', responsory: '', intercessions: '', concludingPrayer: '',
  createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z',
};

async function open(page: Page, opts: { legacy?: boolean; mine?: boolean } = {}) {
  await page.addInitScript(([legacy, mine, legacyKey, storeKey, raw, entry]) => {
    try {
      if (legacy) localStorage.setItem(legacyKey as string, raw as string);
      if (mine) {
        localStorage.setItem(storeKey as string, JSON.stringify({
          schemaVersion: 4, entries: [entry], meta: { createdAt: 'x' },
        }));
      }
    } catch { /* private mode */ }
  }, [opts.legacy ?? false, opts.mine ?? false, LEGACY_KEY, STORE_KEY, LEGACY, MINE]);
  await page.goto('./#/missing/backup');
  await expect(page.getByRole('heading', { name: 'Material from the older app' })).toBeVisible();
}

/** Downloads are real files; catch one without writing it anywhere. */
async function takeBackup(page: Page) {
  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download a backup first/ }).click();
  return wait;
}

const legacyRaw = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY);

test('1: the screen is reachable and offers an export', async ({ page }) => {
  await open(page, { mine: true });
  await expect(page.getByRole('button', { name: /^Export 1 record$/ })).toBeVisible();
});

test('2: it finds legacy material and says what migrating would do', async ({ page }) => {
  await open(page, { legacy: true });
  const totals = page.getByRole('definition');
  await expect(page.getByText(/Found on this device/)).toBeVisible();
  await expect(totals.first()).toHaveText('2');            // records found
  await expect(page.getByLabel('What migrating would do')).toBeVisible();
});

test('3: opening and previewing write nothing', async ({ page }) => {
  await open(page, { legacy: true, mine: true });
  const after = await page.evaluate(([legacyKey, storeKey]) => ({
    legacy: localStorage.getItem(legacyKey),
    store: localStorage.getItem(storeKey),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('dpc.missing-parts')),
  }), [LEGACY_KEY, STORE_KEY]);

  expect(after.legacy).toBe(LEGACY);
  // No receipt, no snapshot, no in-progress marker: only the store itself.
  expect(after.keys.sort()).toEqual([STORE_KEY]);
});

test('4: migration is refused until a backup is taken and the box is ticked', async ({ page }) => {
  await open(page, { legacy: true });
  const go = page.getByRole('button', { name: 'Bring it across' });
  await expect(go).toBeDisabled();

  await page.getByRole('checkbox').check();
  await expect(go).toBeDisabled();                          // ticked, but no backup

  await takeBackup(page);
  await expect(go).toBeEnabled();

  await page.getByRole('checkbox').uncheck();               // and it re-locks
  await expect(go).toBeDisabled();
});

test('5: the backup is the legacy bytes, verbatim', async ({ page }) => {
  await open(page, { legacy: true });
  const download = await takeBackup(page);
  const stream = await download.createReadStream();
  const text = await new Promise<string>((resolve, reject) => {
    let out = '';
    stream.on('data', (chunk) => { out += chunk; });
    stream.on('end', () => resolve(out));
    stream.on('error', reject);
  });
  expect(text).toBe(LEGACY);
});

test('6: migrating merges, keeps the reader’s wording, and reports', async ({ page }) => {
  await open(page, { legacy: true, mine: true });
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();

  await expect(page.getByText(/Brought across:/)).toBeVisible();

  const entries = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { entries: Record<string, string>[] }).entries : [];
  }, STORE_KEY);

  const mine = entries.find((e) => e.id === 'mine')!;
  expect(mine.readingText).toBe('My own wording, which must stand.');   // existing wins
  expect(mine.responsory).toBe('V. From the older app.');               // empty one filled
  expect(entries.some((e) => e.id === 'l2')).toBe(true);                // the other arrived
});

test('7: the legacy key survives the whole journey untouched', async ({ page }) => {
  await open(page, { legacy: true, mine: true });
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await expect(page.getByText(/Brought across:/)).toBeVisible();

  expect(await legacyRaw(page)).toBe(LEGACY);
});

test('8: the result links to Review', async ({ page }) => {
  await open(page, { legacy: true });
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await page.getByRole('button', { name: 'Go to Review' }).click();
  await expect(page).toHaveURL(/#\/missing\/review$/);
});

test('9: a second run changes nothing', async ({ page }) => {
  await open(page, { legacy: true });
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await expect(page.getByText(/Brought across:/)).toBeVisible();
  const first = await page.evaluate((key) => localStorage.getItem(key), STORE_KEY);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Material from the older app' })).toBeVisible();
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await expect(page.getByText(/Brought across:/)).toBeVisible();

  const second = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { entries: unknown[] }).entries.length : 0;
  }, STORE_KEY);
  expect(second).toBe(JSON.parse(first!).entries.length);
});

test('10: with nothing to find, a file can be chosen by hand', async ({ page }) => {
  await open(page);
  await expect(page.getByText(/Nothing from the older Missing Parts app was found/)).toBeVisible();

  await page.setInputFiles('input[type=file]', {
    name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(LEGACY),
  });
  await expect(page.getByText(/Read from the file you chose/)).toBeVisible();
  await expect(page.getByRole('definition').first()).toHaveText('2');
  // Reading a file does not park it under the legacy key.
  expect(await legacyRaw(page)).toBeNull();
});

test('11: an unreadable file is blocked, not migrated', async ({ page }) => {
  await open(page);
  await page.setInputFiles('input[type=file]', {
    name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ not json'),
  });
  await expect(page.getByRole('alert')).toContainText(/could not be read/i);
  await expect(page.getByRole('button', { name: 'Bring it across' })).toHaveCount(0);
});

test('12: a schema from the future is blocked, not migrated', async ({ page }) => {
  await open(page);
  await page.setInputFiles('input[type=file]', {
    name: 'future.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 99, entries: [] })),
  });
  await expect(page.getByRole('alert')).toContainText(/newer version/i);
  await expect(page.getByRole('button', { name: 'Bring it across' })).toHaveCount(0);
});

test('13: the whole screen works with no network', async ({ page, context }) => {
  await open(page, { legacy: true });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null,
    null, { timeout: 20_000 });
  await context.setOffline(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Material from the older app' })).toBeVisible();
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await expect(page.getByText(/Brought across:/)).toBeVisible();

  await context.setOffline(false);
});

test('14: the book’s own search is unchanged by any of it', async ({ page }) => {
  await open(page, { legacy: true });
  await takeBackup(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bring it across' }).click();
  await expect(page.getByText(/Brought across:/)).toBeVisible();

  await page.locator('button.hdr__search, button.hdr__find').locator('visible=true')
    .first().click();
  const box = page.locator('input.search__input');
  await expect(box).toBeVisible();
  const pane = page.locator('.searchpane');

  // Material brought across is not in the book, so the book cannot find it.
  await box.fill('From the older app');
  await page.waitForTimeout(500);
  await expect(pane.getByText('From the older app', { exact: false })).toHaveCount(0);

  // The book itself is still searchable, exactly as before.
  await box.fill('shepherd');
  await page.waitForTimeout(500);
  await expect(pane).toContainText(/psalm/i);
});

test('15: no horizontal overflow at 375px', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'width-specific');
  await open(page, { legacy: true });
  await page.waitForTimeout(400);
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
});

test('16: every control clears a 44px touch target', async ({ page }) => {
  await open(page, { legacy: true });
  for (const control of await page.locator('.mp-page button, .mp-page label.mp-confirm').all()) {
    const box = await control.boundingBox();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
});

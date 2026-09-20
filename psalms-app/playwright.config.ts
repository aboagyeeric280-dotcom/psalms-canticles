/* Browser checks for the reader's own material.
 *
 * Runs against the PRODUCTION build, served statically, so what is exercised
 * is the same bundle and the same service worker the friars would install —
 * not a dev server with different module graph and no offline story.
 */
import { defineConfig, devices } from '@playwright/test';

/* Where to find Chromium.
 *
 * Left to Playwright by default, which is what a contributor with a normal
 * `npx playwright install` wants. Machines that already ship a browser — CI
 * images, and this project's own sandbox — set PLAYWRIGHT_EXECUTABLE_PATH to
 * it instead of downloading a second copy. No path is hard-coded here: one
 * machine's layout is nobody else's. */
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'off',
    /* The app honours prefers-reduced-motion by disabling its animations.
       Asking for it here removes the sheet's rise from the equation, which
       is both steadier to drive and the path a reader with that preference
       actually takes. */
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        launchOptions,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
      },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

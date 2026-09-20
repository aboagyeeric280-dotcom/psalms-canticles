/* Browser checks for the reader's own material.
 *
 * Runs against the PRODUCTION build, served statically, so what is exercised
 * is the same bundle and the same service worker the friars would install —
 * not a dev server with different module graph and no offline story.
 */
import { defineConfig, devices } from '@playwright/test';

/* This machine ships Chromium already; the pinned Playwright expects a
   different build number, so point it at the one that is here rather than
   downloading another copy. */
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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
        launchOptions: { executablePath: CHROMIUM },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions: { executablePath: CHROMIUM },
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

/* Test configuration for the missing-parts data core.

   Deliberately a separate file from vite.config.ts. The production build's
   `base: './'`, its manual chunking and the service-worker step are what keep
   the app working under /psalms-canticles/ and offline; nothing the test
   runner needs may reach into them. Vitest prefers this file when it is
   present, so the two configurations never meet.                            */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom for the storage tests, which need a real localStorage.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Imports are explicit in every test file; no ambient globals.
    globals: false,
    restoreMocks: true,
  },
});

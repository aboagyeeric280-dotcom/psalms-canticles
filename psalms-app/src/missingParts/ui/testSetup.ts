/* Matchers and cleanup for the interface tests. Test support only. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { clearAnnouncement } from './announce';

// Published entries are bundled for production but must not interfere with
// tests that set up their own store state.
vi.mock('../data/publishedEntries.json', () => ({ default: [] }));

afterEach(() => {
  cleanup();
  /* The live region is module state and outlives the tree that wrote to it,
  so one test's "saved" would otherwise be read by the next. */
  clearAnnouncement();
  try { window.localStorage.clear(); } catch { /* nothing to clear */ }
});

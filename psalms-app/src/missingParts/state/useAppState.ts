/* The React binding for the missing-parts store.
 *
 * This is the ONLY module under src/missingParts that may import React. The
 * store, the resolver and the calendar adapter are all headless, so they can
 * be reasoned about and tested without a renderer; a test asserts that this
 * file is the single exception.
 */

import { useSyncExternalStore } from 'react';
import { getState, subscribe, type AppState } from './store';

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

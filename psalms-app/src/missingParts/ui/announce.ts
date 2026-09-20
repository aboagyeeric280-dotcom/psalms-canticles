/* A polite live region, so saving and deleting are heard as well as seen.
 *
 * A module-level store rather than component state: the message outlives the
 * sheet that caused it, and the region that reads it sits at the top of the
 * office, not inside the dialog that has just closed.
 */

import { useSyncExternalStore } from 'react';

let message = '';
let token = 0;
const listeners = new Set<() => void>();
let snapshot = { message, token };

export function announce(next: string): void {
  message = next;
  token += 1;
  snapshot = { message, token };
  for (const listener of listeners) listener();
}

export function clearAnnouncement(): void {
  announce('');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAnnouncement(): { message: string; token: number } {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/* Smooth scrolling is not implemented everywhere — some embedded browsers
   accept `behavior: 'smooth'` and then do nothing at all. Jumping to a psalm
   has to work regardless, so ask for smooth and fall back to an instant jump
   if nothing has moved shortly afterwards. */

const HEADER_OFFSET = 70;   // matches --scroll-margin on .blk

function settle(target: number, started: number) {
  window.setTimeout(() => {
    if (Math.abs(window.scrollY - started) < 2 && Math.abs(target - started) >= 2) {
      window.scrollTo(0, target);
    }
  }, 260);
}

export function scrollToElement(id: string) {
  const el = document.getElementById(id);
  if (el) scrollToNode(el);
}

/** Bring an element under the reader's eye. A heading sits just under the
    header, as the table of contents has always put it; a single line found
    by a search is set a third of the way down instead, so the verses around
    it are on screen with it. */
export function scrollToNode(el: Element, place: 'under-header' | 'in-view' = 'under-header') {
  const started = window.scrollY;
  const offset = place === 'in-view'
    ? Math.max(HEADER_OFFSET, Math.round(window.innerHeight * 0.3))
    : HEADER_OFFSET;
  const target = Math.max(0, el.getBoundingClientRect().top + started - offset);
  window.scrollTo({ top: target, behavior: 'smooth' });
  settle(target, started);
}

export function scrollToTop() {
  const started = window.scrollY;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  settle(0, started);
}

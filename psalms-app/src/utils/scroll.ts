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
  if (!el) return;
  const started = window.scrollY;
  const target = Math.max(0, el.getBoundingClientRect().top + started - HEADER_OFFSET);
  window.scrollTo({ top: target, behavior: 'smooth' });
  settle(target, started);
}

export function scrollToTop() {
  const started = window.scrollY;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  settle(0, started);
}

/* Line icons, drawn to a 24-grid with a 1.7 stroke so they sit quietly
   next to the serif text. */

const base = {
  viewBox: '0 0 24 24',
  // An intrinsic size, so an icon dropped into a flex container without a
  // sizing rule stays 24px instead of stretching to fill it. These are
  // presentation attributes, so any CSS rule still overrides them.
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  // Every icon here sits inside a button that carries its own accessible
  // name, so the glyph itself is decoration and must not be announced.
  'aria-hidden': true,
  focusable: 'false' as const,
};

export const IconSearch = () => (
  <svg {...base}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
);

export const IconSettings = () => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" />
  </svg>
);

export const IconBack = () => (
  <svg {...base}><path d="M15 5 8 12l7 7" /></svg>
);

export const IconForward = () => (
  <svg {...base}><path d="m9 5 7 7-7 7" /></svg>
);

export const IconHome = () => (
  <svg {...base}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>
);

export const IconList = () => (
  <svg {...base}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>
);

export const IconClose = () => (
  <svg {...base}><path d="m6 6 12 12M18 6 6 18" /></svg>
);

export const IconUp = () => (
  <svg {...base}><path d="m6 14 6-6 6 6" /></svg>
);

export const IconSun = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
);

export const IconMoon = () => (
  <svg {...base}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
);

export const IconBook = () => (
  <svg {...base}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
    <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5" />
  </svg>
);

/* ---------------------------------------------------- dashboard navigation */

/** The Dominican crest, reduced to the cross flory over the shield. */
export const IconCrest = () => (
  <svg {...base} strokeWidth={1.5}>
    <path d="M12 3v18M6.5 9h11" />
    <path d="M4.5 4.5h15v8.2c0 3.4-2.9 5.6-7.5 6.8-4.6-1.2-7.5-3.4-7.5-6.8Z" />
  </svg>
);

export const IconCalendar = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3.2v3.6M16 3.2v3.6" />
  </svg>
);

export const IconNote = () => (
  <svg {...base}>
    <path d="M6 3.5h12v17l-6-3.6-6 3.6Z" />
  </svg>
);

export const IconInfo = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.2M12 7.9v.1" />
  </svg>
);

export const IconMenu = () => (
  <svg {...base}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);

export const IconMusic = () => (
  <svg {...base}>
    <path d="M9 18V6.2l10-1.7V16" />
    <circle cx="6.6" cy="18" r="2.6" /><circle cx="16.6" cy="16" r="2.6" />
  </svg>
);

export const IconGrid = () => (
  <svg {...base}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </svg>
);

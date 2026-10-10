// The LiftPilot brand at its sizes (scripts/brand-assets.py makes them from the Premium pack, brand/premium/), all for
// dark surfaces: the full logo (emblem, wordmark and "ELEVATOR DESIGN SOFTWARE", for 40 px of height and more), the
// compact lockup for the headers (emblem and name: under 40 px the line under the name is a smudge), the e-mails' logo
// (PNG: every mail client shows it; light on dark, the mail's header must stay dark) and the emblem alone for the
// application's sidebar.
export const LOGO = {
  src: '/img/liftpilot-logo-320.webp',
  srcSet: '/img/liftpilot-logo-160.webp 1x, /img/liftpilot-logo-320.webp 2x, /img/liftpilot-logo-480.webp 3x',
  width: 160,
  height: 38,
} as const;

export const LOGO_COMPACT = {
  src: '/img/liftpilot-lockup-72.webp',
  srcSet: '/img/liftpilot-lockup-36.webp 1x, /img/liftpilot-lockup-72.webp 2x, /img/liftpilot-lockup-108.webp 3x',
  width: 116,
  height: 36,
} as const;

export const EMBLEM = {
  src: '/img/liftpilot-emblem-64.webp',
  srcSet: '/img/liftpilot-emblem-32.webp 1x, /img/liftpilot-emblem-64.webp 2x, /img/liftpilot-emblem-96.webp 3x',
  width: 32,
  height: 32,
} as const;

// 480x114 shown at 202x48: the PNG's own ratio, nothing squeezed
export const MAIL_LOGO = { src: '/img/liftpilot-logo-480.png', width: 202, height: 48 } as const;

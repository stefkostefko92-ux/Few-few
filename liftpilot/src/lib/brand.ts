// The LiftPilot brand at its sizes (scripts/brand-assets.py makes them from the Premium pack, brand/premium/): the
// header logo (emblem, wordmark and "ELEVATOR DESIGN SOFTWARE", for dark surfaces), the e-mails' logo (PNG: every mail
// client shows it; it is light on dark, the mail's header must stay dark) and the emblem alone for the application's
// sidebar.
export const LOGO = {
  src: '/img/liftpilot-logo-320.webp',
  srcSet: '/img/liftpilot-logo-160.webp 1x, /img/liftpilot-logo-320.webp 2x, /img/liftpilot-logo-480.webp 3x',
  width: 160,
  height: 38,
} as const;

export const EMBLEM = {
  src: '/img/liftpilot-emblem-64.webp',
  srcSet: '/img/liftpilot-emblem-32.webp 1x, /img/liftpilot-emblem-64.webp 2x, /img/liftpilot-emblem-96.webp 3x',
  width: 32,
  height: 32,
} as const;

export const MAIL_LOGO = { src: '/img/liftpilot-logo-480.png', width: 200, height: 48 } as const;

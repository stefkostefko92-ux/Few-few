// The LiftPilot logo at its sizes (scripts/brand-assets.py makes them from brand/liftpilot-logo.webp): the top bars of
// the site and of the standalone page, and the e-mails (PNG: every mail client shows it).
export const LOGO = {
  src: '/img/liftpilot-logo-240.webp',
  srcSet: '/img/liftpilot-logo-120.webp 1x, /img/liftpilot-logo-240.webp 2x, /img/liftpilot-logo-360.webp 3x',
  width: 112,
  height: 36,
} as const;

export const MAIL_LOGO = { src: '/img/liftpilot-logo-480.png', width: 168, height: 54 } as const;

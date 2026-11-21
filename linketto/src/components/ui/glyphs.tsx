import type { SVGProps } from 'react';

// Тънки (1.75px) контурни икони за интерфейса — рисувани за системата,
// наследяват цвета през currentColor. Бранд/фийчър иконите са в ../icons.tsx.
type P = SVGProps<SVGSVGElement>;

function g(props: P, children: React.ReactNode) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SunGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>,
  );
export const MoonGlyph = (p: P) =>
  g(p, <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />);
export const MonitorGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>,
  );
export const MenuGlyph = (p: P) => g(p, <path d="M4 7h16M4 12h16M4 17h16" />);
export const CloseGlyph = (p: P) => g(p, <path d="M6 6l12 12M18 6 6 18" />);
export const ChevronDownGlyph = (p: P) => g(p, <path d="m6 9 6 6 6-6" />);
export const ArrowRightGlyph = (p: P) =>
  g(p, <path d="M5 12h14m-6-6 6 6-6 6" />);
export const GlobeGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </>,
  );
export const InfoGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
  );
export const AlertGlyph = (p: P) =>
  g(
    p,
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4.5M12 17.5h.01" />
    </>,
  );
export const CheckCircleGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.3 2.3 2.3 4.7-4.9" />
    </>,
  );
export const XCircleGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>,
  );

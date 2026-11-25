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

// Икони на страничното меню на таблото
export const UserGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c.9-3.6 3.9-5.4 7.5-5.4s6.6 1.8 7.5 5.4" />
    </>,
  );
export const PaletteGlyph = (p: P) =>
  g(
    p,
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.3-1-1.4-1-2.7 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4C21 6.7 17 3 12 3Z" />
      <circle cx="7.6" cy="11" r="1" />
      <circle cx="10.4" cy="7.2" r="1" />
      <circle cx="15" cy="7.6" r="1" />
    </>,
  );
export const LinkGlyph = (p: P) =>
  g(
    p,
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1-1" />
    </>,
  );
export const QrGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17 20.5h3.5V18" />
    </>,
  );
export const BoltGlyph = (p: P) =>
  g(p, <path d="M13 3 5 13.5h6L10 21l9-11h-6.5L13 3Z" />);
export const BarsGlyph = (p: P) =>
  g(p, <path d="M5 20V11M12 20V4M19 20v-6M3 20h18" />);
export const TrendGlyph = (p: P) =>
  g(p, <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />);
export const TranslateGlyph = (p: P) =>
  g(p, <path d="M4 6h9M8.5 4v2M6 6c.7 3.5 3 6 6 7.3M11 6c-.7 3.4-3.2 6.3-7 8M12.5 20l4-9 4 9M13.8 17h5.4" />);
export const MailGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>,
  );
export const CalendarGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>,
  );
export const UsersGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5c.7-3.1 3-4.8 6-4.8s5.3 1.7 6 4.8M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.9c1.6.6 2.7 2 3.1 4.6" />
    </>,
  );
export const BagGlyph = (p: P) =>
  g(
    p,
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>,
  );
export const GiftGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12M12 8c-1-3.5-5-4-5-1.6C7 8 9 8 12 8Zm0 0c1-3.5 5-4 5-1.6C17 8 15 8 12 8Z" />
    </>,
  );
export const CardGlyph = (p: P) =>
  g(
    p,
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>,
  );
export const ExternalGlyph = (p: P) =>
  g(p, <path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />);
export const LogOutGlyph = (p: P) =>
  g(p, <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10" />);
export const ChevronLeftGlyph = (p: P) => g(p, <path d="m15 6-6 6 6 6" />);
export const ShieldGlyph = (p: P) =>
  g(
    p,
    <>
      <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  );
export const KeyGlyph = (p: P) =>
  g(
    p,
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 8.15-8.15M16 7l2.5 2.5M14 9l2 2" />
    </>,
  );

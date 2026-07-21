// Малки линейни икони за ДЕЙСТВИЯ (печат, AI, споделяне и др.) — заместват
// емоджитата в UI. Наследяват цвета на текста (currentColor) и се мащабират с
// класа. Декоративни са (aria-hidden) — до тях винаги стои текст.
// Не се ползват за печатното СЪДЪРЖАНИЕ (там потребителят сам избира емоджи).

type IconName =
  | "print"
  | "sparkles"
  | "palette"
  | "image"
  | "download"
  | "upload"
  | "link"
  | "bulb"
  | "check"
  | "sun"
  | "moon";

const PATHS: Record<IconName, React.ReactNode> = {
  print: (
    <>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-1 .4-1.9 1.4-1.9H16a5 5 0 0 0 5-5c0-4.5-4-8.2-9-8.2z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9" />
      <path d="M7 13l5-5 5 5" />
      <path d="M4 4h16" />
    </>
  ),
  link: (
    <>
      <path d="M9 12a3 3 0 0 1 3-3h4a3 3 0 0 1 0 6h-2" />
      <path d="M15 12a3 3 0 0 1-3 3H8a3 3 0 0 1 0-6h2" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.2V16h6v-.3c0-.8.4-1.6 1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

export default function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

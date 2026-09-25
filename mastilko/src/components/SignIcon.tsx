// Монохромни пиктограми за ПЕЧАТНОТО съдържание на табелки — по-надеждни от
// цветните емоджи (еднакъв изглед на всеки принтер/ОС). Мащабират се чисто в
// mm контейнер; цветът идва отвън (акцентният на темата).

export const SIGN_ICONS: Array<{ id: string; name: string }> = [
  { id: "none", name: "Без икона" },
  { id: "bell", name: "Звънец" },
  { id: "open", name: "Отворено" },
  { id: "closed", name: "Затворено" },
  { id: "clock", name: "Часовник" },
  { id: "dog", name: "Куче" },
  { id: "nosmoking", name: "Пушенето забранено" },
  { id: "warning", name: "Внимание" },
  { id: "arrow", name: "Стрелка" },
  { id: "wifi", name: "WiFi" },
  { id: "phone", name: "Телефон" },
  { id: "heart", name: "Сърце" },
  { id: "star", name: "Звезда" },
];

const PATHS: Record<string, React.ReactNode> = {
  bell: <path d="M12 3a5 5 0 0 0-5 5c0 5-2 6-2 7h14c0-1-2-2-2-7a5 5 0 0 0-5-5zM10 20a2 2 0 0 0 4 0" />,
  open: <path d="M4 12l5 5L20 6" />,
  closed: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  dog: (
    <>
      <path d="M3 11l2-4 3 2h5l3-2 2 4v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 13h.01M15 13h.01M11 16h2" />
    </>
  ),
  nosmoking: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
      <path d="M8 12h8v2H8z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  arrow: <path d="M4 12h14M12 6l6 6-6 6" />,
  wifi: (
    <>
      <path d="M2 8.5a15 15 0 0 1 20 0" />
      <path d="M5 12a10 10 0 0 1 14 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <path d="M12 19h.01" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  heart: <path d="M12 20l-7-7a4.5 4.5 0 0 1 7-5 4.5 4.5 0 0 1 7 5z" />,
  star: <path d="M12 3l2.9 6.6 7.1.6-5.4 4.7L18.2 22 12 18.2 5.8 22l1.6-7.1L2 10.2l7.1-.6z" />,
};

export default function SignIcon({
  id,
  color,
  className,
  style,
}: {
  id: string;
  color: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const path = PATHS[id];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {path}
    </svg>
  );
}

// Гербът на ФК „Миньор“ Бобов дол — щит в клубните жълто-черни цветове с
// миньорски символ (кръстосани чук и кирка), футболна топка и годината 1946.
// Чист, мащабируем SVG (без растерни изображения), използван в хедъра, футъра
// и като воден знак в заглавните ленти.

export function Crest({
  className,
  title = "Герб на ФК „Миньор“ Бобов дол",
  decorative = false,
}: {
  className?: string;
  title?: string;
  // Декоративен (воден знак) — скрит за екранни четци, без роля/заглавие.
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!decorative && <title>{title}</title>}
      {/* Щит — златен кант и черно поле */}
      <path
        d="M60 3 L113 19 V70 C113 101 90 126 60 137 C30 126 7 101 7 70 V19 Z"
        fill="#f7be1e"
      />
      <path
        d="M60 11 L106 25 V70 C106 97 86 119 60 129 C34 119 14 97 14 70 V25 Z"
        fill="#16181d"
      />
      {/* Горна лента с името на клуба */}
      <path d="M14 34 H106 V25 L60 11 L14 25 Z" fill="#f7be1e" />
      <text
        x="60"
        y="25"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="11"
        fill="#16181d"
      >
        МИНЬОР
      </text>

      {/* Кръстосани чук и кирка (миньорски символ) в златно */}
      <g
        stroke="#f7be1e"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      >
        {/* дръжки */}
        <line x1="40" y1="48" x2="80" y2="92" />
        <line x1="80" y1="48" x2="40" y2="92" />
      </g>
      {/* глава на чука */}
      <rect x="34" y="42" width="14" height="9" rx="2" fill="#f7be1e" transform="rotate(-42 41 46)" />
      {/* острие на кирката */}
      <path
        d="M72 44 q10 1 14 8 q-8 -1 -14 -2 q-6 1 -14 2 q4 -7 14 -8 Z"
        fill="#f7be1e"
        transform="rotate(0 79 48)"
      />

      {/* Футболна топка */}
      <circle cx="60" cy="86" r="15" fill="#ffffff" stroke="#16181d" strokeWidth="1.5" />
      <path
        d="M60 78 l6 4.5 -2.3 7 h-7.4 l-2.3 -7 Z"
        fill="#16181d"
      />
      <g fill="#16181d">
        <path d="M60 71 l3 3 -1 2 h-4 l-1 -2 Z" />
        <path d="M48 80 l3.5 0.5 1 3 -2.5 2 -3 -2 Z" />
        <path d="M72 80 l-3.5 0.5 -1 3 2.5 2 3 -2 Z" />
        <path d="M52 95 l3 -1.5 2.5 2 -1 3.2 -3.5 -0.2 Z" />
        <path d="M68 95 l-3 -1.5 -2.5 2 1 3.2 3.5 -0.2 Z" />
      </g>

      {/* Година на основаване */}
      <text
        x="60"
        y="118"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="11"
        fill="#f7be1e"
      >
        1946
      </text>
    </svg>
  );
}

import type { ReactNode } from "react";

// Схематични картинки на телефона за стъпките „Сложи на телефона“. Рисувани са
// тук като SVG — без снимки от чужди сайтове и без марки. Екранът е винаги бял
// (като на истинския телефон), а рамката следва темата (тъмен режим).
// Картинките са украса (aria-hidden) — смисълът е в текста на стъпката.

const INK = "#334155"; // иконите на екрана
const MARK = "#b51818"; // червеният кръг „натиснете тук“
const BRAND = "#212f8a";

function Phone({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 140 240"
      className="h-44 w-auto shrink-0 text-slate-700 sm:h-48"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="132" height="232" rx="18" fill="#ffffff" stroke="currentColor" strokeWidth="4" />
      <rect x="56" y="11" width="28" height="5" rx="2.5" fill={INK} />
      {children}
    </svg>
  );
}

// Червен кръг около мястото, което се натиска.
function Ring({ cx, cy, r = 13 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill="none" stroke={MARK} strokeWidth="3.5" />;
}

function Lines({ y, n = 4 }: { y: number; n?: number }) {
  return (
    <g fill="#cbd5e1">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x="18" y={y + i * 14} width={i % 2 ? 80 : 104} height="6" rx="3" />
      ))}
    </g>
  );
}

function AddressBar({ dots = false }: { dots?: boolean }) {
  return (
    <g>
      <rect x="14" y="24" width={dots ? 90 : 112} height="18" rx="9" fill="#f1f5f9" stroke="#cbd5e1" />
      <text x="24" y="37" fontSize="9" fill={INK}>
        zabobovdol…
      </text>
      {dots && (
        <g fill={INK}>
          <circle cx="118" cy="27" r="2.2" />
          <circle cx="118" cy="33" r="2.2" />
          <circle cx="118" cy="39" r="2.2" />
        </g>
      )}
    </g>
  );
}

/** Android, Chrome: трите точки горе вдясно. */
export function AndroidMenuPicture() {
  return (
    <Phone>
      <AddressBar dots />
      <Ring cx={118} cy={33} />
      <Lines y={60} n={8} />
    </Phone>
  );
}

/** Android, Chrome: менюто с „Инсталиране“ / „Добавяне към началния екран“. */
export function AndroidInstallItemPicture() {
  return (
    <Phone>
      <AddressBar dots />
      <rect x="40" y="46" width="88" height="128" rx="6" fill="#ffffff" stroke="#94a3b8" />
      <g fill="#cbd5e1">
        <rect x="50" y="58" width="60" height="6" rx="3" />
        <rect x="50" y="76" width="52" height="6" rx="3" />
        <rect x="50" y="94" width="64" height="6" rx="3" />
        <rect x="50" y="148" width="48" height="6" rx="3" />
      </g>
      <rect x="44" y="110" width="80" height="28" rx="5" fill="#eef1fb" stroke={MARK} strokeWidth="3" />
      <text x="50" y="122" fontSize="8.5" fontWeight="700" fill={BRAND}>
        Инсталиране /
      </text>
      <text x="50" y="132" fontSize="8.5" fontWeight="700" fill={BRAND}>
        Добавяне…
      </text>
    </Phone>
  );
}

/** Android: потвърждение в прозорчето. */
export function AndroidConfirmPicture() {
  return (
    <Phone>
      <Lines y={30} n={10} />
      <rect x="16" y="78" width="108" height="86" rx="10" fill="#ffffff" stroke="#94a3b8" />
      <rect x="28" y="90" width="22" height="22" rx="5" fill={BRAND} />
      <rect x="58" y="96" width="54" height="6" rx="3" fill="#cbd5e1" />
      <rect x="66" y="134" width="50" height="20" rx="10" fill={BRAND} />
      <text x="70" y="147" fontSize="8" fontWeight="700" fill="#ffffff">
        Инсталиране
      </text>
      <Ring cx={91} cy={144} r={17} />
    </Phone>
  );
}

/** iPhone, Safari: бутонът „Сподели“ долу в средата. */
export function IphoneSharePicture() {
  return (
    <Phone>
      <Lines y={30} n={9} />
      <rect x="8" y="196" width="124" height="30" fill="#f1f5f9" />
      <g stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 211l5-5M22 211l5 5" />
        <path d="M46 206l5 5-5 5" />
        {/* „Сподели“: квадратче със стрелка нагоре */}
        <path d="M65 207h-3v12h16v-12h-3" />
        <path d="M70 214v-12M66 206l4-4 4 4" />
        <path d="M92 204h10v14H92z" />
        <rect x="112" y="205" width="10" height="12" rx="2" />
      </g>
      <Ring cx={70} cy={211} r={14} />
    </Phone>
  );
}

/** iPhone: менюто „Сподели“ → „Добави към начален екран“. */
export function IphoneAddHomePicture() {
  return (
    <Phone>
      <Lines y={30} n={4} />
      <rect x="8" y="90" width="124" height="138" rx="12" fill="#f1f5f9" />
      <g fill="#cbd5e1">
        <rect x="18" y="102" width="104" height="18" rx="5" />
        <rect x="18" y="126" width="104" height="18" rx="5" />
        <rect x="18" y="196" width="104" height="18" rx="5" />
      </g>
      <rect x="14" y="152" width="112" height="36" rx="6" fill="#ffffff" stroke={MARK} strokeWidth="3" />
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round">
        <rect x="106" y="162" width="14" height="14" rx="3" />
        <path d="M113 165.5v7M109.5 169h7" />
      </g>
      <text x="20" y="166" fontSize="8.5" fontWeight="700" fill={BRAND}>
        Добави към
      </text>
      <text x="20" y="178" fontSize="8.5" fontWeight="700" fill={BRAND}>
        начален екран
      </text>
    </Phone>
  );
}

/** iPhone: „Добави“ горе вдясно. */
export function IphoneConfirmPicture() {
  return (
    <Phone>
      <text x="16" y="36" fontSize="8.5" fill={INK}>
        Отказ
      </text>
      <text x="96" y="36" fontSize="9" fontWeight="700" fill={BRAND}>
        Добави
      </text>
      <Ring cx={109} cy={33} r={17} />
      <rect x="16" y="54" width="26" height="26" rx="6" fill={BRAND} />
      <rect x="50" y="60" width="70" height="6" rx="3" fill="#cbd5e1" />
      <Lines y={100} n={6} />
    </Phone>
  );
}

/** Началният екран с новата икона. */
export function HomeScreenPicture() {
  const cells: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([20 + c * 27, 34 + r * 34]);
  return (
    <Phone>
      {cells.map(([x, y], i) =>
        i === 5 ? null : <rect key={i} x={x} y={y} width="20" height="20" rx="5" fill="#cbd5e1" />,
      )}
      <image href="/icon-192.png" x="47" y="68" width="20" height="20" />
      <Ring cx={57} cy={78} r={15} />
    </Phone>
  );
}

// Една стъпка: номер, картинка (по желание) и текст на прост български.
export function Step({
  n,
  picture,
  children,
}: {
  n: number;
  picture?: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="card flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      {picture}
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xl font-bold text-white"
          aria-hidden="true"
        >
          {n}
        </span>
        <div className="text-lg leading-relaxed text-slate-800">
          <span className="sr-only">Стъпка {n}. </span>
          {children}
        </div>
      </div>
    </li>
  );
}

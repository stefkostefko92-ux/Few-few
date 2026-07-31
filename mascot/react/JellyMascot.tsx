// ⚠️  ГЕНЕРИРАН ФАЙЛ — не го редактирай на ръка.
//     Източник: mascot/svg/*.svg + mascot/tokens.css  ·  Генератор: `node mascot/build.mjs`
//     `node mascot/check.mjs` пада, ако този файл се разминава с източника.
//
// Маскотът на Carbon Stealth: полупрозрачно желирано телце с очила, папийонка и академична шапка.
// Нула зависимости извън React. Копирай папката `react/` в продукта, който го ползва.
import { useId, type CSSProperties, type ReactElement } from "react";

export type JellyMascotDetail = "full" | "medium" | "icon";

export interface JellyMascotProps {
  /** Ниво на детайл: `full` (герой), `medium` (среден размер/печат), `icon` (≤32 px, favicon). */
  detail?: JellyMascotDetail;
  /** Страна на квадратния кадър в CSS пиксели (или всяка валидна CSS дължина). */
  size?: number | string;
  /**
   * Достъпно име. Подай текст, когато маскотът НОСИ смисъл (лого, илюстрация с роля).
   * Подай `null`, когато е чиста декорация — тогава излиза `aria-hidden` и екранният четец мълчи.
   */
  title?: string | null;
  /** Черен герой-фон вътре в SVG-то (както е в референцията). По подразбиране: прозрачен. */
  background?: "none" | "black";
  /** Микро-анимация (полюшване, пулс на глоуто, мигане, махане на пискюла). */
  animated?: boolean;
  className?: string;
  /** Пребоядисване по бранд: подай CSS променливите `--jm-*` (виж `tokens.json`). */
  style?: CSSProperties;
}

/** Анимацията живее в `mascot/tokens.css` и се вгражда тук, за да е компонентът самодостатъчен. */
const ANIMATION_CSS = `
.jm-animated .jm-root {
  animation: jm-bob 3.6s ease-in-out infinite;
  transform-origin: 256px 452px;
}
.jm-animated .jm-bloom,
.jm-animated .jm-core {
  animation: jm-pulse 2.6s ease-in-out infinite;
}
.jm-animated .jm-eyes {
  animation: jm-blink 5.2s ease-in-out infinite;
  transform-origin: 256px 266px;
}
.jm-animated .jm-tassel-bob {
  animation: jm-swing 3.6s ease-in-out infinite;
  transform-origin: 372px 104px;
}

@keyframes jm-bob {
  0%, 100% { transform: translateY(0) scaleY(1) scaleX(1); }
  45% { transform: translateY(-10px) scaleY(1.015) scaleX(0.99); }
  70% { transform: translateY(2px) scaleY(0.985) scaleX(1.012); }
}
@keyframes jm-pulse {
  0%, 100% { opacity: 0.42; }
  50% { opacity: 0.62; }
}
@keyframes jm-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
@keyframes jm-swing {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(5deg); }
}

/* Достъпност (закон в репото, не пожелание): нула движение при prefers-reduced-motion.
   Нищо в анимацията не мига по-бързо от 3 Hz — епилептичен риск няма и при включено движение. */
@media (prefers-reduced-motion: reduce) {
  .jm-animated .jm-root,
  .jm-animated .jm-bloom,
  .jm-animated .jm-core,
  .jm-animated .jm-eyes,
  .jm-animated .jm-tassel-bob {
    animation: none !important;
  }
}
`;

interface TierProps {
  uid: string;
}

function Full({ uid }: TierProps) {
  return (
    <>
      <defs>
        {/* Тяло: ключова светлина горе-вляво → дълбока сянка долу-вдясно (подповърхностно разсейване). */}
        <radialGradient id={`${uid}-body`} cx="36%" cy="26%" r="84%">
          <stop offset="0%" stopColor="var(--jm-pale, #C8DDA6)"/>
          <stop offset="18%" stopColor="var(--jm-olive, #99E72A)"/>
          <stop offset="55%" stopColor="var(--jm-neon, #5AB60D)"/>
          <stop offset="88%" stopColor="var(--jm-bottle, #297F04)"/>
          <stop offset="100%" stopColor="var(--jm-deep, #0D4A02)"/>
        </radialGradient>

        {/* Вътрешна емисия — най-силна в долната половина („свети отвътре", не отгоре). */}
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="1"/>
          <stop offset="45%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>

        {/* Подсветка под тялото (underglow) — лежи на пода зад силуета. */}
        <radialGradient id={`${uid}-underglow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>

        {/* Rim light: нула отгоре-вляво, ярък кант долу-вдясно. */}
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0"/>
          <stop offset="0.45" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.05"/>
          <stop offset="1" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.95"/>
        </linearGradient>

        {/* Горна дъга на шапката: плоскостта хваща светлина отляво. */}
        <linearGradient id={`${uid}-board`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--jm-ink-soft, #2A2E24)"/>
          <stop offset="1" stopColor="var(--jm-ink, #0A0C0A)"/>
        </linearGradient>

        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="1" stopColor="var(--jm-gold, #D9A521)"/>
        </linearGradient>

        {/* Мек преход, за да не оставя долният кант хоризонтален шев по тялото. */}
        <linearGradient id={`${uid}-bottom-fade`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0.45" stopColor="#000000"/>
          <stop offset="0.85" stopColor="#FFFFFF"/>
        </linearGradient>
        <mask id={`${uid}-bottom`}>
          <rect x="0" y="0" width="512" height="512" fill={`url(#${uid}-bottom-fade)`}/>
        </mask>

        <clipPath id={`${uid}-clip`}>
          <path d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z"/>
        </clipPath>

        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16"/>
        </filter>
        <filter id={`${uid}-soft-s`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
      </defs>

      <g className="jm-root">
        {/* 1. Подсветка (зад всичко). */}
        <ellipse className="jm-glow" cx="256" cy="452" rx="176" ry="44" fill={`url(#${uid}-underglow)`} filter={`url(#${uid}-soft)`}/>
        <path className="jm-bloom" d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill="var(--jm-neon, #5AB60D)" opacity="0.45" filter={`url(#${uid}-soft)`}/>

        {/* 2. Ръчички — зад тялото, за да „излизат" от него. */}
        <g className="jm-arms" stroke={`url(#${uid}-body)`} strokeWidth="36" strokeLinecap="round" fill="none">
          <path d="M138 356C114 368 98 384 90 400"/>
          <path d="M374 356C398 368 414 384 422 400"/>
        </g>

        {/* 3. Тяло. */}
        <path className="jm-body" d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill={`url(#${uid}-body)`}/>

        {/* 4. Вътрешност — светещо ядро, мехурчета, специалитет. Всичко изрязано по силуета. */}
        <g clipPath={`url(#${uid}-clip)`}>
          {/* Вътрешна сянка по ръба: желето е плътно по контура и светло в средата — това,
               а не бликът отгоре, е което разчита окото като „полупрозрачно". */}
          <path d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill="none" stroke="var(--jm-deep, #0D4A02)" strokeWidth="46" opacity="0.55" filter={`url(#${uid}-soft-s)`}/>
          <ellipse className="jm-core" cx="256" cy="382" rx="150" ry="118" fill={`url(#${uid}-core)`}/>

          {/* Сянка от шапката върху темето. */}
          <ellipse cx="256" cy="152" rx="96" ry="26" fill="var(--jm-deep, #0D4A02)" opacity="0.55" filter={`url(#${uid}-soft-s)`}/>

          {/* Мехурчета: неравномерни, по-нагъсто в долната половина. */}
          <g className="jm-bubbles">
            <circle cx="176" cy="332" r="9" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="176" cy="332" r="9" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.0" opacity="0.55"/>
            <circle cx="172.9" cy="328.6" r="2.3" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="212" cy="392" r="6" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="212" cy="392" r="6" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.3" opacity="0.55"/>
            <circle cx="210.0" cy="389.7" r="1.6" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="158" cy="392" r="4" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="158" cy="392" r="4" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="242" cy="424" r="11" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="242" cy="424" r="11" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.4" opacity="0.55"/>
            <circle cx="238.3" cy="419.8" r="2.9" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="296" cy="404" r="7" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="296" cy="404" r="7" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.5" opacity="0.55"/>
            <circle cx="293.6" cy="401.3" r="1.8" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="332" cy="356" r="10" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="332" cy="356" r="10" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.2" opacity="0.55"/>
            <circle cx="328.6" cy="352.2" r="2.6" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="352" cy="410" r="5" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="352" cy="410" r="5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="350.3" cy="408.1" r="1.3" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="196" cy="356" r="3.5" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="196" cy="356" r="3.5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="276" cy="352" r="4.5" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="276" cy="352" r="4.5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="320" cy="300" r="6" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="320" cy="300" r="6" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.3" opacity="0.55"/>
            <circle cx="318.0" cy="297.7" r="1.6" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="150" cy="270" r="5" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="150" cy="270" r="5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="148.3" cy="268.1" r="1.3" fill="var(--jm-white, #FFFFFF)" opacity="0.75"/>
            <circle cx="368" cy="268" r="3.5" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="368" cy="268" r="3.5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="228" cy="300" r="3" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="228" cy="300" r="3" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
            <circle cx="300" cy="436" r="4" fill="var(--jm-pale, #C8DDA6)" opacity="0.18"/>
            <circle cx="300" cy="436" r="4" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.1" opacity="0.55"/>
          </g>

          {/* Голям мек блик горе-вляво + остър специалитет. */}
          <ellipse cx="182" cy="212" rx="58" ry="34" fill="var(--jm-white, #FFFFFF)" opacity="0.16" transform="rotate(-32 182 212)" filter={`url(#${uid}-soft-s)`}/>
          <ellipse cx="168" cy="196" rx="16" ry="10" fill="var(--jm-white, #FFFFFF)" opacity="0.55" transform="rotate(-32 168 196)"/>
          {/* Тъмен контур по долния десен ръб — дава обем на желето. */}
          <ellipse cx="368" cy="418" rx="104" ry="76" fill="var(--jm-deep, #0D4A02)" opacity="0.22" filter={`url(#${uid}-soft)`}/>
        </g>

        {/* 5. Кант (rim light) по силуета + лаймов кант отдолу от подсветката. */}
        <g clipPath={`url(#${uid}-clip)`}>
          <path d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="16" opacity="0.95" filter={`url(#${uid}-soft-s)`} mask={`url(#${uid}-bottom)`}/>
        </g>
        <path d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="5"/>

        {/* 6. Лице. */}
        <g className="jm-face">
          {/* Вежди. */}
          <g stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round" fill="none">
            <path d="M164 202C182 190 206 188 224 194"/>
            <path d="M348 202C330 190 306 188 288 194"/>
          </g>

          {/* Очи. */}
          <g className="jm-eyes">
            <circle cx="200" cy="266" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="312" cy="266" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="202" cy="270" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="314" cy="270" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <g fill="var(--jm-white, #FFFFFF)">
              <circle cx="193" cy="261" r="8"/>
              <circle cx="305" cy="261" r="8"/>
              <circle cx="210" cy="280" r="4" opacity="0.6"/>
              <circle cx="322" cy="280" r="4" opacity="0.6"/>
            </g>
          </g>

          {/* Очила: дебели черни кръгли рамки + стъкла с лек блясък. */}
          <g className="jm-glasses">
            <circle cx="200" cy="266" r="48" fill="var(--jm-white, #FFFFFF)" opacity="0.07"/>
            <circle cx="312" cy="266" r="48" fill="var(--jm-white, #FFFFFF)" opacity="0.07"/>
            <g fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="13" strokeLinecap="round">
              <circle cx="200" cy="266" r="48"/>
              <circle cx="312" cy="266" r="48"/>
              <path d="M249 260C253 253 259 253 263 260"/>
              <path d="M152 254C138 246 126 244 114 246"/>
              <path d="M360 254C374 246 386 244 398 246"/>
            </g>
            {/* Блясък по стъклата (къси наклонени черти). */}
            <g stroke="var(--jm-white, #FFFFFF)" strokeWidth="7" strokeLinecap="round" opacity="0.5">
              <path d="M176 246L192 232"/>
              <path d="M288 246L304 232"/>
            </g>
          </g>

          {/* Усмивка. */}
          <path d="M236 322C244 336 268 336 276 322" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round"/>
        </g>

        {/* 7. Папийонка. */}
        <g className="jm-bowtie">
          <path d="M250 400C234 386 220 376 208 375C202 388 202 412 208 425C220 424 234 414 250 400Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M262 400C278 386 292 376 304 375C310 388 310 412 304 425C292 424 278 414 262 400Z" fill="var(--jm-ink, #0A0C0A)"/>
          <rect x="246" y="389" width="20" height="22" rx="7" fill="var(--jm-ink-soft, #2A2E24)"/>
          <path d="M250 400C234 386 220 376 208 375C202 388 202 412 208 425C220 424 234 414 250 400ZM262 400C278 386 292 376 304 375C310 388 310 412 304 425C292 424 278 414 262 400Z" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.35"/>
          <path d="M214 383C220 391 222 405 220 416" fill="none" stroke="var(--jm-ink-soft, #2A2E24)" strokeWidth="4" strokeLinecap="round" opacity="0.8"/>
          <path d="M298 383C292 391 290 405 292 416" fill="none" stroke="var(--jm-ink-soft, #2A2E24)" strokeWidth="4" strokeLinecap="round" opacity="0.8"/>
        </g>

        {/* 8. Академична шапка — леко наклонена, „плава" над темето. */}
        <g className="jm-cap" transform="translate(0 18) rotate(-6 256 110)">
          <ellipse cx="256" cy="120" rx="66" ry="26" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M256 62L390 100L256 138L122 100Z" fill="var(--jm-ink, #0A0C0A)" opacity="0.9" transform="translate(0 9)"/>
          <path d="M256 62L390 100L256 138L122 100Z" fill={`url(#${uid}-board)`}/>
          <path d="M256 62L390 100L256 106L122 100Z" fill="var(--jm-ink-soft, #2A2E24)" opacity="0.5"/>
          <circle cx="256" cy="100" r="6" fill="var(--jm-ink-soft, #2A2E24)"/>
          {/* Пискюл: шнур през ръба на дъската и висящ помпон. */}
          <path d="M256 100C300 106 340 108 372 102" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
          <path className="jm-tassel" d="M372 102C378 124 378 146 374 162" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
          <path className="jm-tassel-bob" d="M362 160H386L380 196C378 202 370 202 368 196Z" fill={`url(#${uid}-gold)`}/>
        </g>
      </g>
    </>
  );
}

function Medium({ uid }: TierProps) {
  return (
    <>
      {/* Ниво „средно": нула `filter` елементи (блурът не оцелява във всеки векторен конвейер и
           поскъпва растеризацията), само градиенти и плътни форми. Силуетът и лицето са същите като
           при пълния вариант — не се разминават, за да не се счупи разпознаваемостта. */}
      <defs>
        <radialGradient id={`${uid}-body`} cx="36%" cy="26%" r="84%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)"/>
          <stop offset="46%" stopColor="var(--jm-neon, #5AB60D)"/>
          <stop offset="86%" stopColor="var(--jm-bottle, #297F04)"/>
          <stop offset="100%" stopColor="var(--jm-deep, #0D4A02)"/>
        </radialGradient>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.85"/>
          <stop offset="55%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="1" stopColor="var(--jm-gold, #D9A521)"/>
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <path d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z"/>
        </clipPath>
      </defs>

      <g className="jm-root">
        <g className="jm-arms" stroke={`url(#${uid}-body)`} strokeWidth="36" strokeLinecap="round" fill="none">
          <path d="M138 356C114 368 98 384 90 400"/>
          <path d="M374 356C398 368 414 384 422 400"/>
        </g>

        <path className="jm-body" d="M256 148C346 148 406 212 406 294C406 362 372 412 322 436C302 446 280 452 256 452C232 452 210 446 190 436C140 412 106 362 106 294C106 212 166 148 256 148Z" fill={`url(#${uid}-body)`}/>

        <g clipPath={`url(#${uid}-clip)`}>
          <ellipse cx="256" cy="382" rx="150" ry="118" fill={`url(#${uid}-core)`}/>
          <g className="jm-bubbles">
            <circle cx="176" cy="332" r="9" fill="var(--jm-pale, #C8DDA6)" opacity="0.2"/>
            <circle cx="176" cy="332" r="9" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.55"/>
            <circle cx="242" cy="424" r="11" fill="var(--jm-pale, #C8DDA6)" opacity="0.2"/>
            <circle cx="242" cy="424" r="11" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.4" opacity="0.55"/>
            <circle cx="332" cy="356" r="10" fill="var(--jm-pale, #C8DDA6)" opacity="0.2"/>
            <circle cx="332" cy="356" r="10" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.2" opacity="0.55"/>
            <circle cx="296" cy="404" r="7" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.6" opacity="0.5"/>
            <circle cx="212" cy="392" r="6" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.4" opacity="0.5"/>
          </g>
          <ellipse cx="182" cy="212" rx="52" ry="28" fill="var(--jm-white, #FFFFFF)" opacity="0.22" transform="rotate(-32 182 212)"/>
        </g>

        <g className="jm-face">
          <g stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round" fill="none">
            <path d="M164 202C182 190 206 188 224 194"/>
            <path d="M348 202C330 190 306 188 288 194"/>
          </g>
          <g className="jm-eyes">
            <circle cx="200" cy="266" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="312" cy="266" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="202" cy="270" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="314" cy="270" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <g fill="var(--jm-white, #FFFFFF)">
              <circle cx="193" cy="261" r="8"/>
              <circle cx="305" cy="261" r="8"/>
            </g>
          </g>
          <g className="jm-glasses" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="13" strokeLinecap="round">
            <circle cx="200" cy="266" r="48"/>
            <circle cx="312" cy="266" r="48"/>
            <path d="M249 260C253 253 259 253 263 260"/>
            <path d="M152 254C138 246 126 244 114 246"/>
            <path d="M360 254C374 246 386 244 398 246"/>
          </g>
          <path d="M236 322C244 336 268 336 276 322" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round"/>
        </g>

        <g className="jm-bowtie">
          <path d="M250 400C234 386 220 376 208 375C202 388 202 412 208 425C220 424 234 414 250 400Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M262 400C278 386 292 376 304 375C310 388 310 412 304 425C292 424 278 414 262 400Z" fill="var(--jm-ink, #0A0C0A)"/>
          <rect x="246" y="389" width="20" height="22" rx="7" fill="var(--jm-ink-soft, #2A2E24)"/>
        </g>

        <g className="jm-cap" transform="translate(0 18) rotate(-6 256 110)">
          <ellipse cx="256" cy="120" rx="66" ry="26" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M256 62L390 100L256 138L122 100Z" fill="var(--jm-ink-soft, #2A2E24)"/>
          <path d="M256 106L390 100L256 138L122 100Z" fill="var(--jm-ink, #0A0C0A)"/>
          <circle cx="256" cy="100" r="6" fill="var(--jm-ink-soft, #2A2E24)"/>
          <path d="M256 100C300 106 340 108 372 102C378 124 378 146 374 162" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
          <path d="M362 160H386L380 196C378 202 370 202 368 196Z" fill={`url(#${uid}-gold)`}/>
        </g>
      </g>
    </>
  );
}

function Icon({ uid }: TierProps) {
  return (
    <>
      {/* Ниво „икона": нула филтри, нула градиенти, нула мехурчета. Всичко, което изчезва под 24 px,
           е махнато — остават силуетът, очилата, очите, устата, папийонката и шапката. Щрихите са
           удебелени, защото при 16 px тънката линия става сива каша, а не линия. */}
      <g className="jm-root">
        <path className="jm-body" d="M256 138C352 138 414 206 414 292C414 366 376 420 322 444C302 454 280 460 256 460C232 460 210 454 190 444C136 420 98 366 98 292C98 206 160 138 256 138Z" fill="var(--jm-neon, #5AB60D)"/>
        <path d="M256 460C232 460 210 454 190 444C160 430 132 406 116 374C154 396 202 408 256 408C310 408 358 396 396 374C380 406 352 430 322 444C302 454 280 460 256 460Z" fill="var(--jm-bottle, #297F04)"/>

        <g className="jm-face">
          <g className="jm-eyes">
            <circle cx="196" cy="264" r="40" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="316" cy="264" r="40" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="198" cy="266" r="27" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="318" cy="266" r="27" fill="var(--jm-ink, #0A0C0A)"/>
          </g>
          <g className="jm-glasses" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="20" strokeLinecap="round">
            <circle cx="196" cy="264" r="50"/>
            <circle cx="316" cy="264" r="50"/>
            <path d="M246 260H266"/>
            <path d="M146 250L112 244"/>
            <path d="M366 250L400 244"/>
          </g>
          <path d="M232 330C242 348 270 348 280 330" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="14" strokeLinecap="round"/>
        </g>

        <g className="jm-bowtie" fill="var(--jm-ink, #0A0C0A)">
          <path d="M248 402L204 376V428L248 402Z"/>
          <path d="M264 402L308 376V428L264 402Z"/>
          <rect x="242" y="388" width="28" height="28" rx="9"/>
        </g>

        <g className="jm-cap" transform="translate(0 14) rotate(-6 256 104)">
          <ellipse cx="256" cy="116" rx="70" ry="26" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M256 56L400 100L256 144L112 100Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M256 100C304 106 344 108 376 100C382 122 382 142 378 158" fill="none" stroke="var(--jm-gold, #D9A521)" strokeWidth="12" strokeLinecap="round"/>
        </g>
      </g>
    </>
  );
}

const TIERS: Record<JellyMascotDetail, (p: TierProps) => ReactElement> = { full: Full, medium: Medium, icon: Icon };

export default function JellyMascot({
  detail = "full",
  size = 256,
  title = "Маскотът на Carbon Stealth",
  background = "none",
  animated = false,
  className,
  style,
}: JellyMascotProps) {
  // Всяка инстанция получава свои id-та — иначе втори маскот на страницата краде градиентите на първия.
  const uid = `jm${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const Tier = TIERS[detail];
  const decorative = title === null;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={[animated ? "jm-animated" : "", className].filter(Boolean).join(" ") || undefined}
      style={style}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : `${uid}-title`}
    >
      {!decorative && <title id={`${uid}-title`}>{title}</title>}
      {animated && <style>{ANIMATION_CSS}</style>}
      {background === "black" && <rect width="512" height="512" fill="var(--jm-bg, #050706)" />}
      <Tier uid={uid} />
    </svg>
  );
}

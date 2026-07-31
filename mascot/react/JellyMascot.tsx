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

/* Мехурчетата се качват — трите плана с различна скорост, за да има паралакс в желето. */
.jm-animated .jm-bubbles-near { animation: jm-rise 7s ease-in-out infinite; }
.jm-animated .jm-bubbles-mid { animation: jm-rise 9s ease-in-out infinite 0.8s; }
.jm-animated .jm-bubbles-far { animation: jm-rise 12s ease-in-out infinite 1.6s; }

/* Отблясък, който минава по гланца веднъж на цикъл. */
.jm-animated .jm-shimmer { animation: jm-sweep 9s ease-in-out infinite; }

/* Искрите присветват разминато. */
.jm-animated .jm-sparkle-a,
.jm-animated .jm-sparkle-b,
.jm-animated .jm-sparkle-c {
  transform-box: fill-box;
  transform-origin: center;
}
.jm-animated .jm-sparkle-a { animation: jm-twinkle 4.4s ease-in-out infinite; }
.jm-animated .jm-sparkle-b { animation: jm-twinkle 5.6s ease-in-out infinite 1.1s; }
.jm-animated .jm-sparkle-c { animation: jm-twinkle 6.8s ease-in-out infinite 2.3s; }

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
/* Мехурчетата ДРЕЙФАТ, не изчезват: цял план, който избледнява до нула, изпразва желето и
   после изпуква обратно. Ниска амплитуда, непрозрачността никога не пада под 0.55. */
@keyframes jm-rise {
  0%, 100% { transform: translateY(7px); opacity: 0.55; }
  50% { transform: translateY(-7px); opacity: 1; }
}
/* Скосяването е в самата анимация: CSS свойството transform замества SVG атрибута transform,
   а не се добавя към него — без skewX тук лентата би се изправила при първия кадър. */
@keyframes jm-sweep {
  0%, 62% { transform: translateX(0) skewX(-14deg); }
  100% { transform: translateX(760px) skewX(-14deg); }
}
@keyframes jm-twinkle {
  0%, 70%, 100% { transform: scale(0.85); opacity: 0.5; }
  82% { transform: scale(1.15); opacity: 1; }
}

/* Достъпност (закон в репото, не пожелание): нула движение при prefers-reduced-motion.
   Нищо в анимацията не мига по-бързо от 3 Hz — епилептичен риск няма и при включено движение. */
@media (prefers-reduced-motion: reduce) {
  .jm-animated .jm-root,
  .jm-animated .jm-bloom,
  .jm-animated .jm-core,
  .jm-animated .jm-eyes,
  .jm-animated .jm-tassel-bob,
  .jm-animated .jm-bubbles-near,
  .jm-animated .jm-bubbles-mid,
  .jm-animated .jm-bubbles-far,
  .jm-animated .jm-shimmer,
  .jm-animated .jm-sparkle-a,
  .jm-animated .jm-sparkle-b,
  .jm-animated .jm-sparkle-c {
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
        <radialGradient id={`${uid}-body`} cx="36%" cy="24%" r="86%">
          <stop offset="0%" stopColor="var(--jm-pale, #C8DDA6)"/>
          <stop offset="16%" stopColor="var(--jm-olive, #99E72A)"/>
          <stop offset="52%" stopColor="var(--jm-neon, #5AB60D)"/>
          <stop offset="86%" stopColor="var(--jm-bottle, #297F04)"/>
          <stop offset="100%" stopColor="var(--jm-deep, #0D4A02)"/>
        </radialGradient>

        {/* Вътрешна емисия — най-силна в долната половина („свети отвътре", не отгоре). */}
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="1"/>
          <stop offset="42%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>

        {/* Подсветка под тялото (underglow) — лежи на пода зад силуета. */}
        <radialGradient id={`${uid}-underglow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.6"/>
          <stop offset="45%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>

        {/* Каустика на пода: светлината, минала през желето, се фокусира в ярко петно под него. */}
        <radialGradient id={`${uid}-caustic-pool`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.85"/>
          <stop offset="35%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0"/>
        </radialGradient>

        {/* Rim light: нула отгоре-вляво, ярък кант долу-вдясно. */}
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0"/>
          <stop offset="0.42" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.05"/>
          <stop offset="1" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.95"/>
        </linearGradient>

        {/* Гелов блик по темето: остър горе, стопен надолу. */}
        <linearGradient id={`${uid}-gloss`} x1="0.2" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.5"/>
          <stop offset="0.55" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.1"/>
          <stop offset="1" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0"/>
        </linearGradient>

        {/* Стъклото на очилата: студен отблясък отгоре, прозрачно надолу. */}
        <linearGradient id={`${uid}-glass`} x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.34"/>
          <stop offset="0.45" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.06"/>
          <stop offset="1" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.02"/>
        </linearGradient>

        {/* Хоризонтална лента, която минава през тялото (движещ се отблясък). */}
        <linearGradient id={`${uid}-shimmer`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0"/>
          <stop offset="0.5" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.5"/>
          <stop offset="1" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0"/>
        </linearGradient>

        {/* Шапка: горната плоскост хваща светлина, ръбът е по-тъмен. */}
        <linearGradient id={`${uid}-board`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="var(--jm-soft-olive, #848D68)" stopOpacity="0.55"/>
          <stop offset="0.35" stopColor="var(--jm-ink-soft, #2A2E24)"/>
          <stop offset="1" stopColor="var(--jm-ink, #0A0C0A)"/>
        </linearGradient>
        <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jm-ink-soft, #2A2E24)"/>
          <stop offset="1" stopColor="var(--jm-ink, #0A0C0A)"/>
        </linearGradient>
        {/* Метал: тъмен → остър светъл кант → тъмен. Един стоп прави разликата „жълто" ↔ „злато". */}
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" stopColor="var(--jm-gold, #D9A521)"/>
          <stop offset="0.3" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="0.42" stopColor="var(--jm-white, #FFFFFF)"/>
          <stop offset="0.58" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="1" stopColor="var(--jm-gold, #D9A521)"/>
        </linearGradient>

        {/* Отражението в пода: силно до контакта, нула надолу. */}
        <linearGradient id={`${uid}-floor-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.55"/>
          <stop offset="0.55" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.08"/>
          <stop offset="1" stopColor="var(--jm-mask-black, #000000)"/>
        </linearGradient>
        <mask id={`${uid}-floor`}>
          <rect x="0" y="452" width="512" height="120" fill={`url(#${uid}-floor-fade)`}/>
        </mask>

        {/* Мек преход, за да не оставя долният кант хоризонтален шев по тялото. */}
        <linearGradient id={`${uid}-bottom-fade`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0.45" stopColor="var(--jm-mask-black, #000000)"/>
          <stop offset="0.85" stopColor="var(--jm-white, #FFFFFF)"/>
        </linearGradient>
        <mask id={`${uid}-bottom`}>
          <rect x="0" y="0" width="512" height="512" fill={`url(#${uid}-bottom-fade)`}/>
        </mask>

        {/* Силуетът: НЕ кръг. Леко яйцевидно тяло с тежка основа и едва забележим наклон наляво —
             кръгът е анонимен, а разпознаваемостта на маскот се крепи първо на силуета. */}
        <clipPath id={`${uid}-clip`}>
          <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z"/>
        </clipPath>

        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16"/>
        </filter>
        <filter id={`${uid}-soft-s`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7"/>
        </filter>
        <filter id={`${uid}-soft-xs`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5"/>
        </filter>

        {/*
          Геловият вид не идва от още един бял елипс отгоре, а от РЕАЛНО осветление: размиваме
          алфата в псевдо-релеф и пускаме огледален източник по него (feSpecularLighting), после
          режем блясъка по силуета и го добавяме върху цвета. Накрая слагаме едва доловимо зърно —
          това е разликата между „плосък вектор" и кадър, който окото чете като заснет материал.
        */}
        <filter id={`${uid}-gel`} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="20" result="jm-relief"/>
          <feSpecularLighting in="jm-relief" surfaceScale="3" specularConstant="1.1" specularExponent="90" lightingColor="#C8DDA6" result="jm-spec">
            <fePointLight x="120" y="70" z="170"/>
          </feSpecularLighting>
          <feComposite in="jm-spec" in2="SourceAlpha" operator="in" result="jm-spec-cut"/>
          <feComposite in="SourceGraphic" in2="jm-spec-cut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="jm-lit"/>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="jm-noise"/>
          <feColorMatrix in="jm-noise" type="saturate" values="0" result="jm-grain"/>
          <feComposite in="jm-grain" in2="SourceAlpha" operator="in" result="jm-grain-cut"/>
          <feComposite in="jm-lit" in2="jm-grain-cut" operator="arithmetic" k1="0" k2="1" k3="0.09" k4="-0.045"/>
        </filter>

        {/*
          Каустики: фрактален шум, изместен през себе си. Дава неравномерната вътрешна плътност на
          желето — това, което различава течен материал от плътен цвят. Държи се на много ниска
          непрозрачност; целта е усещане, не текстура.
        */}
        <filter id={`${uid}-caustics`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="3" seed="7" result="jm-noise"/>
          <feDisplacementMap in="SourceGraphic" in2="jm-noise" scale="46" xChannelSelector="R" yChannelSelector="G"/>
          <feGaussianBlur stdDeviation="5"/>
        </filter>
      </defs>

      <g className="jm-root">
        {/* 0. Отражение в пода — герой-кадърът стъпва на лъскава повърхност, не виси в нищото. */}
        <g className="jm-floor" mask={`url(#${uid}-floor)`} opacity="0.7">
          <g transform="translate(0 904) scale(1 -1)">
            <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill={`url(#${uid}-body)`} filter={`url(#${uid}-soft-s)`}/>
          </g>
        </g>

        {/* 1. Контактна сянка, каустично петно и подсветка (зад всичко). */}
        <ellipse cx="254" cy="452" rx="122" ry="20" fill="var(--jm-mask-black, #000000)" opacity="0.8" filter={`url(#${uid}-soft-s)`}/>
        <ellipse className="jm-glow" cx="254" cy="452" rx="176" ry="44" fill={`url(#${uid}-underglow)`} filter={`url(#${uid}-soft)`}/>
        <ellipse className="jm-caustic" cx="254" cy="456" rx="96" ry="17" fill={`url(#${uid}-caustic-pool)`} filter={`url(#${uid}-soft-s)`}/>
        <path className="jm-bloom" d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="var(--jm-neon, #5AB60D)" opacity="0.45" filter={`url(#${uid}-soft)`}/>

        {/* 2. Ръчички — зад тялото, за да „излизат" от него; с кант отдолу, за да не са плоски. */}
        <g className="jm-arms">
          <g stroke={`url(#${uid}-body)`} strokeWidth="34" strokeLinecap="round" fill="none">
            <path d="M144 356C120 368 102 384 94 400"/>
            <path d="M368 356C392 368 410 384 418 400"/>
          </g>
          <g stroke="var(--jm-olive, #99E72A)" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.5">
            <path d="M138 372C118 382 104 394 98 406"/>
            <path d="M374 372C394 382 408 394 414 406"/>
          </g>
        </g>

        {/* 3. Тяло — с геловото осветление и зърното. */}
        <path className="jm-body" d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill={`url(#${uid}-body)`} filter={`url(#${uid}-gel)`}/>

        {/* 4. Вътрешност — всичко изрязано по силуета. */}
        <g clipPath={`url(#${uid}-clip)`}>
          {/* Вътрешна сянка по ръба: желето е плътно по контура и светло в средата — това,
               а не бликът отгоре, е което разчита окото като „полупрозрачно". */}
          <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="none" stroke="var(--jm-deep, #0D4A02)" strokeWidth="40" opacity="0.45" filter={`url(#${uid}-soft-s)`}/>

          <ellipse className="jm-core" cx="254" cy="376" rx="150" ry="118" fill={`url(#${uid}-core)`}/>
          <ellipse className="jm-core" cx="250" cy="404" rx="90" ry="58" fill={`url(#${uid}-core)`} opacity="0.75"/>

          {/* Каустики — неравномерна вътрешна плътност. */}
          <g className="jm-caustics" opacity="0.3" filter={`url(#${uid}-caustics)`}>
            <ellipse cx="246" cy="360" rx="116" ry="90" fill="var(--jm-olive, #99E72A)"/>
            <ellipse cx="298" cy="296" rx="52" ry="42" fill="var(--jm-pale, #C8DDA6)" opacity="0.5"/>
          </g>

          {/* Пречупване: светлината, влязла отдолу, се събира в тънка дъга по вътрешната стена. */}
          <path d="M148 388C186 432 322 432 360 388" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="7" opacity="0.32" filter={`url(#${uid}-soft-xs)`}/>

          {/* Сянка от шапката върху темето. */}
          <ellipse cx="254" cy="140" rx="92" ry="22" fill="var(--jm-deep, #0D4A02)" opacity="0.45" filter={`url(#${uid}-soft-s)`}/>

          {/* Мехурчета в три плана: далечните са размити и бледи, близките — остри, с тъмна дъга
               отгоре и светла отдолу (така пречупва истинско мехурче). Еднакво остри мехурчета
               изглеждат като точки ВЪРХУ топка, не като обем В желе. */}
          <g className="jm-bubbles">
            <g className="jm-bubbles-far" opacity="0.4" filter={`url(#${uid}-soft-xs)`}>
              <circle cx="152" cy="272" r="7" fill="var(--jm-pale, #C8DDA6)" opacity="0.35"/>
              <circle cx="362" cy="270" r="5" fill="var(--jm-pale, #C8DDA6)" opacity="0.3"/>
              <ellipse cx="318" cy="302" rx="10" ry="8" fill="var(--jm-pale, #C8DDA6)" opacity="0.3"/>
              <circle cx="228" cy="302" r="5" fill="var(--jm-pale, #C8DDA6)" opacity="0.3"/>
              <circle cx="198" cy="356" r="6" fill="var(--jm-pale, #C8DDA6)" opacity="0.32"/>
              <ellipse cx="292" cy="430" rx="9" ry="7" fill="var(--jm-pale, #C8DDA6)" opacity="0.3"/>
              <circle cx="166" cy="410" r="4" fill="var(--jm-pale, #C8DDA6)" opacity="0.28"/>
            </g>
            <g className="jm-bubbles-mid">
              <circle cx="214" cy="392" r="8" fill="var(--jm-pale, #C8DDA6)" opacity="0.16"/>
              <circle cx="214" cy="392" r="8" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.6" opacity="0.5"/>
              <circle cx="211" cy="389" r="2.4" fill="var(--jm-white, #FFFFFF)" opacity="0.7"/>
              <ellipse cx="328" cy="356" rx="12" ry="10" fill="var(--jm-pale, #C8DDA6)" opacity="0.16"/>
              <ellipse cx="328" cy="356" rx="12" ry="10" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.5"/>
              <circle cx="324" cy="352" r="3" fill="var(--jm-white, #FFFFFF)" opacity="0.7"/>
              <circle cx="344" cy="404" r="6" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.4" opacity="0.45"/>
              <circle cx="164" cy="386" r="5" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.3" opacity="0.45"/>
              <circle cx="270" cy="352" r="2.4" fill="var(--jm-white, #FFFFFF)" opacity="0.55"/>
              <circle cx="238" cy="332" r="2" fill="var(--jm-white, #FFFFFF)" opacity="0.45"/>
            </g>
            <g className="jm-bubbles-near">
              <circle cx="180" cy="330" r="12" fill="var(--jm-pale, #C8DDA6)" opacity="0.14"/>
              <circle cx="180" cy="330" r="12" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.4" opacity="0.6"/>
              <path d="M170 335C173 344 187 344 190 335" fill="none" stroke="var(--jm-white, #FFFFFF)" strokeWidth="2.6" strokeLinecap="round" opacity="0.7"/>
              <circle cx="175" cy="325" r="3.4" fill="var(--jm-white, #FFFFFF)" opacity="0.85"/>
              <circle cx="246" cy="420" r="15" fill="var(--jm-pale, #C8DDA6)" opacity="0.14"/>
              <circle cx="246" cy="420" r="15" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.6" opacity="0.6"/>
              <path d="M234 426C238 437 254 437 258 426" fill="none" stroke="var(--jm-white, #FFFFFF)" strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
              <circle cx="240" cy="414" r="4.2" fill="var(--jm-white, #FFFFFF)" opacity="0.85"/>
              <circle cx="298" cy="398" r="9" fill="var(--jm-pale, #C8DDA6)" opacity="0.14"/>
              <circle cx="298" cy="398" r="9" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.55"/>
              <circle cx="294" cy="394" r="2.8" fill="var(--jm-white, #FFFFFF)" opacity="0.8"/>
            </g>
          </g>

          {/* Долният ръб хваща подсветката — топъл лаймов кант отдолу. */}
          <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="20" opacity="1" filter={`url(#${uid}-soft-s)`} mask={`url(#${uid}-bottom)`}/>

          {/* Гелов блик по темето — форма на капка, не елипса; следва извивката на тялото. */}
          <path className="jm-gloss" d="M152 232C156 184 200 146 246 144C260 143 268 150 264 158C256 172 216 184 192 216C178 236 174 256 164 258C154 260 150 250 152 232Z" fill={`url(#${uid}-gloss)`}/>
          <ellipse cx="170" cy="188" rx="15" ry="9" fill="var(--jm-white, #FFFFFF)" opacity="0.75" transform="rotate(-34 170 188)"/>

          {/* Бузи: топлото светене под очите прави лицето живо, а не залепено върху топка. */}
          <g className="jm-cheeks" filter={`url(#${uid}-soft-s)`} opacity="0.5">
            <ellipse cx="166" cy="330" rx="30" ry="16" fill="var(--jm-olive, #99E72A)"/>
            <ellipse cx="348" cy="330" rx="30" ry="16" fill="var(--jm-olive, #99E72A)"/>
          </g>

          {/* Движещ се отблясък по повърхността (мърда само при .jm-animated). */}
          <rect className="jm-shimmer" x="-260" y="110" width="150" height="370" fill={`url(#${uid}-shimmer)`} opacity="0.35" transform="skewX(-14)"/>

          {/* Тъмен контур по долния десен ръб — дава обем на желето. */}
          <ellipse cx="364" cy="412" rx="96" ry="70" fill="var(--jm-deep, #0D4A02)" opacity="0.16" filter={`url(#${uid}-soft)`}/>
        </g>

        {/* 5. Кантове: топъл долу-вдясно (главният) и студен горе-вляво (трета светлина). */}
        <path d="M112 268C120 190 172 126 252 126C288 126 318 138 342 158" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="4" strokeLinecap="round" opacity="0.45" filter={`url(#${uid}-soft-xs)`}/>
        <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="5"/>

        {/* 6. Лице. */}
        <g className="jm-face">
          {/* Вежди. */}
          <g stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round" fill="none">
            <path d="M166 208C184 196 208 194 226 200"/>
            <path d="M346 208C328 196 304 194 286 200"/>
          </g>

          {/* Очи: бяло със сянка от рамката отгоре, зеница с ирисов пръстен и правоъгълен
               отблясък от софтбокс — кръглите блясъци четат като рисунка, правоъгълните като кадър. */}
          <g className="jm-eyes">
            <circle cx="200" cy="272" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="310" cy="272" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <g opacity="0.35" filter={`url(#${uid}-soft-xs)`}>
              <path d="M170 260C180 246 220 246 230 260" fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="9"/>
              <path d="M280 260C290 246 330 246 340 260" fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="9"/>
            </g>
            <circle cx="202" cy="276" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="312" cy="276" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <g fill="none" stroke="var(--jm-neon, #5AB60D)" strokeWidth="3" opacity="0.55">
              <circle cx="202" cy="276" r="18"/>
              <circle cx="312" cy="276" r="18"/>
            </g>
            <g fill="var(--jm-white, #FFFFFF)">
              <rect x="185" y="256" width="17" height="12" rx="5" transform="rotate(-24 193 262)"/>
              <rect x="295" y="256" width="17" height="12" rx="5" transform="rotate(-24 303 262)"/>
              <circle cx="211" cy="287" r="4" opacity="0.7"/>
              <circle cx="321" cy="287" r="4" opacity="0.7"/>
            </g>
          </g>

          {/* Очила: стъкло с отблясък, дебела рамка с горен кант, сянка под нея и зелен отскок
               отдолу — черното не е дупка, то също получава светлина от тялото. */}
          <g className="jm-glasses">
            <circle cx="200" cy="272" r="48" fill={`url(#${uid}-glass)`}/>
            <circle cx="310" cy="272" r="48" fill={`url(#${uid}-glass)`}/>
            <g fill="none" stroke="var(--jm-mask-black, #000000)" strokeWidth="13" opacity="0.35" filter={`url(#${uid}-soft-xs)`} transform="translate(0 5)">
              <circle cx="200" cy="272" r="48"/>
              <circle cx="310" cy="272" r="48"/>
            </g>
            <g fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="13" strokeLinecap="round">
              <circle cx="200" cy="272" r="48"/>
              <circle cx="310" cy="272" r="48"/>
              <path d="M248 266C252 259 258 259 262 266"/>
              <path d="M152 260C138 252 126 250 114 252"/>
              <path d="M358 260C372 252 384 250 396 252"/>
            </g>
            <g fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <path d="M164 240C176 230 190 226 204 226"/>
              <path d="M274 240C286 230 300 226 314 226"/>
            </g>
            <g fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="3" strokeLinecap="round" opacity="0.45">
              <path d="M170 304C180 314 196 320 212 320"/>
              <path d="M280 304C290 314 306 320 322 320"/>
            </g>
            <g stroke="var(--jm-white, #FFFFFF)" strokeLinecap="round" fill="none">
              <path d="M172 256L192 236" strokeWidth="9" opacity="0.55"/>
              <path d="M182 268L196 254" strokeWidth="4" opacity="0.4"/>
              <path d="M282 256L302 236" strokeWidth="9" opacity="0.55"/>
              <path d="M292 268L306 254" strokeWidth="4" opacity="0.4"/>
            </g>
          </g>

          {/* Усмивка с мек отблясък отдолу (устата е вдлъбнатина, не линия). */}
          <path d="M234 332C242 346 266 346 274 332" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round"/>
          <path d="M238 342C244 350 264 350 270 342" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="4" strokeLinecap="round" opacity="0.45"/>
        </g>

        {/* 7. Папийонка — с гънки, сатенен блясък и зелен отскок по горния ръб. */}
        <g className="jm-bowtie">
          <g filter={`url(#${uid}-soft-xs)`} opacity="0.5">
            <path d="M248 408C232 394 218 384 206 383C200 396 200 420 206 433C218 432 232 422 248 408Z" fill="var(--jm-mask-black, #000000)"/>
            <path d="M260 408C276 394 290 384 302 383C308 396 308 420 302 433C290 432 276 422 260 408Z" fill="var(--jm-mask-black, #000000)"/>
          </g>
          <path d="M248 404C232 390 218 380 206 379C200 392 200 416 206 429C218 428 232 418 248 404Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M260 404C276 390 290 380 302 379C308 392 308 416 302 429C290 428 276 418 260 404Z" fill="var(--jm-ink, #0A0C0A)"/>
          <g fill="none" stroke="var(--jm-ink-soft, #2A2E24)" strokeWidth="3.5" strokeLinecap="round">
            <path d="M212 387C218 395 220 409 218 420"/>
            <path d="M296 387C290 395 288 409 290 420"/>
            <path d="M226 390C231 397 232 410 230 418"/>
            <path d="M282 390C277 397 276 410 278 418"/>
          </g>
          <g fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
            <path d="M244 400C236 394 224 386 212 383"/>
            <path d="M264 400C272 394 284 386 296 383"/>
          </g>
          <rect x="244" y="393" width="20" height="22" rx="7" fill={`url(#${uid}-band)`}/>
          <path d="M248 396C248 404 248 408 248 412" fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <path d="M248 404C232 390 218 380 206 379C200 392 200 416 206 429C218 428 232 418 248 404ZM260 404C276 390 290 380 302 379C308 392 308 416 302 429C290 428 276 418 260 404Z" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.6" opacity="0.3"/>
        </g>

        {/* 8. Академична шапка — дебелина на дъската, сатен по плата, зелен отскок по долния ръб
             (тялото свети НАГОРЕ към шапката) и пискюл от нишки с метален кант. */}
        <g className="jm-cap" transform="translate(0 10) rotate(-6 254 108)">
          <ellipse cx="254" cy="118" rx="66" ry="26" fill={`url(#${uid}-band)`}/>
          <path d="M196 124C212 136 296 136 312 124" fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="2.5" opacity="0.35"/>
          <path d="M198 132C214 142 294 142 310 132" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="3" opacity="0.4"/>
          <path d="M254 60L388 98L254 136L120 98Z" fill="var(--jm-ink, #0A0C0A)" transform="translate(0 10)"/>
          <path d="M120 98L254 136L388 98L388 108L254 146L120 108Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M120 108L254 146L254 136L120 98Z" fill="var(--jm-olive, #99E72A)" opacity="0.12"/>
          <path d="M254 60L388 98L254 136L120 98Z" fill={`url(#${uid}-board)`}/>
          <path d="M254 60L388 98L254 104L120 98Z" fill="var(--jm-soft-olive, #848D68)" opacity="0.16"/>
          <path d="M254 60L388 98" fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="2" opacity="0.5"/>
          <path d="M120 98L254 60" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.35"/>
          <circle cx="254" cy="98" r="6" fill="var(--jm-ink-soft, #2A2E24)"/>
          <circle cx="252" cy="96" r="2" fill="var(--jm-soft-olive, #848D68)" opacity="0.8"/>
          <path d="M254 98C298 104 338 106 370 100" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
          <path d="M254 98C298 104 338 106 370 100" fill="none" stroke="var(--jm-white, #FFFFFF)" strokeWidth="1.6" strokeLinecap="round" opacity="0.45"/>
          <g className="jm-tassel">
            <path d="M370 100C376 122 376 144 372 160" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
            <g className="jm-tassel-bob">
              <path d="M360 156H384L378 194C376 200 368 200 366 194Z" fill={`url(#${uid}-gold)`}/>
              <g stroke="var(--jm-gold, #D9A521)" strokeWidth="1.4" opacity="0.75" fill="none">
                <path d="M366 160L365 192"/>
                <path d="M372 160L372 194"/>
                <path d="M378 160L379 192"/>
              </g>
              <path d="M368 160L367 192" fill="none" stroke="var(--jm-white, #FFFFFF)" strokeWidth="1.2" opacity="0.5"/>
              <rect x="359" y="153" width="26" height="8" rx="4" fill={`url(#${uid}-gold)`}/>
            </g>
          </g>
        </g>

        {/* 9. Искри — три малки блясъка, които правят кадъра „скъп". */}
        <g className="jm-sparkles" fill="var(--jm-pale, #C8DDA6)">
          <path className="jm-sparkle-a" d="M416 176C418 190 421 193 434 196C421 199 418 202 416 216C414 202 411 199 398 196C411 193 414 190 416 176Z" opacity="0.85"/>
          <path className="jm-sparkle-b" d="M74 336C75 345 77 347 86 349C77 351 75 353 74 362C73 353 71 351 62 349C71 347 73 345 74 336Z" opacity="0.6"/>
          <path className="jm-sparkle-c" d="M330 132C331 139 333 141 340 142C333 144 331 146 330 153C329 146 327 144 320 142C327 141 329 139 330 132Z" opacity="0.5"/>
        </g>
      </g>
    </>
  );
}

function Medium({ uid }: TierProps) {
  return (
    <>
      {/* Ниво „средно": нула `filter` елементи (блурът не оцелява във всеки векторен конвейер и
           поскъпва растеризацията). Обемът се строи само с градиенти — меките преходи, които при
           пълното ниво идват от блур, тук са направени със стопове до нула. Силуетът, лицето и
           аксесоарите са същите като при пълното ниво: маскотът е един и същ, не роднина. */}
      <defs>
        <radialGradient id={`${uid}-body`} cx="36%" cy="24%" r="86%">
          <stop offset="0%" stopColor="var(--jm-pale, #C8DDA6)"/>
          <stop offset="16%" stopColor="var(--jm-olive, #99E72A)"/>
          <stop offset="52%" stopColor="var(--jm-neon, #5AB60D)"/>
          <stop offset="86%" stopColor="var(--jm-bottle, #297F04)"/>
          <stop offset="100%" stopColor="var(--jm-deep, #0D4A02)"/>
        </radialGradient>
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.9"/>
          <stop offset="45%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>
        {/* Вътрешната сянка по ръба без блур: пръстеновиден градиент, стопен навътре. */}
        <radialGradient id={`${uid}-edge`} cx="50%" cy="50%" r="50%">
          <stop offset="0.62" stopColor="var(--jm-deep, #0D4A02)" stopOpacity="0"/>
          <stop offset="0.88" stopColor="var(--jm-deep, #0D4A02)" stopOpacity="0.34"/>
          <stop offset="1" stopColor="var(--jm-deep, #0D4A02)" stopOpacity="0.6"/>
        </radialGradient>
        <linearGradient id={`${uid}-gloss`} x1="0.2" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.62"/>
          <stop offset="0.55" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.12"/>
          <stop offset="1" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0"/>
          <stop offset="0.42" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.05"/>
          <stop offset="1" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.9"/>
        </linearGradient>
        <linearGradient id={`${uid}-glass`} x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.3"/>
          <stop offset="0.45" stopColor="var(--jm-pale, #C8DDA6)" stopOpacity="0.05"/>
          <stop offset="1" stopColor="var(--jm-white, #FFFFFF)" stopOpacity="0.02"/>
        </linearGradient>
        <linearGradient id={`${uid}-board`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="var(--jm-soft-olive, #848D68)" stopOpacity="0.5"/>
          <stop offset="0.35" stopColor="var(--jm-ink-soft, #2A2E24)"/>
          <stop offset="1" stopColor="var(--jm-ink, #0A0C0A)"/>
        </linearGradient>
        <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--jm-ink-soft, #2A2E24)"/>
          <stop offset="1" stopColor="var(--jm-ink, #0A0C0A)"/>
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0.45" y2="1">
          <stop offset="0" stopColor="var(--jm-gold, #D9A521)"/>
          <stop offset="0.3" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="0.42" stopColor="var(--jm-white, #FFFFFF)"/>
          <stop offset="0.58" stopColor="var(--jm-gold-light, #F2D479)"/>
          <stop offset="1" stopColor="var(--jm-gold, #D9A521)"/>
        </linearGradient>
        {/* Контактната сянка и подсветката без блур: градиенти до прозрачно. */}
        <radialGradient id={`${uid}-contact`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--jm-mask-black, #000000)" stopOpacity="0.7"/>
          <stop offset="0.6" stopColor="var(--jm-mask-black, #000000)" stopOpacity="0.28"/>
          <stop offset="1" stopColor="var(--jm-mask-black, #000000)" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`${uid}-underglow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--jm-olive, #99E72A)" stopOpacity="0.5"/>
          <stop offset="45%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="var(--jm-neon, #5AB60D)" stopOpacity="0"/>
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z"/>
        </clipPath>
      </defs>

      <g className="jm-root">
        <ellipse cx="254" cy="452" rx="136" ry="24" fill={`url(#${uid}-contact)`}/>
        <ellipse className="jm-glow" cx="254" cy="450" rx="172" ry="40" fill={`url(#${uid}-underglow)`}/>

        <g className="jm-arms">
          <g stroke={`url(#${uid}-body)`} strokeWidth="34" strokeLinecap="round" fill="none">
            <path d="M144 356C120 368 102 384 94 400"/>
            <path d="M368 356C392 368 410 384 418 400"/>
          </g>
          <g stroke="var(--jm-olive, #99E72A)" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.5">
            <path d="M138 372C118 382 104 394 98 406"/>
            <path d="M374 372C394 382 408 394 414 406"/>
          </g>
        </g>

        <path className="jm-body" d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill={`url(#${uid}-body)`}/>

        <g clipPath={`url(#${uid}-clip)`}>
          <ellipse cx="254" cy="376" rx="150" ry="118" fill={`url(#${uid}-core)`}/>
          <ellipse cx="250" cy="404" rx="90" ry="58" fill={`url(#${uid}-core)`} opacity="0.7"/>
          <ellipse cx="256" cy="292" rx="152" ry="164" fill={`url(#${uid}-edge)`}/>

          <g className="jm-bubbles">
            <circle cx="180" cy="330" r="12" fill="var(--jm-pale, #C8DDA6)" opacity="0.14"/>
            <circle cx="180" cy="330" r="12" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.4" opacity="0.6"/>
            <circle cx="175" cy="325" r="3.4" fill="var(--jm-white, #FFFFFF)" opacity="0.85"/>
            <circle cx="246" cy="420" r="15" fill="var(--jm-pale, #C8DDA6)" opacity="0.14"/>
            <circle cx="246" cy="420" r="15" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2.6" opacity="0.6"/>
            <circle cx="240" cy="414" r="4.2" fill="var(--jm-white, #FFFFFF)" opacity="0.85"/>
            <circle cx="298" cy="398" r="9" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.55"/>
            <ellipse cx="328" cy="356" rx="12" ry="10" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.5"/>
            <circle cx="214" cy="392" r="8" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.6" opacity="0.5"/>
            <circle cx="344" cy="404" r="6" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="1.4" opacity="0.45"/>
          </g>

          <path className="jm-gloss" d="M152 232C156 184 200 146 246 144C260 143 268 150 264 158C256 172 216 184 192 216C178 236 174 256 164 258C154 260 150 250 152 232Z" fill={`url(#${uid}-gloss)`}/>
          <ellipse cx="170" cy="188" rx="15" ry="9" fill="var(--jm-white, #FFFFFF)" opacity="0.7" transform="rotate(-34 170 188)"/>
        </g>

        <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="5"/>

        <g className="jm-face">
          <g stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round" fill="none">
            <path d="M166 208C184 196 208 194 226 200"/>
            <path d="M346 208C328 196 304 194 286 200"/>
          </g>
          <g className="jm-eyes">
            <circle cx="200" cy="272" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="310" cy="272" r="34" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="202" cy="276" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="312" cy="276" r="21" fill="var(--jm-ink, #0A0C0A)"/>
            <g fill="none" stroke="var(--jm-neon, #5AB60D)" strokeWidth="3" opacity="0.55">
              <circle cx="202" cy="276" r="18"/>
              <circle cx="312" cy="276" r="18"/>
            </g>
            <g fill="var(--jm-white, #FFFFFF)">
              <rect x="185" y="256" width="17" height="12" rx="5" transform="rotate(-24 193 262)"/>
              <rect x="295" y="256" width="17" height="12" rx="5" transform="rotate(-24 303 262)"/>
              <circle cx="211" cy="287" r="4" opacity="0.7"/>
              <circle cx="321" cy="287" r="4" opacity="0.7"/>
            </g>
          </g>
          <g className="jm-glasses">
            <circle cx="200" cy="272" r="48" fill={`url(#${uid}-glass)`}/>
            <circle cx="310" cy="272" r="48" fill={`url(#${uid}-glass)`}/>
            <g fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="13" strokeLinecap="round">
              <circle cx="200" cy="272" r="48"/>
              <circle cx="310" cy="272" r="48"/>
              <path d="M248 266C252 259 258 259 262 266"/>
              <path d="M152 260C138 252 126 250 114 252"/>
              <path d="M358 260C372 252 384 250 396 252"/>
            </g>
            <g fill="none" stroke="var(--jm-soft-olive, #848D68)" strokeWidth="3" strokeLinecap="round" opacity="0.7">
              <path d="M164 240C176 230 190 226 204 226"/>
              <path d="M274 240C286 230 300 226 314 226"/>
            </g>
            <g fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="3" strokeLinecap="round" opacity="0.45">
              <path d="M170 304C180 314 196 320 212 320"/>
              <path d="M280 304C290 314 306 320 322 320"/>
            </g>
            <g stroke="var(--jm-white, #FFFFFF)" strokeLinecap="round" fill="none">
              <path d="M172 256L192 236" strokeWidth="9" opacity="0.55"/>
              <path d="M282 256L302 236" strokeWidth="9" opacity="0.55"/>
            </g>
          </g>
          <path d="M234 332C242 346 266 346 274 332" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="9" strokeLinecap="round"/>
          <path d="M238 342C244 350 264 350 270 342" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="4" strokeLinecap="round" opacity="0.45"/>
        </g>

        <g className="jm-bowtie">
          <path d="M248 404C232 390 218 380 206 379C200 392 200 416 206 429C218 428 232 418 248 404Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M260 404C276 390 290 380 302 379C308 392 308 416 302 429C290 428 276 418 260 404Z" fill="var(--jm-ink, #0A0C0A)"/>
          <g fill="none" stroke="var(--jm-ink-soft, #2A2E24)" strokeWidth="3.5" strokeLinecap="round">
            <path d="M212 387C218 395 220 409 218 420"/>
            <path d="M296 387C290 395 288 409 290 420"/>
          </g>
          <g fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
            <path d="M244 400C236 394 224 386 212 383"/>
            <path d="M264 400C272 394 284 386 296 383"/>
          </g>
          <rect x="244" y="393" width="20" height="22" rx="7" fill={`url(#${uid}-band)`}/>
        </g>

        <g className="jm-cap" transform="translate(0 10) rotate(-6 254 108)">
          <ellipse cx="254" cy="118" rx="66" ry="26" fill={`url(#${uid}-band)`}/>
          <path d="M198 132C214 142 294 142 310 132" fill="none" stroke="var(--jm-olive, #99E72A)" strokeWidth="3" opacity="0.4"/>
          <path d="M120 98L254 136L388 98L388 108L254 146L120 108Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M254 60L388 98L254 136L120 98Z" fill={`url(#${uid}-board)`}/>
          <path d="M254 60L388 98L254 104L120 98Z" fill="var(--jm-soft-olive, #848D68)" opacity="0.16"/>
          <path d="M120 98L254 60" fill="none" stroke="var(--jm-pale, #C8DDA6)" strokeWidth="2" opacity="0.35"/>
          <circle cx="254" cy="98" r="6" fill="var(--jm-ink-soft, #2A2E24)"/>
          <path d="M254 98C298 104 338 106 370 100" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
          <g className="jm-tassel">
            <path d="M370 100C376 122 376 144 372 160" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="6" strokeLinecap="round"/>
            <g className="jm-tassel-bob">
              <path d="M360 156H384L378 194C376 200 368 200 366 194Z" fill={`url(#${uid}-gold)`}/>
              <rect x="359" y="153" width="26" height="8" rx="4" fill="var(--jm-gold-light, #F2D479)"/>
            </g>
          </g>
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
           удебелени, защото при 16 px тънката линия става сива каша, а не линия.
           Силуетът е СЪЩИЯТ път като при пълното ниво (гейтнато) — само мащабиран, за да запълни
           кадъра: иконата е същият маскот отдалече, не негов роднина. */}
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z"/>
        </clipPath>
      </defs>

      <g className="jm-root" transform="translate(254 289) scale(1.1) translate(-254 -289)">
        <path className="jm-body" d="M252 126C332 126 394 190 402 268C408 328 396 374 366 408C342 436 302 452 254 452C206 452 168 434 144 406C116 372 106 328 112 268C120 190 172 126 252 126Z" fill="var(--jm-neon, #5AB60D)"/>
        <g clipPath={`url(#${uid}-clip)`}>
          <ellipse cx="254" cy="486" rx="190" ry="112" fill="var(--jm-bottle, #297F04)"/>
          <ellipse cx="238" cy="118" rx="150" ry="86" fill="var(--jm-olive, #99E72A)"/>
        </g>

        <g className="jm-face">
          <g className="jm-eyes">
            <circle cx="198" cy="272" r="40" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="314" cy="272" r="40" fill="var(--jm-eye, #F4FAEA)"/>
            <circle cx="200" cy="274" r="27" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="316" cy="274" r="27" fill="var(--jm-ink, #0A0C0A)"/>
            <circle cx="191" cy="265" r="8" fill="var(--jm-white, #FFFFFF)"/>
            <circle cx="307" cy="265" r="8" fill="var(--jm-white, #FFFFFF)"/>
          </g>
          <g className="jm-glasses" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="20" strokeLinecap="round">
            <circle cx="198" cy="272" r="50"/>
            <circle cx="314" cy="272" r="50"/>
            <path d="M248 268H264"/>
            <path d="M148 258L114 252"/>
            <path d="M364 258L398 252"/>
          </g>
          <path d="M232 336C242 354 268 354 278 336" fill="none" stroke="var(--jm-ink, #0A0C0A)" strokeWidth="14" strokeLinecap="round"/>
        </g>

        <g className="jm-bowtie" fill="var(--jm-ink, #0A0C0A)">
          <path d="M246 406L202 380V432L246 406Z"/>
          <path d="M262 406L306 380V432L262 406Z"/>
          <rect x="240" y="392" width="28" height="28" rx="9"/>
        </g>

        <g className="jm-cap" transform="translate(0 6) rotate(-6 254 104)">
          <ellipse cx="254" cy="114" rx="70" ry="26" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M254 54L398 98L254 142L110 98Z" fill="var(--jm-ink, #0A0C0A)"/>
          <path d="M254 98C302 104 342 106 374 98C380 120 380 138 377 152" fill="none" stroke="var(--jm-gold, #D9A521)" strokeWidth="12" strokeLinecap="round"/>
          <rect x="365" y="150" width="24" height="40" rx="12" fill="var(--jm-gold, #D9A521)"/>
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

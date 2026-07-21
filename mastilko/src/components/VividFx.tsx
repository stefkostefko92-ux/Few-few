"use client";

import { useEffect, useState } from "react";

// Слой с ефекти за „живата“ (vivid) тема: анимиран aurora mesh градиент,
// стъклени мастилени КАПКИ (teardrop), които КАПЯТ отгоре надолу и се пръсват в
// сплаш при пода, лека винетка и фин статичен grain. Рендира се САМО когато
// <html> има клас `vivid`; винаги е `no-print`, `pointer-events:none`,
// `position:fixed` и стои ЗАД съдържанието (z-index:-1).
//
// Безопасност: движението е бавно и непрекъснато (капки 23–36s, aurora 34/46s),
// сплашът е мек (без рязък проблясък, opacity ≤ 0.7) → без стробоскоп (епилепсия).
// Reduced-motion гейт НЯМА (решение на собственика) — анимациите в globals.css
// надделяват над глобалния reset чрез специфичност + !important.
//
// Производителност: чисти CSS/SVG анимации (без rAF луп), само transform/opacity
// на композитора, `contain:strict`, `will-change`. Капки — 9 бр.
//
// Форма: класическа мастилена капка — заоблено тяло, изтеглен връх, който сочи
// НАДОЛУ (по посока на движението). Стъкленият вид идва от полупрозрачния син
// градиент, highlight-а (::before), вътрешното сияние (::after), меките сенки и
// лекия backdrop-filter (рефракция на aurora зад капката).

// Капки: позиция, размер (умерен: височина 16–34px, ширина ~0.74×), скорост,
// старт и хоризонтално олюляване. Отрицателен `delay` → екранът е населен веднага.
// `sw` е ширината на сплаша (вълничката) при пода за тази колона.
const DROPS = [
  { left: "6%", h: 30, dur: 26, delay: -5, sway: "3vw", sw: 66 },
  { left: "15%", h: 20, dur: 32, delay: -18, sway: "-2vw", sw: 46 },
  { left: "27%", h: 34, dur: 23, delay: -9, sway: "2vw", sw: 74 },
  { left: "38%", h: 16, dur: 36, delay: -27, sway: "-3vw", sw: 40 },
  { left: "50%", h: 26, dur: 29, delay: -13, sway: "2vw", sw: 58 },
  { left: "61%", h: 22, dur: 34, delay: -3, sway: "-2vw", sw: 50 },
  { left: "72%", h: 32, dur: 25, delay: -20, sway: "3vw", sw: 70 },
  { left: "84%", h: 18, dur: 31, delay: -11, sway: "-2vw", sw: 44 },
  { left: "93%", h: 28, dur: 28, delay: -24, sway: "2vw", sw: 62 },
] as const;

export default function VividFx() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setActive(root.classList.contains("vivid"));
    sync();
    // Реагира на превключване на темата (ThemeToggle сменя класа на <html>).
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="viv-fx no-print" aria-hidden>
      <div className="viv-aurora" />
      <div className="viv-scrim" />
      <div className="viv-drops">
        {DROPS.map((d, i) => (
          <span key={`d${i}`}>
            <span
              className="viv-drop"
              style={{
                left: d.left,
                width: Math.round(d.h * 0.74),
                height: d.h,
                animationDelay: `${d.delay}s`,
                // Скоростта минава през променлива, за да преживее reduced-motion
                // reset-а (виж .viv-drop в globals.css — там е с !important).
                ["--viv-dur" as string]: `${d.dur}s`,
                ["--viv-sway" as string]: d.sway,
              }}
            />
            <span
              className="viv-splash"
              style={{
                left: d.left,
                // `--viv-delay` е inherited → достига псевдо-елементите на сплаша
                // (inline animationDelay НЕ стига до ::before/::after).
                ["--viv-dur" as string]: `${d.dur}s`,
                ["--viv-delay" as string]: `${d.delay}s`,
                ["--viv-sw" as string]: `${d.sw}px`,
              }}
            />
          </span>
        ))}
      </div>
      <div className="viv-grain" />
    </div>
  );
}

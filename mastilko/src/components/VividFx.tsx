"use client";

import { useEffect, useState } from "react";

// Слой с ефекти за „живата“ (vivid) тема: анимиран aurora mesh градиент,
// плаващи мастилени капки с gooey SVG филтър, лека винетка и фин статичен grain.
// Рендира се САМО когато <html> има клас `vivid`; винаги е `no-print`,
// `pointer-events:none`, `position:fixed` и стои ЗАД съдържанието (z-index:-1).
//
// Безопасност: движението е бавно и непрекъснато (капки 24–46s, aurora 34/46s),
// без резки скокове в яркостта → без стробоскоп (епилепсия). Reduced-motion гейт
// НЯМА (решение на собственика) — анимациите в globals.css надделяват над
// глобалния reset чрез специфичност + !important.
//
// Производителност: чисти CSS/SVG анимации (без rAF луп), само transform/opacity
// на композитора, `contain:strict`, `will-change:transform`. Капки — таван 7 бр.

// Капки: позиция, размер, скорост, старт и хоризонтално олюляване.
// Отрицателен `delay` → екранът е населен веднага, без „изникване“.
const DROPS = [
  { left: "8%", size: 46, dur: 32, delay: -6, sway: "-3vw" },
  { left: "22%", size: 30, dur: 42, delay: -20, sway: "2vw" },
  { left: "38%", size: 60, dur: 27, delay: -12, sway: "-2vw" },
  { left: "54%", size: 34, dur: 46, delay: -30, sway: "3vw" },
  { left: "68%", size: 52, dur: 30, delay: -4, sway: "-4vw" },
  { left: "82%", size: 28, dur: 38, delay: -22, sway: "2vw" },
  { left: "93%", size: 42, dur: 35, delay: -15, sway: "-2vw" },
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
      <div className="viv-goo">
        {DROPS.map((d, i) => (
          <span
            key={i}
            className="viv-drop"
            style={{
              left: d.left,
              width: d.size,
              height: d.size,
              animationDelay: `${d.delay}s`,
              // Скоростта минава през променлива, за да преживее reduced-motion reset-а
              // (виж .viv-drop в globals.css — там е с !important).
              ["--viv-dur" as string]: `${d.dur}s`,
              ["--viv-sway" as string]: d.sway,
            }}
          />
        ))}
      </div>
      <div className="viv-grain" />
      {/* Gooey филтърът се прилага върху .viv-goo чрез CSS `filter:url(#viv-goo-f)`. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <defs>
          <filter id="viv-goo-f">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

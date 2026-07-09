"use client";

// Liquid Glass — плъзгачи за целия интерфейс:
// 1) GlassDefs: скрит SVG с displacement филтър за рефракция на фона зад стъклото.
// 2) Глобален pointer тракер: сетва --mx/--my (в проценти) на елементите с клас
//    „glass-lift", за да следва спекуларният блясък курсора.

import { useEffect } from "react";

export function GlassRuntime() {
  useEffect(() => {
    // Kill-switch за слаб POS хардуер: махаме тежката рефракция + анимации.
    if ((navigator.hardwareConcurrency || 2) <= 4) {
      document.documentElement.classList.add("lite-glass");
    }

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(".glass-lift");
      if (!target) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = target.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * 100;
        const my = ((e.clientY - r.top) / r.height) * 100;
        target.style.setProperty("--mx", `${mx}%`);
        target.style.setProperty("--my", `${my}%`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        {/* Фина рефракция: турбулентен шум изкривява фона по краищата на стъклото.
            sRGB интерполация — иначе цветовете „плуват“. Едри вълни (ниска
            честота) = меко изкривяване, не зърнесто мокро стъкло. */}
        <filter
          id="liquid-glass"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.009 0.011"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="16"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

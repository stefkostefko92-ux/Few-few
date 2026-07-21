"use client";

import { useEffect, useState } from "react";

// Преглед „далтонизъм“ — симулира как дизайнът се вижда при цветна слепота
// (протанопия/дейтеранопия/тританопия) чрез SVG feColorMatrix филтър върху
// листа. Само на екран — при печат филтърът пада (виж globals.css). Помощ за
// избор на достъпни цветове, не променя реалния файл.

const MODES = [
  { id: "none", name: "Нормално зрение" },
  { id: "prot", name: "Протанопия (без червено)" },
  { id: "deut", name: "Дейтеранопия (без зелено)" },
  { id: "trit", name: "Тританопия (без синьо)" },
];

const CLASSES = ["cvd-prot", "cvd-deut", "cvd-trit"];

export default function ColorVisionToggle() {
  const [mode, setMode] = useState("none");

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove(...CLASSES);
    if (mode !== "none") el.classList.add(`cvd-${mode}`);
    return () => el.classList.remove(...CLASSES);
  }, [mode]);

  return (
    <>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
        <span className="whitespace-nowrap">Преглед за далтонизъм:</span>
        <select
          className="field-input !w-auto !py-1.5 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          aria-label="Симулация на цветна слепота"
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      {/* Дефиниции на филтрите — веднъж в дървото. Стандартни матрици за
          симулация на дихромазия (Machado/Brettel приближение). */}
      <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
        <defs>
          <filter id="cvd-prot">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cvd-deut">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
          </filter>
          <filter id="cvd-trit">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>
    </>
  );
}

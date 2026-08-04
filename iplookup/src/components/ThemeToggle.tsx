"use client";

import { useEffect, useState } from "react";

const KEY = "carbonip-theme";

/**
 * Превключвател тъмно/светло. Стойността се пази в `localStorage`, а не в
 * бисквитка — така сайтът остава без нито една бисквитка, както обещава
 * политиката за поверителност.
 */
export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  // Първоначалното състояние се чете СЛЕД монтирането: на сървъра няма
  // localStorage и всяко предположение би дало разминаване при хидратация.
  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      // Частен режим без достъп до хранилището — темата важи само за сесията.
    }
  }

  return (
    <button type="button" onClick={toggle} className="btn-ghost px-3 py-2 text-sm" aria-pressed={light}>
      <span aria-hidden="true">{light ? "☀" : "☾"}</span>
      <span>{light ? "Светла" : "Тъмна"}</span>
    </button>
  );
}

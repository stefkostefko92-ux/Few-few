"use client";

import { useEffect, useState } from "react";

// Превключвател на темата: светла → тъмна → жива (vivid) → светла.
// Изборът се помни в localStorage (функционална преференция — без проследяване).
// Бутонът показва иконата на СЛЕДВАЩАТА тема (както досега).
type Theme = "light" | "dark" | "vivid";

const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "vivid",
  vivid: "light",
};

// Икона + надпис за темата, към която ще превключим (за икона и aria-label).
const NEXT_META: Record<Theme, { icon: string; label: string }> = {
  light: { icon: "☀️", label: "Светла тема" },
  dark: { icon: "🌙", label: "Тъмна тема" },
  vivid: { icon: "✨", label: "Жива тема" },
};

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("vivid", theme === "vivid");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("vivid")) setTheme("vivid");
    else if (root.classList.contains("dark")) setTheme("dark");
    else setTheme("light");
  }, []);

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem("mastilko-theme", next === "light" ? "light" : next);
    } catch {
      /* забранено хранилище → просто не помним */
    }
  }

  const meta = NEXT_META[NEXT[theme]];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={meta.label}
      title={meta.label}
      className="rounded-full p-2 text-lg transition hover:bg-tera-pale dark:hover:bg-white/10 vivid:hover:bg-white/10"
    >
      <span aria-hidden>{meta.icon}</span>
    </button>
  );
}

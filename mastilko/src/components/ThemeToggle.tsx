"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

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
const NEXT_META: Record<Theme, { icon: "sun" | "moon" | "sparkles"; label: string }> = {
  light: { icon: "sun", label: "Светла тема" },
  dark: { icon: "moon", label: "Тъмна тема" },
  vivid: { icon: "sparkles", label: "Жива тема" },
};

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("vivid", theme === "vivid");
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Синхронизираме с темата, зададена от anti-flash скрипта върху <html>
    // преди хидратацията — четем DOM класа веднъж при монтиране.
    const root = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      className="rounded-full p-2 text-ink-soft transition hover:bg-tera-pale hover:text-tera-dark dark:hover:bg-white/10 vivid:hover:bg-white/10"
    >
      <Icon name={meta.icon} />
    </button>
  );
}

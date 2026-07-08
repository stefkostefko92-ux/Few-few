"use client";

import { useEffect, useState } from "react";

// Превключвател светла/тъмна тема. Изборът се помни в localStorage
// (функционална преференция — без проследяване).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mastilko-theme", next ? "dark" : "light");
    } catch {
      /* забранено хранилище → просто не помним */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Светла тема" : "Тъмна тема"}
      title={dark ? "Светла тема" : "Тъмна тема"}
      className="rounded-full p-2 text-lg transition hover:bg-tera-pale dark:hover:bg-white/10"
    >
      <span aria-hidden>{dark ? "☀️" : "🌙"}</span>
    </button>
  );
}

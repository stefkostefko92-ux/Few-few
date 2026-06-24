"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";

// Кратък начален екран при първо зареждане в сесията. Затваря се сам и може да
// се пропусне. Уважава „prefers-reduced-motion".
export function IntroSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!SITE.intro.enabled) return;
    try {
      if (sessionStorage.getItem("intro-seen") === "1") return;
      sessionStorage.setItem("intro-seen", "1");
    } catch {
      /* ignore */
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), SITE.intro.seconds * 1000);
    // Достъпност: затваряне с клавиша Escape (за хора с клавиатура).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-brand-800 text-white no-print"
      onClick={() => setShow(false)}
      role="button"
      tabIndex={0}
      aria-label="Затвори началния екран"
    >
      <div className="splash-text text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/dupnitsa-grb.svg"
          alt="Герб на Дупница"
          width={80}
          height={80}
          className="mx-auto mb-4 h-24 w-auto drop-shadow-lg"
        />
        <p className="font-display text-3xl font-extrabold">{SITE.intro.headline}</p>
        <p className="mt-2 text-white/80">{SITE.slogan}</p>
        <p className="mt-6 text-sm text-white/60">(натиснете, за да продължите)</p>
      </div>
    </div>
  );
}

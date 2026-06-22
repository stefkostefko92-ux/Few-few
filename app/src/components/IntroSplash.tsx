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
    return () => clearTimeout(t);
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
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-2xl bg-white/10 font-display text-4xl font-extrabold">
          Д
        </div>
        <p className="font-display text-3xl font-extrabold">{SITE.intro.headline}</p>
        <p className="mt-2 text-white/80">{SITE.slogan}</p>
        <p className="mt-6 text-sm text-white/60">(натиснете, за да продължите)</p>
      </div>
    </div>
  );
}

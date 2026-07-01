// Декоративен фон за hero блока: слоеве от радиални „аврора" петна + фина
// SVG зърнистост за дълбочина. Чист CSS/SVG, без JS и без зависимости.
// Ползва се само от BlockView. aria-hidden — чисто декоративен.
// Движението е зад prefers-reduced-motion guard (клас .pub-aurora в globals.css).

export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Аврора петна — бавно дишат; спират при reduced-motion. */}
      <div
        className="pub-aurora absolute -inset-[20%]"
        style={{
          animation: "pub-aurora 18s ease-in-out infinite",
          background:
            "radial-gradient(38% 44% at 22% 28%, rgba(129,140,248,0.55) 0%, transparent 60%), radial-gradient(34% 40% at 82% 22%, rgba(99,102,241,0.45) 0%, transparent 60%), radial-gradient(46% 50% at 68% 88%, rgba(165,180,252,0.40) 0%, transparent 62%)",
        }}
      />
      {/* Втори, по-бавен слой с изместена фаза за паралакс-усещане. */}
      <div
        className="pub-aurora absolute -inset-[25%]"
        style={{
          animation: "pub-aurora 26s ease-in-out infinite reverse",
          mixBlendMode: "screen",
          background:
            "radial-gradient(30% 36% at 78% 62%, rgba(56,189,248,0.30) 0%, transparent 62%), radial-gradient(30% 34% at 30% 78%, rgba(217,70,239,0.22) 0%, transparent 60%)",
        }}
      />
      {/* Фина зърнистост за дълбочина (SVG turbulence, статична). */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Вътрешен ринг за деликатна дълбочина/дефиниция на ръба. */}
      <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
    </div>
  );
}

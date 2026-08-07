// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — the logo is the full brand artwork (winged sentinel + the
// "SUPREME BOT" wordmark) on a transparent background. Shown whole, never
// cropped, with no box behind it. `size` is the height; width scales with the
// artwork's aspect ratio. Static raster, SSR-safe.

// Реалните размери на артворка. Браузърът пази мястото по тях ОЩЕ преди
// изображението да се е свалило.
//
// ДЕФЕКТЪТ (Скоростника, одит кръг 2, 07.08.2026): `width: "auto"` значи, че
// до момента на зареждане ширината е 0 — целият ред около логото се пренарежда,
// щом файлът (512 kB) пристигне. Логото стои на три места в лендинга, затова
// CLS излизаше 62/100 и сваляше общата оценка на 75. Явните `width`/`height`
// атрибути + `aspect-ratio` резервират кутията от първия кадър.
const LOGO_W = 900;
const LOGO_H = 490;
const LOGO_RATIO = LOGO_W / LOGO_H;

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  const width = Math.round(size * LOGO_RATIO);
  return (
    <img
      src="/logo-full.png"
      alt="Supreme Bot"
      loading="eager"
      decoding="async"
      // Атрибутите (не само стилът) са това, по което браузърът смята
      // съотношението, преди CSS-ът да е приложен.
      width={LOGO_W}
      height={LOGO_H}
      className={`supreme-logo ${className}`}
      style={{
        height: size,
        width,
        aspectRatio: `${LOGO_W} / ${LOGO_H}`,
        filter: "drop-shadow(0 0 10px rgba(143,230,0,0.3))",
      }}
    />
  );
}

/**
 * SupremeWordmark — the wordmark now lives inside the logo artwork itself,
 * so this renders nothing (kept for import compatibility across pages).
 */
export function SupremeWordmark() {
  return null;
}

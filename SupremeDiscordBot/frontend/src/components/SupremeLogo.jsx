// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — the logo is the full brand artwork (winged sentinel + the
// "SUPREME BOT" wordmark) on a transparent background. Shown whole, never
// cropped, with no box behind it. `size` is the height; width scales with the
// artwork's aspect ratio. Static raster, SSR-safe.

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  return (
    <img
      src="/logo-full.png"
      alt="Supreme Bot"
      loading="eager"
      decoding="async"
      className={`supreme-logo ${className}`}
      style={{
        height: size,
        width: "auto",
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

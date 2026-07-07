// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — the logo is the full brand artwork (winged sentinel + the
// "SUPREME BOT" wordmark). Shown whole, never cropped. `size` is the height;
// width scales with the artwork's aspect ratio. Static raster, SSR-safe.

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  return (
    <img
      src="/logo-full.jpg"
      alt="Supreme Bot"
      loading="eager"
      decoding="async"
      className={`supreme-logo ${className}`}
      style={{
        height: size,
        width: "auto",
        borderRadius: Math.round(size * 0.16),
        boxShadow: "0 0 0 1px rgba(240,194,76,0.18), 0 0 18px rgba(240,194,76,0.18)",
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

// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — brand mark is the actual logo artwork (cosmic winged sentinel),
// framed to a rounded square. Static raster, safe in SSR / prerenders.

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt="Supreme Bot"
      loading="eager"
      decoding="async"
      className={`supreme-logo ${animated ? "supreme-logo-animated" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: "22%",
        filter: "drop-shadow(0 0 8px rgba(240, 194, 76, 0.45))",
      }}
    />
  );
}

/**
 * SupremeWordmark — brand text with gold→royal-blue gradient (matches the logo)
 */
export function SupremeWordmark({ className = "" }) {
  return (
    <span className={`supreme-wordmark font-display font-black tracking-tight-3 ${className}`}>
      <span className="supreme-wordmark-supreme">SUPREME</span>
      <span className="supreme-wordmark-bot">BOT</span>
    </span>
  );
}

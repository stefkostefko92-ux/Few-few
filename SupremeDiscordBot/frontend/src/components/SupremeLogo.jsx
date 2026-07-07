// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — brand mark carried from the logo banner:
// gold crown + celestial radiance over a royal-blue sigil.
// Combines: hexagonal sigil, gold crown, radiant star core, orbiting rings, pulse glow.
// Safe in SSR / prerenders (no JS required — pure SVG with CSS animations).

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  const gradientId = `supreme-grad-${Math.random().toString(36).slice(2, 8)}`;
  const goldId = `supreme-gold-${Math.random().toString(36).slice(2, 8)}`;
  const glowId = `supreme-glow-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`supreme-logo ${animated ? "supreme-logo-animated" : ""} ${className}`}
      style={{ filter: `drop-shadow(0 0 8px rgba(240, 194, 76, 0.5))` }}
    >
      <defs>
        {/* Gold → royal-blue gradient (the brand duo) */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#f7d878" />
          <stop offset="45%"  stopColor="#f0c24c" />
          <stop offset="100%" stopColor="#33b1ff" />
        </linearGradient>

        {/* Pure molten-gold gradient for the crown */}
        <linearGradient id={goldId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#f9e08a" />
          <stop offset="55%"  stopColor="#f0c24c" />
          <stop offset="100%" stopColor="#d8a638" />
        </linearGradient>

        {/* Glow filter */}
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer rotating ring (dashed) */}
      <g className="supreme-ring-outer">
        <circle
          cx="32" cy="32" r="28"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeDasharray="3 4"
          opacity="0.7"
        />
      </g>

      {/* Inner rotating ring (opposite direction) */}
      <g className="supreme-ring-inner">
        <circle
          cx="32" cy="32" r="22"
          stroke="#33b1ff"
          strokeWidth="0.8"
          strokeDasharray="1 3"
          opacity="0.5"
        />
      </g>

      {/* Hexagonal sigil — royal-blue heart of the mark */}
      <g filter={`url(#${glowId})`}>
        <polygon
          points="32,8 52,20 52,44 32,56 12,44 12,20"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          fill="#33b1ff"
          fillOpacity="0.08"
        />
      </g>

      {/* Crown — 3 gold peaks above the hexagon (brand's signature gold) */}
      <g className="supreme-crown" filter={`url(#${glowId})`}>
        <path
          d="M 18 18 L 22 10 L 26 16 L 32 6 L 38 16 L 42 10 L 46 18 L 42 22 L 22 22 Z"
          fill={`url(#${goldId})`}
          stroke="#fff5d6"
          strokeWidth="0.5"
          opacity="0.98"
        />
        {/* Crown jewel */}
        <circle cx="32" cy="12" r="1.5" fill="#fff" />
      </g>

      {/* Central radiant star — celestial "supreme" energy */}
      <g className="supreme-bolt" filter={`url(#${glowId})`}>
        <path
          d="M 32 24 L 34.2 31.8 L 42 34 L 34.2 36.2 L 32 44 L 29.8 36.2 L 22 34 L 29.8 31.8 Z"
          fill="#fff8e6"
          stroke={`url(#${goldId})`}
          strokeWidth="0.8"
        />
      </g>

      {/* Corner accent dots — alternating gold / royal-blue */}
      <circle cx="32" cy="8"  r="1" fill="#f0c24c" className="supreme-dot-pulse" />
      <circle cx="52" cy="20" r="1" fill="#33b1ff" className="supreme-dot-pulse" style={{ animationDelay: "0.2s" }} />
      <circle cx="52" cy="44" r="1" fill="#f0c24c" className="supreme-dot-pulse" style={{ animationDelay: "0.4s" }} />
      <circle cx="32" cy="56" r="1" fill="#33b1ff" className="supreme-dot-pulse" style={{ animationDelay: "0.6s" }} />
      <circle cx="12" cy="44" r="1" fill="#f0c24c" className="supreme-dot-pulse" style={{ animationDelay: "0.8s" }} />
      <circle cx="12" cy="20" r="1" fill="#33b1ff" className="supreme-dot-pulse" style={{ animationDelay: "1.0s" }} />
    </svg>
  );
}

/**
 * SupremeWordmark — brand text with gold→royal-blue gradient
 */
export function SupremeWordmark({ className = "" }) {
  return (
    <span className={`supreme-wordmark font-display font-black tracking-tight-3 ${className}`}>
      <span className="supreme-wordmark-supreme">SUPREME</span>
      <span className="supreme-wordmark-bot">BOT</span>
    </span>
  );
}

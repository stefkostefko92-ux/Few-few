// frontend/src/components/SupremeLogo.jsx
// Supreme Bot — animated insane-looking logo
// Combines: hexagonal sigil, crown, lightning core, orbiting rings, pulse glow.
// Safe in SSR / prerenders (no JS required — pure SVG with CSS animations).

export default function SupremeLogo({ size = 40, className = "", animated = true }) {
  const gradientId = `supreme-grad-${Math.random().toString(36).slice(2, 8)}`;
  const glowId = `supreme-glow-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`supreme-logo ${animated ? "supreme-logo-animated" : ""} ${className}`}
      style={{ filter: `drop-shadow(0 0 8px rgba(0, 229, 255, 0.55))` }}
    >
      <defs>
        {/* Cyan → purple gradient */}
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#00e5ff" />
          <stop offset="50%"  stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#ec4899" />
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
          stroke="#00e5ff"
          strokeWidth="0.8"
          strokeDasharray="1 3"
          opacity="0.5"
        />
      </g>

      {/* Hexagonal sigil — the heart of the mark */}
      <g filter={`url(#${glowId})`}>
        <polygon
          points="32,8 52,20 52,44 32,56 12,44 12,20"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          fill="#00e5ff"
          fillOpacity="0.08"
        />
      </g>

      {/* Crown — 3 peaks above hexagon */}
      <g className="supreme-crown" filter={`url(#${glowId})`}>
        <path
          d="M 18 18 L 22 10 L 26 16 L 32 6 L 38 16 L 42 10 L 46 18 L 42 22 L 22 22 Z"
          fill={`url(#${gradientId})`}
          stroke="#fff"
          strokeWidth="0.5"
          opacity="0.95"
        />
        {/* Crown jewel */}
        <circle cx="32" cy="12" r="1.5" fill="#fff" />
      </g>

      {/* Central lightning bolt — "supreme" energy */}
      <g className="supreme-bolt" filter={`url(#${glowId})`}>
        <path
          d="M 30 26 L 36 26 L 32 36 L 38 36 L 28 50 L 30 40 L 26 40 Z"
          fill="#fff"
          stroke={`url(#${gradientId})`}
          strokeWidth="0.8"
        />
      </g>

      {/* Corner accent dots */}
      <circle cx="32" cy="8"  r="1" fill="#00e5ff" className="supreme-dot-pulse" />
      <circle cx="52" cy="20" r="1" fill="#8b5cf6" className="supreme-dot-pulse" style={{ animationDelay: "0.2s" }} />
      <circle cx="52" cy="44" r="1" fill="#ec4899" className="supreme-dot-pulse" style={{ animationDelay: "0.4s" }} />
      <circle cx="32" cy="56" r="1" fill="#00e5ff" className="supreme-dot-pulse" style={{ animationDelay: "0.6s" }} />
      <circle cx="12" cy="44" r="1" fill="#8b5cf6" className="supreme-dot-pulse" style={{ animationDelay: "0.8s" }} />
      <circle cx="12" cy="20" r="1" fill="#ec4899" className="supreme-dot-pulse" style={{ animationDelay: "1.0s" }} />
    </svg>
  );
}

/**
 * SupremeWordmark — brand text with gradient
 */
export function SupremeWordmark({ className = "" }) {
  return (
    <span className={`supreme-wordmark font-display font-black tracking-tight-3 ${className}`}>
      <span className="supreme-wordmark-supreme">SUPREME</span>
      <span className="supreme-wordmark-bot">BOT</span>
    </span>
  );
}

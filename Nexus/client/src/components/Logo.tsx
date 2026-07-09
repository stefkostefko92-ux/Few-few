import React from 'react';

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Nexus Dominion brand mark — an original heraldic hex-seal with a
 * stylised N glyph and crown-notch above. Pure SVG, no external assets.
 */
export default function Logo({ size = 64, withWordmark = false, className }: Props): React.ReactElement {
  return (
    <div className={`nd-logo ${className || ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: withWordmark ? 14 : 0 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Nexus Dominion"
      >
        <defs>
          <linearGradient id="nd-gold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fff1c2" />
            <stop offset="35%" stopColor="#f7d77e" />
            <stop offset="65%" stopColor="#d6a13d" />
            <stop offset="100%" stopColor="#7a4f12" />
          </linearGradient>
          <linearGradient id="nd-shade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1d141d" />
            <stop offset="100%" stopColor="#0a0610" />
          </linearGradient>
          <radialGradient id="nd-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f7d77e" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f7d77e" stopOpacity="0" />
          </radialGradient>
          <filter id="nd-emboss">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>

        {/* Glow halo */}
        <circle cx="32" cy="32" r="28" fill="url(#nd-glow)" />

        {/* Shaded backplate */}
        <path d="M32 6 L54 18 L54 46 L32 58 L10 46 L10 18 Z" fill="url(#nd-shade)" />

        {/* Hex outline */}
        <path
          d="M32 6 L54 18 L54 46 L32 58 L10 46 L10 18 Z"
          fill="none"
          stroke="url(#nd-gold)"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />

        {/* Inner ring */}
        <path
          d="M32 11 L50 21 L50 43 L32 53 L14 43 L14 21 Z"
          fill="none"
          stroke="url(#nd-gold)"
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />

        {/* Stylised N sigil */}
        <path
          d="M21 19 L21 45 L25.5 45 L25.5 28 L38.5 45 L43 45 L43 19 L38.5 19 L38.5 36 L25.5 19 Z"
          fill="url(#nd-gold)"
          filter="url(#nd-emboss)"
        />

        {/* Central diamond accent */}
        <path d="M32 30.5 L36 32 L32 33.5 L28 32 Z" fill="#0a0610" />

        {/* Crown notch */}
        <path d="M27 6 L29 3 L32 6 L35 3 L37 6" fill="none" stroke="url(#nd-gold)" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="32" cy="2.5" r="1.2" fill="url(#nd-gold)" />

        {/* Side flourishes */}
        <path d="M10 32 L14 32 M50 32 L54 32" stroke="url(#nd-gold)" strokeWidth="1.4" />
      </svg>

      {withWordmark && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: size * 0.34,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              background: 'linear-gradient(180deg, #fff5d6 0%, #f5d28a 40%, #b07d22 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: '#d6a13d',
            }}
          >
            Nexus
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: size * 0.22,
              letterSpacing: '.32em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginTop: 2,
            }}
          >
            Dominion
          </span>
        </div>
      )}
    </div>
  );
}

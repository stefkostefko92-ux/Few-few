import React, { useId } from 'react';

interface Props {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Знакът на Nexus Dominion по дизайн-системата „Dominion“ (шаблонът на собственика):
 * шестоъгълен печат със студен циан кант и две наклонени ленти, които четат „N“.
 * Чист SVG (без растер, остър на всеки DPR). id-тата на градиентите са уникални
 * за инстанцията (useId) — няколко лога на една страница не си крадат дефинициите.
 */
export default function Logo({ size = 64, withWordmark = false, className }: Props): React.ReactElement {
  const uid = useId().replace(/:/g, '');
  const rim = `nd-rim-${uid}`;
  const glow = `nd-glow-${uid}`;
  return (
    <div className={`nd-logo ${className || ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: withWordmark ? Math.max(9, size * 0.3) : 0 }}>
      <svg width={size * 0.92} height={size} viewBox="0 0 58 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nexus Dominion">
        <defs>
          <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d6fdff" />
            <stop offset="45%" stopColor="#7fe9f1" />
            <stop offset="100%" stopColor="#2f8f99" />
          </linearGradient>
          <radialGradient id={glow} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#67e6ef" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#67e6ef" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M29 1 L55 14 L55 46 L29 63 L3 46 L3 14 Z" fill={`url(#${glow})`} />
        <path d="M29 3 L53 15 L53 45 L29 61 L5 45 L5 15 Z" fill="#0b151f" stroke={`url(#${rim})`} strokeWidth="2.4" strokeLinejoin="miter" />
        <path d="M29 9 L48 18.5 L48 42 L29 54.5 L10 42 L10 18.5 Z" fill="none" stroke="#67e6ef" strokeOpacity="0.16" strokeWidth="1" />
        {/* Двете ленти на „N“ — лявата плътна циан, дясната светла; наклонът е от шаблона. */}
        <path d="M18 22 L24.5 19 L24.5 44 L18 47 Z" fill="#67e6ef" />
        <path d="M33.5 17 L40 20 L40 33 L33.5 30 Z" fill="#e4fcff" />
        <path d="M24.5 19 L40 33 L40 37 L24.5 24 Z" fill="#67e6ef" fillOpacity="0.55" />
      </svg>
      {withWordmark && (
        <div className="nd-logo-wordmark">
          <strong style={{ fontSize: Math.max(13, size * 0.48) }}>NEXUS</strong>
          <small style={{ fontSize: Math.max(8, size * 0.21) }}>DOMINION</small>
        </div>
      )}
    </div>
  );
}

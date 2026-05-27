import React from 'react';

interface SpriteProps {
  className?: string;
}

/* All sprites face right by default. The combat scene mirrors the foe via CSS scaleX(-1). */

export function WarriorSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="w-armor" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7e8696" />
          <stop offset="100%" stopColor="#3a4250" />
        </linearGradient>
        <linearGradient id="w-blade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fbfbff" />
          <stop offset="100%" stopColor="#8b8f9a" />
        </linearGradient>
        <linearGradient id="w-cape" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#b6261b" />
          <stop offset="100%" stopColor="#6b0e08" />
        </linearGradient>
      </defs>
      {/* Cape */}
      <path d="M70 70 Q40 110 50 200 L80 200 Q70 130 90 80 Z" fill="url(#w-cape)" />
      {/* Body / armor */}
      <rect x="70" y="80" width="60" height="80" rx="10" fill="url(#w-armor)" stroke="#1c2230" strokeWidth="2" />
      {/* Belt */}
      <rect x="70" y="140" width="60" height="10" fill="#2a1a10" />
      <circle cx="100" cy="145" r="4" fill="#d6a13d" />
      {/* Legs */}
      <rect x="78" y="160" width="18" height="50" rx="4" fill="#3a4250" />
      <rect x="104" y="160" width="18" height="50" rx="4" fill="#3a4250" />
      {/* Boots */}
      <rect x="76" y="205" width="22" height="14" rx="3" fill="#2a1a10" />
      <rect x="102" y="205" width="22" height="14" rx="3" fill="#2a1a10" />
      {/* Shoulder pauldrons */}
      <ellipse cx="68" cy="86" rx="14" ry="10" fill="#5a6373" stroke="#1c2230" strokeWidth="2" />
      <ellipse cx="132" cy="86" rx="14" ry="10" fill="#5a6373" stroke="#1c2230" strokeWidth="2" />
      {/* Head + helm */}
      <circle cx="100" cy="56" r="20" fill="#d9b896" />
      <path d="M78 56 Q78 30 100 30 Q122 30 122 56 L122 64 L78 64 Z" fill="url(#w-armor)" stroke="#1c2230" strokeWidth="2" />
      <rect x="86" y="50" width="28" height="6" fill="#0a0c12" />
      {/* Eyes glow */}
      <circle cx="93" cy="53" r="1.5" fill="#ffb159" />
      <circle cx="107" cy="53" r="1.5" fill="#ffb159" />
      {/* Sword arm */}
      <rect x="125" y="86" width="14" height="50" rx="6" fill="#d9b896" />
      <rect x="118" y="40" width="10" height="80" rx="3" fill="url(#w-blade)" stroke="#5a6373" strokeWidth="1" />
      <rect x="113" y="118" width="20" height="6" fill="#3a2812" />
      <rect x="119" y="124" width="8" height="14" fill="#d6a13d" />
      {/* Shield arm */}
      <rect x="42" y="86" width="14" height="40" rx="6" fill="#d9b896" />
      <path d="M22 90 Q22 100 30 130 Q42 100 42 90 Z" fill="#3a4250" stroke="#1c2230" strokeWidth="2" />
      <path d="M32 100 L32 122" stroke="#d6a13d" strokeWidth="2" />
    </svg>
  );
}

export function RangerSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <defs>
        <linearGradient id="r-tunic" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a5a2a" />
          <stop offset="100%" stopColor="#1f3815" />
        </linearGradient>
        <linearGradient id="r-leather" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#7a4a26" />
          <stop offset="100%" stopColor="#3e2310" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="218" rx="36" ry="6" fill="rgba(0,0,0,.4)" />
      <path d="M70 80 L100 70 L130 80 L128 160 L72 160 Z" fill="url(#r-tunic)" stroke="#1a1a1a" strokeWidth="2" />
      <rect x="70" y="140" width="60" height="8" fill="url(#r-leather)" />
      <rect x="80" y="160" width="16" height="50" rx="4" fill="url(#r-leather)" />
      <rect x="102" y="160" width="16" height="50" rx="4" fill="url(#r-leather)" />
      <rect x="78" y="205" width="22" height="14" rx="3" fill="#2a1a10" />
      <rect x="100" y="205" width="22" height="14" rx="3" fill="#2a1a10" />
      {/* Head + hood */}
      <circle cx="100" cy="56" r="18" fill="#d9b896" />
      <path d="M82 30 Q100 18 118 30 L122 64 Q100 76 78 64 Z" fill="url(#r-tunic)" />
      <circle cx="93" cy="58" r="1.6" fill="#0a0c12" />
      <circle cx="107" cy="58" r="1.6" fill="#0a0c12" />
      {/* Bow */}
      <path d="M40 60 Q26 130 40 200" stroke="#8a5a25" strokeWidth="6" fill="none" strokeLinecap="round" />
      <line x1="40" y1="60" x2="40" y2="200" stroke="#f5e6c8" strokeWidth="1.2" />
      {/* String tension hint */}
      <line x1="40" y1="130" x2="64" y2="130" stroke="#f5e6c8" strokeWidth="1.2" />
      {/* Arms */}
      <rect x="60" y="84" width="14" height="50" rx="6" fill="#d9b896" />
      <rect x="126" y="84" width="14" height="50" rx="6" fill="#d9b896" />
      {/* Quiver */}
      <rect x="130" y="60" width="14" height="50" rx="3" fill="url(#r-leather)" />
      <line x1="134" y1="60" x2="134" y2="50" stroke="#3a2812" strokeWidth="2" />
      <line x1="138" y1="60" x2="138" y2="46" stroke="#3a2812" strokeWidth="2" />
    </svg>
  );
}

export function MageSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <defs>
        <linearGradient id="m-robe" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3a2a78" />
          <stop offset="100%" stopColor="#13093d" />
        </linearGradient>
        <radialGradient id="m-orb" cx=".5" cy=".5" r=".5">
          <stop offset="0%" stopColor="#c2dfff" />
          <stop offset="60%" stopColor="#6aa7ff" />
          <stop offset="100%" stopColor="#1b3d8a" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="218" rx="38" ry="6" fill="rgba(0,0,0,.4)" />
      {/* Robe */}
      <path d="M64 80 L100 70 L136 80 L150 220 L50 220 Z" fill="url(#m-robe)" stroke="#070818" strokeWidth="2" />
      {/* Glowing trim */}
      <path d="M64 80 L100 70 L136 80" stroke="#c294ff" strokeWidth="2" fill="none" />
      <path d="M72 220 L100 200 L128 220" stroke="#c294ff" strokeWidth="1.5" fill="none" />
      {/* Head + hood */}
      <circle cx="100" cy="56" r="18" fill="#d9b896" />
      <path d="M76 36 Q100 18 124 36 L132 80 Q100 90 68 80 Z" fill="url(#m-robe)" />
      {/* Beard */}
      <path d="M86 70 Q100 110 114 70 L114 80 Q100 92 86 80 Z" fill="#eef0f5" />
      <circle cx="94" cy="60" r="1.6" fill="#0a0c12" />
      <circle cx="106" cy="60" r="1.6" fill="#0a0c12" />
      {/* Arms */}
      <rect x="58" y="86" width="14" height="60" rx="6" fill="#d9b896" />
      <rect x="128" y="86" width="14" height="60" rx="6" fill="#d9b896" />
      {/* Staff */}
      <rect x="38" y="32" width="6" height="190" rx="3" fill="#3a2812" />
      <circle cx="41" cy="32" r="14" fill="url(#m-orb)">
        <animate attributeName="r" values="13;15;13" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="41" cy="32" r="6" fill="#fff" opacity=".55" />
    </svg>
  );
}

export function RogueSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <defs>
        <linearGradient id="rg-leather" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#2a1f2c" />
          <stop offset="100%" stopColor="#13070f" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="218" rx="34" ry="6" fill="rgba(0,0,0,.45)" />
      <path d="M70 80 L100 72 L130 80 L128 160 L72 160 Z" fill="url(#rg-leather)" stroke="#070818" strokeWidth="2" />
      <rect x="70" y="138" width="60" height="6" fill="#7a4a26" />
      <rect x="80" y="160" width="16" height="50" rx="4" fill="url(#rg-leather)" />
      <rect x="102" y="160" width="16" height="50" rx="4" fill="url(#rg-leather)" />
      <rect x="78" y="205" width="22" height="14" rx="3" fill="#070808" />
      <rect x="100" y="205" width="22" height="14" rx="3" fill="#070808" />
      {/* Head + mask */}
      <circle cx="100" cy="56" r="18" fill="#d9b896" />
      <rect x="82" y="50" width="36" height="9" fill="#0a0c12" />
      <circle cx="93" cy="55" r="1.4" fill="#c294ff" />
      <circle cx="107" cy="55" r="1.4" fill="#c294ff" />
      {/* Hood */}
      <path d="M82 30 Q100 18 118 30 L122 60 Q100 70 78 60 Z" fill="url(#rg-leather)" />
      {/* Daggers */}
      <rect x="58" y="92" width="14" height="40" rx="6" fill="#d9b896" />
      <rect x="40" y="84" width="6" height="40" fill="#eaeaea" />
      <rect x="38" y="120" width="10" height="6" fill="#3a2812" />
      <rect x="126" y="92" width="14" height="40" rx="6" fill="#d9b896" />
      <rect x="146" y="84" width="6" height="40" fill="#eaeaea" />
      <rect x="142" y="120" width="10" height="6" fill="#3a2812" />
    </svg>
  );
}

/* Foes */
export function GoblinSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <ellipse cx="100" cy="218" rx="34" ry="6" fill="rgba(0,0,0,.45)" />
      <rect x="74" y="100" width="52" height="80" rx="10" fill="#3f6a2c" />
      <rect x="78" y="170" width="16" height="38" rx="4" fill="#2a4b1a" />
      <rect x="106" y="170" width="16" height="38" rx="4" fill="#2a4b1a" />
      <rect x="76" y="203" width="22" height="14" fill="#1d1408" />
      <rect x="102" y="203" width="22" height="14" fill="#1d1408" />
      <ellipse cx="100" cy="78" rx="26" ry="22" fill="#4f8a3a" />
      <path d="M76 78 L66 50 L88 70 Z M124 78 L134 50 L112 70 Z" fill="#3f6a2c" />
      <circle cx="92" cy="78" r="3" fill="#ffd34d" />
      <circle cx="108" cy="78" r="3" fill="#ffd34d" />
      <path d="M90 90 L110 90 L107 96 L102 92 L98 96 L93 92 Z" fill="#1d1408" />
      <rect x="44" y="118" width="14" height="50" rx="6" fill="#4f8a3a" />
      <rect x="122" y="118" width="14" height="50" rx="6" fill="#4f8a3a" />
      {/* Crude weapon */}
      <rect x="28" y="100" width="6" height="90" rx="2" fill="#3a2812" />
      <path d="M22 96 L40 96 L34 76 L26 78 Z" fill="#a8a8a8" />
    </svg>
  );
}

export function WolfSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <ellipse cx="100" cy="220" rx="60" ry="8" fill="rgba(0,0,0,.45)" />
      <ellipse cx="100" cy="170" rx="60" ry="28" fill="#3d3a36" />
      <rect x="58" y="180" width="10" height="34" fill="#3d3a36" />
      <rect x="78" y="184" width="10" height="30" fill="#3d3a36" />
      <rect x="112" y="184" width="10" height="30" fill="#3d3a36" />
      <rect x="132" y="180" width="10" height="34" fill="#3d3a36" />
      <ellipse cx="150" cy="148" rx="22" ry="20" fill="#48433d" />
      <path d="M134 132 L142 116 L148 130 Z" fill="#48433d" />
      <path d="M158 132 L164 116 L170 130 Z" fill="#48433d" />
      <circle cx="160" cy="148" r="3" fill="#ffd34d" />
      <path d="M168 154 L176 158 L168 162 Z" fill="#0a0a0a" />
      <path d="M156 162 L172 168" stroke="#0a0a0a" strokeWidth="2" />
      {/* Tail */}
      <path d="M40 168 Q20 150 24 130" stroke="#3d3a36" strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function TrollSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <ellipse cx="100" cy="220" rx="56" ry="8" fill="rgba(0,0,0,.5)" />
      <rect x="56" y="80" width="68" height="120" rx="14" fill="#6e7a5c" />
      <rect x="54" y="190" width="22" height="28" rx="4" fill="#4d5a3f" />
      <rect x="104" y="190" width="22" height="28" rx="4" fill="#4d5a3f" />
      <ellipse cx="90" cy="64" rx="34" ry="28" fill="#8a9670" />
      <path d="M76 84 L78 96 L82 84 M98 84 L100 96 L104 84" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="62" r="3" fill="#000" />
      <circle cx="98" cy="62" r="3" fill="#000" />
      <rect x="30" y="86" width="20" height="80" rx="6" fill="#6e7a5c" />
      <rect x="128" y="86" width="20" height="80" rx="6" fill="#6e7a5c" />
      <rect x="6" y="76" width="34" height="20" rx="4" fill="#3a2812" />
    </svg>
  );
}

export function DragonSprite(p: SpriteProps): React.ReactElement {
  return (
    <svg className={`fighter-svg ${p.className || ''}`} viewBox="0 0 180 240">
      <ellipse cx="100" cy="220" rx="60" ry="9" fill="rgba(0,0,0,.5)" />
      <defs>
        <linearGradient id="dr-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#b6261b" />
          <stop offset="100%" stopColor="#581009" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="170" rx="60" ry="34" fill="url(#dr-body)" />
      {/* Wings */}
      <path d="M60 150 Q20 90 60 110 Q70 130 70 150 Z" fill="#3a0a05" stroke="#a31b10" strokeWidth="1.5" />
      <path d="M140 150 Q180 90 140 110 Q130 130 130 150 Z" fill="#3a0a05" stroke="#a31b10" strokeWidth="1.5" />
      <ellipse cx="148" cy="138" rx="24" ry="20" fill="url(#dr-body)" />
      <path d="M132 122 L138 108 L142 122 M152 122 L158 108 L162 122" fill="#b6261b" />
      <circle cx="156" cy="138" r="3" fill="#ffd34d" />
      <path d="M168 144 Q176 148 168 152" fill="#ffd34d" />
      <path d="M40 174 Q14 200 8 174" stroke="#b6261b" strokeWidth="10" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function GenericFoeSprite({ sprite, className }: { sprite: string; className?: string }): React.ReactElement {
  // a flexible silhouette used for any other foe slug
  return (
    <svg className={`fighter-svg ${className || ''}`} viewBox="0 0 180 240">
      <ellipse cx="100" cy="220" rx="46" ry="8" fill="rgba(0,0,0,.5)" />
      <defs>
        <linearGradient id="gf-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5a4660" />
          <stop offset="100%" stopColor="#1d0f25" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="160" rx="46" ry="58" fill="url(#gf-body)" />
      <ellipse cx="100" cy="76" rx="30" ry="28" fill="#3a2845" />
      <circle cx="90" cy="76" r="3" fill="#c294ff" />
      <circle cx="110" cy="76" r="3" fill="#c294ff" />
      <path d="M84 92 Q100 100 116 92" stroke="#c294ff" strokeWidth="2" fill="none" />
      <rect x="56" y="120" width="14" height="60" rx="6" fill="#3a2845" />
      <rect x="110" y="120" width="14" height="60" rx="6" fill="#3a2845" />
      <text x="100" y="234" textAnchor="middle" fontSize="9" fill="#5b4e64">{sprite}</text>
    </svg>
  );
}

export function spriteFor(name: string): React.ReactElement {
  switch (name) {
    case 'warrior': return <WarriorSprite />;
    case 'ranger': return <RangerSprite />;
    case 'mage': return <MageSprite />;
    case 'rogue': return <RogueSprite />;
    case 'goblin': return <GoblinSprite />;
    case 'wolf':
    case 'rat':
    case 'boar': return <WolfSprite />;
    case 'troll':
    case 'orc':
    case 'titan':
    case 'golem': return <TrollSprite />;
    case 'drake':
    case 'shadowlord':
    case 'overlord': return <DragonSprite />;
    default: return <GenericFoeSprite sprite={name} />;
  }
}

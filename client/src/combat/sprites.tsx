import React from 'react';

/* =========================================================================
   Combat sprites — clean icon-style fighter portraits.
   Single-path monochrome silhouettes layered over class-colored gradient
   backgrounds. Designed for combat readability and a professional look.
   ========================================================================= */

interface SpriteProps {
  className?: string;
  size?: number;
}

function Frame({
  size = 180,
  bg,
  outline,
  children,
  className,
}: {
  size?: number;
  bg: string;
  outline: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      className={`fighter-svg ${className || ''}`}
      width={size}
      height={size * (4 / 3)}
      viewBox="0 0 180 240"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={`bg-${bg}`} cx="50%" cy="60%" r="70%">
          <stop offset="0%" stopColor={bg} stopOpacity="0.6" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.0" />
        </radialGradient>
        <linearGradient id={`outline-${outline}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={outline} stopOpacity="1" />
          <stop offset="100%" stopColor={outline} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {/* Ground halo */}
      <ellipse cx="90" cy="225" rx="50" ry="6" fill="rgba(0,0,0,.55)" />
      <ellipse cx="90" cy="225" rx="40" ry="3" fill={bg} fillOpacity=".25" />
      {children}
    </svg>
  );
}

/* ===== Player class sprites ===== */

export function WarriorSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#d6a13d" outline="#d6a13d" className={className} size={size}>
      {/* Cape */}
      <path
        d="M58 90 Q40 130 50 220 L78 220 Q70 150 88 96 Z"
        fill="#7a1a13"
        stroke="#3a0a06"
        strokeWidth="1.5"
      />
      {/* Body silhouette */}
      <path
        d="M70 84 Q90 70 110 84 L116 154 Q108 168 90 168 Q72 168 64 154 Z"
        fill="#3a4250"
        stroke="#1a1f2a"
        strokeWidth="2"
      />
      {/* Pauldrons */}
      <path
        d="M62 86 Q56 78 64 72 Q72 70 76 80 Z M118 86 Q124 78 116 72 Q108 70 104 80 Z"
        fill="#d6a13d"
        stroke="#3a2812"
        strokeWidth="1.2"
      />
      {/* Belt */}
      <rect x="68" y="146" width="44" height="8" fill="#3a2812" />
      <circle cx="90" cy="150" r="3" fill="#d6a13d" />
      {/* Legs */}
      <rect x="74" y="168" width="14" height="36" rx="3" fill="#2a3140" />
      <rect x="92" y="168" width="14" height="36" rx="3" fill="#2a3140" />
      {/* Boots */}
      <rect x="71" y="200" width="20" height="12" rx="2" fill="#1a1004" />
      <rect x="89" y="200" width="20" height="12" rx="2" fill="#1a1004" />
      {/* Helm */}
      <path
        d="M72 68 Q72 44 90 38 Q108 44 108 68 L108 78 L72 78 Z"
        fill="#4a5260"
        stroke="#1a1f2a"
        strokeWidth="1.5"
      />
      {/* Visor slit */}
      <rect x="78" y="58" width="24" height="4" fill="#0a0c12" />
      <circle cx="84" cy="60" r="1" fill="#ffb159" />
      <circle cx="96" cy="60" r="1" fill="#ffb159" />
      {/* Sword (held high) */}
      <rect x="118" y="40" width="8" height="80" rx="2" fill="#e8e7e1" stroke="#5a6373" strokeWidth="0.8" />
      <rect x="113" y="118" width="18" height="5" fill="#3a2812" />
      <rect x="119" y="123" width="6" height="12" fill="#d6a13d" />
      <rect x="121" y="32" width="2" height="10" fill="#fff" opacity=".7" />
      {/* Shield (held forward) */}
      <path
        d="M40 90 Q40 100 48 130 Q66 100 64 90 Z"
        fill="#4a5260"
        stroke="#1a1f2a"
        strokeWidth="1.5"
      />
      <path d="M52 102 L52 124" stroke="#d6a13d" strokeWidth="2.5" />
      <circle cx="52" cy="113" r="2.5" fill="#d6a13d" />
    </Frame>
  );
}

export function RangerSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#6ad8a4" outline="#6ad8a4" className={className} size={size}>
      {/* Cloak */}
      <path
        d="M62 80 Q44 120 54 220 L82 220 Q72 140 86 84 Z"
        fill="#1f3815"
        stroke="#0a1607"
        strokeWidth="1.5"
      />
      {/* Tunic */}
      <path
        d="M70 84 L90 72 L110 84 L114 154 Q104 168 90 168 Q76 168 66 154 Z"
        fill="#3a5a2a"
        stroke="#1a2a14"
        strokeWidth="2"
      />
      {/* Belt */}
      <rect x="68" y="146" width="44" height="6" fill="#5a3a1a" />
      {/* Legs */}
      <rect x="74" y="168" width="14" height="38" rx="3" fill="#5a3a1a" />
      <rect x="92" y="168" width="14" height="38" rx="3" fill="#5a3a1a" />
      {/* Boots */}
      <rect x="71" y="202" width="20" height="12" rx="2" fill="#1a1004" />
      <rect x="89" y="202" width="20" height="12" rx="2" fill="#1a1004" />
      {/* Hood */}
      <path
        d="M70 38 Q90 28 110 38 L114 76 Q90 86 66 76 Z"
        fill="#1f3815"
        stroke="#0a1607"
        strokeWidth="1.5"
      />
      {/* Face shadow */}
      <ellipse cx="90" cy="58" rx="12" ry="10" fill="#0a0c12" />
      <circle cx="86" cy="58" r="1.4" fill="#6ad8a4" />
      <circle cx="94" cy="58" r="1.4" fill="#6ad8a4" />
      {/* Bow */}
      <path
        d="M42 56 Q26 130 42 204"
        stroke="#8a5a25"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <line x1="42" y1="56" x2="42" y2="204" stroke="#f5e6c8" strokeWidth="1.5" />
      {/* Arrow nocked */}
      <line x1="42" y1="130" x2="68" y2="130" stroke="#f5e6c8" strokeWidth="1.5" />
      <polygon points="68,128 73,130 68,132" fill="#e8e7e1" />
      {/* Quiver on back */}
      <path d="M126 64 L140 64 L138 116 L128 116 Z" fill="#5a3a1a" stroke="#3a2812" strokeWidth="1" />
      <line x1="130" y1="64" x2="130" y2="54" stroke="#3a2812" strokeWidth="1.5" />
      <line x1="134" y1="64" x2="134" y2="50" stroke="#3a2812" strokeWidth="1.5" />
      <line x1="138" y1="64" x2="138" y2="52" stroke="#3a2812" strokeWidth="1.5" />
    </Frame>
  );
}

export function MageSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#c294ff" outline="#c294ff" className={className} size={size}>
      {/* Robe */}
      <path
        d="M62 88 L90 76 L118 88 L138 222 L42 222 Z"
        fill="#2a1660"
        stroke="#0c0420"
        strokeWidth="2"
      />
      {/* Robe trim */}
      <path
        d="M62 88 L90 76 L118 88"
        stroke="#c294ff"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M60 222 L90 200 L120 222"
        stroke="#c294ff"
        strokeWidth="1.5"
        fill="none"
      />
      {/* Hood */}
      <path
        d="M68 38 Q90 26 112 38 L120 84 Q90 94 60 84 Z"
        fill="#2a1660"
        stroke="#0c0420"
        strokeWidth="1.5"
      />
      {/* Face shadow */}
      <ellipse cx="90" cy="60" rx="14" ry="10" fill="#0a0418" />
      <circle cx="86" cy="60" r="1.4" fill="#c294ff" />
      <circle cx="94" cy="60" r="1.4" fill="#c294ff" />
      {/* Beard */}
      <path d="M82 70 Q90 96 98 70 L98 82 Q90 92 82 82 Z" fill="#eef0f5" />
      {/* Staff */}
      <rect x="36" y="42" width="5" height="180" rx="2" fill="#3a2812" />
      <circle cx="38.5" cy="42" r="13" fill="#1d0f4a" />
      <circle cx="38.5" cy="42" r="11" fill="#c294ff" />
      <circle cx="38.5" cy="42" r="6" fill="#fff" opacity=".7">
        <animate attributeName="r" values="5;8;5" dur="2.5s" repeatCount="indefinite" />
      </circle>
      {/* Belt */}
      <rect x="68" y="148" width="44" height="6" fill="#3a2812" />
      <circle cx="90" cy="151" r="3" fill="#c294ff" />
    </Frame>
  );
}

export function RogueSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#e85a4f" outline="#e85a4f" className={className} size={size}>
      {/* Cloak */}
      <path
        d="M62 84 Q44 124 54 222 L80 222 Q72 140 84 88 Z"
        fill="#13070f"
        stroke="#080208"
        strokeWidth="1.5"
      />
      {/* Tunic */}
      <path
        d="M70 84 L90 72 L110 84 L112 154 Q104 168 90 168 Q76 168 68 154 Z"
        fill="#2a1f2c"
        stroke="#13070f"
        strokeWidth="2"
      />
      {/* Belt with vials */}
      <rect x="68" y="144" width="44" height="6" fill="#3a2812" />
      <circle cx="76" cy="155" r="3" fill="#6ad8a4" stroke="#3a2812" strokeWidth=".8" />
      <circle cx="104" cy="155" r="3" fill="#6aa7ff" stroke="#3a2812" strokeWidth=".8" />
      {/* Legs */}
      <rect x="74" y="168" width="14" height="38" rx="3" fill="#13070f" />
      <rect x="92" y="168" width="14" height="38" rx="3" fill="#13070f" />
      {/* Boots */}
      <rect x="71" y="202" width="20" height="12" rx="2" fill="#080208" />
      <rect x="89" y="202" width="20" height="12" rx="2" fill="#080208" />
      {/* Hood (forward, deep shadow) */}
      <path
        d="M68 38 Q90 26 112 38 L116 70 Q90 80 64 70 Z"
        fill="#13070f"
        stroke="#080208"
        strokeWidth="1.5"
      />
      {/* Mask covering face */}
      <rect x="74" y="56" width="32" height="8" fill="#080208" />
      <circle cx="84" cy="60" r="1.4" fill="#e85a4f" />
      <circle cx="96" cy="60" r="1.4" fill="#e85a4f" />
      {/* Twin daggers */}
      <g>
        <rect x="38" y="92" width="6" height="36" fill="#e8e7e1" stroke="#5a6373" strokeWidth=".6" />
        <rect x="34" y="124" width="14" height="5" fill="#3a2812" />
        <rect x="38" y="129" width="6" height="10" fill="#13070f" />
      </g>
      <g>
        <rect x="136" y="92" width="6" height="36" fill="#e8e7e1" stroke="#5a6373" strokeWidth=".6" />
        <rect x="132" y="124" width="14" height="5" fill="#3a2812" />
        <rect x="136" y="129" width="6" height="10" fill="#13070f" />
      </g>
    </Frame>
  );
}

/* ===== Enemy sprites ===== */

export function GoblinSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#4f8a3a" outline="#4f8a3a" className={className} size={size}>
      {/* Body */}
      <path
        d="M68 100 L92 96 L116 100 L120 184 L62 184 Z"
        fill="#4f8a3a"
        stroke="#1f3815"
        strokeWidth="2"
      />
      {/* Loincloth */}
      <path d="M78 168 L90 184 L102 168 Z" fill="#5a3a1a" />
      {/* Legs */}
      <rect x="72" y="184" width="14" height="28" rx="2" fill="#3a6620" />
      <rect x="94" y="184" width="14" height="28" rx="2" fill="#3a6620" />
      {/* Feet */}
      <ellipse cx="78" cy="214" rx="10" ry="4" fill="#1f3815" />
      <ellipse cx="100" cy="214" rx="10" ry="4" fill="#1f3815" />
      {/* Head */}
      <ellipse cx="90" cy="78" rx="26" ry="22" fill="#5a9a44" stroke="#1f3815" strokeWidth="1.5" />
      {/* Ears */}
      <path d="M64 74 L52 50 L72 64 Z M116 74 L128 50 L108 64 Z" fill="#5a9a44" stroke="#1f3815" strokeWidth="1.5" />
      {/* Eyes (menacing yellow) */}
      <circle cx="82" cy="78" r="3" fill="#ffd34d" />
      <circle cx="98" cy="78" r="3" fill="#ffd34d" />
      <circle cx="82" cy="78" r="1" fill="#1a1004" />
      <circle cx="98" cy="78" r="1" fill="#1a1004" />
      {/* Snarling teeth */}
      <path d="M76 92 L82 96 L86 92 L90 96 L94 92 L98 96 L104 92 L106 86 L74 86 Z" fill="#1a1004" />
      <path d="M80 86 L80 90 M86 86 L86 91 M94 86 L94 91 M100 86 L100 90" stroke="#fff" strokeWidth="1.2" />
      {/* Arms holding crude club */}
      <rect x="42" y="120" width="14" height="46" rx="6" fill="#4f8a3a" />
      <rect x="124" y="120" width="14" height="46" rx="6" fill="#4f8a3a" />
      {/* Club */}
      <rect x="30" y="106" width="6" height="76" rx="2" fill="#3a2812" />
      <path d="M22 92 L44 92 L40 70 L26 72 Z" fill="#7a7a7a" stroke="#3a3a3a" strokeWidth="1" />
    </Frame>
  );
}

export function WolfSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#3d3a36" outline="#3d3a36" className={className} size={size}>
      {/* Body */}
      <ellipse cx="80" cy="168" rx="64" ry="28" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="2" />
      {/* Hind legs */}
      <rect x="50" y="180" width="10" height="32" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="1.5" />
      <rect x="68" y="184" width="10" height="28" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="1.5" />
      {/* Front legs */}
      <rect x="104" y="186" width="10" height="26" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="1.5" />
      <rect x="122" y="180" width="10" height="32" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="1.5" />
      {/* Paws */}
      <ellipse cx="55" cy="216" rx="8" ry="3" fill="#1a1a1a" />
      <ellipse cx="73" cy="216" rx="8" ry="3" fill="#1a1a1a" />
      <ellipse cx="109" cy="216" rx="8" ry="3" fill="#1a1a1a" />
      <ellipse cx="127" cy="216" rx="8" ry="3" fill="#1a1a1a" />
      {/* Head */}
      <ellipse cx="148" cy="142" rx="24" ry="22" fill="#48433d" stroke="#1a1a1a" strokeWidth="1.5" />
      {/* Ears */}
      <path d="M132 122 L138 102 L146 124 Z M156 122 L164 102 L150 124 Z" fill="#48433d" stroke="#1a1a1a" strokeWidth="1.5" />
      {/* Snout */}
      <path d="M158 148 L172 154 L170 162 L156 158 Z" fill="#3d3a36" stroke="#1a1a1a" strokeWidth="1.5" />
      {/* Glowing eye */}
      <circle cx="155" cy="138" r="3" fill="#ffd34d" />
      <circle cx="155" cy="138" r="1" fill="#1a1004" />
      {/* Teeth */}
      <path d="M162 156 L164 162 L166 156 L168 162 L170 156" stroke="#fff" strokeWidth="1.5" fill="none" />
      {/* Tail */}
      <path d="M30 168 Q14 150 18 130" stroke="#3d3a36" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M30 168 Q14 150 18 130" stroke="#1a1a1a" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </Frame>
  );
}

export function TrollSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#8a9670" outline="#8a9670" className={className} size={size}>
      {/* Body */}
      <path
        d="M54 90 L86 76 L116 76 L132 92 L130 200 L52 200 Z"
        fill="#6e7a5c"
        stroke="#3d4630"
        strokeWidth="2"
      />
      {/* Loincloth */}
      <path d="M62 174 L90 196 L122 174 L120 200 L62 200 Z" fill="#3a2812" />
      {/* Legs */}
      <rect x="60" y="200" width="22" height="20" rx="2" fill="#4d5a3f" />
      <rect x="100" y="200" width="22" height="20" rx="2" fill="#4d5a3f" />
      {/* Head */}
      <path
        d="M64 76 Q74 38 90 38 Q106 38 116 76 Z"
        fill="#8a9670"
        stroke="#3d4630"
        strokeWidth="2"
      />
      {/* Tusks */}
      <path d="M82 78 L82 94 L86 78 Z" fill="#f5e6c8" stroke="#3d4630" strokeWidth="1" />
      <path d="M94 78 L98 94 L98 78 Z" fill="#f5e6c8" stroke="#3d4630" strokeWidth="1" />
      {/* Eyes */}
      <circle cx="80" cy="62" r="3" fill="#0a0a0a" />
      <circle cx="100" cy="62" r="3" fill="#0a0a0a" />
      <circle cx="81" cy="61" r="1" fill="#fff" />
      <circle cx="101" cy="61" r="1" fill="#fff" />
      {/* Nose */}
      <path d="M90 70 Q92 76 90 80 Q88 76 90 70" fill="#5a6347" />
      {/* Massive arms */}
      <rect x="30" y="92" width="22" height="84" rx="8" fill="#6e7a5c" stroke="#3d4630" strokeWidth="1.5" />
      <rect x="128" y="92" width="22" height="84" rx="8" fill="#6e7a5c" stroke="#3d4630" strokeWidth="1.5" />
      {/* Hands holding boulder */}
      <ellipse cx="40" cy="180" rx="14" ry="10" fill="#4d5a3f" stroke="#1a1f0a" strokeWidth="1.5" />
      {/* Club */}
      <rect x="148" y="86" width="6" height="100" rx="2" fill="#3a2812" />
      <ellipse cx="151" cy="80" rx="14" ry="10" fill="#3a2812" stroke="#1a1004" strokeWidth="1.5" />
      <circle cx="148" cy="76" r="2" fill="#5a3a1a" />
      <circle cx="154" cy="82" r="2" fill="#5a3a1a" />
    </Frame>
  );
}

export function DragonSprite({ className, size }: SpriteProps): React.ReactElement {
  return (
    <Frame bg="#e85a4f" outline="#e85a4f" className={className} size={size}>
      {/* Wings */}
      <path
        d="M50 130 Q10 80 50 100 Q60 120 60 140 Z"
        fill="#3a0a05"
        stroke="#7e1812"
        strokeWidth="1.5"
      />
      <path
        d="M130 130 Q170 80 130 100 Q120 120 120 140 Z"
        fill="#3a0a05"
        stroke="#7e1812"
        strokeWidth="1.5"
      />
      {/* Wing veins */}
      <path d="M30 100 L50 130 M50 88 L52 130" stroke="#b6261b" strokeWidth="1" fill="none" />
      <path d="M150 100 L130 130 M130 88 L128 130" stroke="#b6261b" strokeWidth="1" fill="none" />
      {/* Body */}
      <ellipse cx="90" cy="160" rx="52" ry="36" fill="#b6261b" stroke="#3a0a05" strokeWidth="2" />
      {/* Belly scales */}
      <path d="M70 178 L72 196 M82 184 L82 200 M90 188 L90 202 M98 184 L98 200 M110 178 L108 196" stroke="#7e1812" strokeWidth="1" fill="none" />
      {/* Head */}
      <ellipse cx="138" cy="130" rx="22" ry="20" fill="#b6261b" stroke="#3a0a05" strokeWidth="2" />
      {/* Horns */}
      <path d="M122 118 L116 100 L128 116 Z" fill="#3a0a05" />
      <path d="M152 118 L158 100 L146 116 Z" fill="#3a0a05" />
      {/* Eye */}
      <ellipse cx="146" cy="128" rx="4" ry="3" fill="#ffd34d" />
      <ellipse cx="146" cy="128" rx="1.5" ry="2.5" fill="#0a0a0a" />
      {/* Mouth + flame */}
      <path d="M152 138 Q160 142 160 148 Q156 150 152 146 Z" fill="#1a0405" />
      <path d="M158 144 Q166 146 168 142 Q172 140 170 138" stroke="#ffb159" strokeWidth="3" fill="#ffd34d" opacity=".9" />
      {/* Tail */}
      <path
        d="M40 170 Q10 200 4 174"
        stroke="#b6261b"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M40 170 Q10 200 4 174"
        stroke="#3a0a05"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Legs */}
      <rect x="64" y="190" width="12" height="22" rx="2" fill="#7e1812" stroke="#3a0a05" strokeWidth="1" />
      <rect x="104" y="190" width="12" height="22" rx="2" fill="#7e1812" stroke="#3a0a05" strokeWidth="1" />
      <ellipse cx="70" cy="216" rx="10" ry="4" fill="#3a0a05" />
      <ellipse cx="110" cy="216" rx="10" ry="4" fill="#3a0a05" />
    </Frame>
  );
}

export function GenericFoeSprite({
  sprite,
  className,
  size,
}: {
  sprite: string;
  className?: string;
  size?: number;
}): React.ReactElement {
  // Choose a tint based on family
  const palette: Record<string, { bg: string; body: string; eye: string; outline: string }> = {
    rat: { bg: '#7a4a26', body: '#5a3a1a', eye: '#ffb159', outline: '#2a1408' },
    boar: { bg: '#5a3a1a', body: '#3a2812', eye: '#e85a4f', outline: '#1a0d04' },
    bandit: { bg: '#3a2845', body: '#2a1f2c', eye: '#ffd34d', outline: '#13070f' },
    witch: { bg: '#6f3fb6', body: '#3a1660', eye: '#c294ff', outline: '#0c0420' },
    spider: { bg: '#13070f', body: '#1a0d14', eye: '#e85a4f', outline: '#000' },
    serpent: { bg: '#6aa7ff', body: '#1d4378', eye: '#84ecb4', outline: '#0a1828' },
    golem: { bg: '#7c7d83', body: '#3a4250', eye: '#ffb159', outline: '#1a1f2a' },
    wraith: { bg: '#6aa7ff', body: '#13183a', eye: '#fff', outline: '#0a0c12' },
    orc: { bg: '#4f8a3a', body: '#1f3815', eye: '#ffd34d', outline: '#0a1607' },
    drake: { bg: '#e85a4f', body: '#7e1812', eye: '#ffd34d', outline: '#1a0405' },
    titan: { bg: '#e85a4f', body: '#3d3a36', eye: '#ffb159', outline: '#1a1004' },
    shadowlord: { bg: '#6f3fb6', body: '#080208', eye: '#e85a4f', outline: '#000' },
    overlord: { bg: '#c294ff', body: '#0c0420', eye: '#ffd34d', outline: '#000' },
  };
  const c = palette[sprite] || palette.bandit;
  return (
    <Frame bg={c.bg} outline={c.outline} className={className} size={size}>
      {/* Body */}
      <path
        d="M58 96 L92 80 L122 96 L126 200 L54 200 Z"
        fill={c.body}
        stroke={c.outline}
        strokeWidth="2"
      />
      {/* Head */}
      <ellipse cx="90" cy="72" rx="26" ry="24" fill={c.body} stroke={c.outline} strokeWidth="2" />
      {/* Eyes */}
      <circle cx="82" cy="70" r="3" fill={c.eye} />
      <circle cx="98" cy="70" r="3" fill={c.eye} />
      <circle cx="82" cy="70" r="1.2" fill={c.outline} />
      <circle cx="98" cy="70" r="1.2" fill={c.outline} />
      {/* Snarl */}
      <path d="M82 88 L86 86 L90 90 L94 86 L98 88" stroke={c.eye} strokeWidth="1.5" fill="none" />
      {/* Arms */}
      <rect x="36" y="110" width="16" height="56" rx="6" fill={c.body} stroke={c.outline} strokeWidth="1.5" />
      <rect x="128" y="110" width="16" height="56" rx="6" fill={c.body} stroke={c.outline} strokeWidth="1.5" />
      {/* Legs */}
      <rect x="68" y="200" width="16" height="18" rx="2" fill={c.body} stroke={c.outline} strokeWidth="1.5" />
      <rect x="96" y="200" width="16" height="18" rx="2" fill={c.body} stroke={c.outline} strokeWidth="1.5" />
      {/* Tiny species marker */}
      <text x="90" y="234" textAnchor="middle" fontSize="9" fill={c.bg} opacity=".6">
        {sprite}
      </text>
    </Frame>
  );
}

export function spriteFor(name: string): React.ReactElement {
  switch (name) {
    case 'warrior':
      return <WarriorSprite />;
    case 'ranger':
      return <RangerSprite />;
    case 'mage':
      return <MageSprite />;
    case 'rogue':
      return <RogueSprite />;
    case 'goblin':
      return <GoblinSprite />;
    case 'wolf':
    case 'rat':
    case 'boar':
      return <WolfSprite />;
    case 'troll':
    case 'orc':
    case 'titan':
    case 'golem':
      return <TrollSprite />;
    case 'drake':
    case 'shadowlord':
    case 'overlord':
      return <DragonSprite />;
    default:
      return <GenericFoeSprite sprite={name} />;
  }
}

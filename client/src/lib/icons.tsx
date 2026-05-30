import React from 'react';

/* =========================================================================
   NEXUS DOMINION — Icon Library
   Original monochrome single-path SVG glyphs in a clean professional style.
   All icons are self-contained, accessible, and scale to any size.
   ========================================================================= */

interface Props extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  background?: string;
}

function Glyph({
  size = 24,
  color = 'currentColor',
  background,
  children,
  ...rest
}: Props & { children: React.ReactNode }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {background && <rect width="64" height="64" fill={background} />}
      {children}
    </svg>
  );
}

/* ---- UI / wayfinding ---- */
export const IconHome = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 6L6 30h6v22h14V36h12v16h14V30h6z" />
  </Glyph>
);
export const IconScroll = (p: Props) => (
  <Glyph {...p}>
    <path d="M14 8h32c4 0 7 3 7 7v2h-6V15c0-1-1-1-2 0v34c0 4-3 7-7 7H18c-4 0-7-3-7-7V15c0-4 3-7 7-7h-4zm0 4c-2 0-3 1-3 3v34c0 2 1 3 3 3s3-1 3-3V15c0-2-1-3-3-3zm10 8h18v4H24zm0 8h18v4H24zm0 8h12v4H24z" />
  </Glyph>
);
export const IconSword = (p: Props) => (
  <Glyph {...p}>
    <path d="M44 6l14 14-6 6 4 4-6 6-4-4-22 22-7 1 1-7 22-22-4-4 6-6 4 4z" />
  </Glyph>
);
export const IconShield = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 4l22 8v18c0 14-9 24-22 30C19 54 10 44 10 30V12z" />
  </Glyph>
);
export const IconCoin = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 6a26 26 0 1 0 0 52 26 26 0 0 0 0-52zm0 6a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm-6 10h12a5 5 0 0 1 5 5v3h-4v-2c0-1-1-2-2-2H28c-1 0-2 1-2 2v2c0 1 1 2 2 2h11a6 6 0 0 1 6 6v3a6 6 0 0 1-6 6H26a5 5 0 0 1-5-5v-3h4v2c0 1 1 2 2 2h12c1 0 2-1 2-2v-2c0-1-1-2-2-2H28a6 6 0 0 1-6-6v-3a6 6 0 0 1 5-5z" />
  </Glyph>
);
export const IconBag = (p: Props) => (
  <Glyph {...p}>
    <path d="M22 14v-2a10 10 0 0 1 20 0v2h6l4 38c0 4-3 6-7 6H19c-4 0-7-2-7-6l4-38zm6 0h8v-2a4 4 0 0 0-8 0z" />
  </Glyph>
);
export const IconStar = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 4l8 18 20 2-15 14 4 20-17-10-17 10 4-20L4 24l20-2z" />
  </Glyph>
);
export const IconHeart = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 56C8 40 4 28 4 18a12 12 0 0 1 24 0c0-7 6-14 14-14a12 12 0 0 1 14 14c0 10-4 22-24 38z" />
  </Glyph>
);
export const IconBolt = (p: Props) => (
  <Glyph {...p}>
    <path d="M38 4L14 36h12L20 60l28-32H34z" />
  </Glyph>
);
export const IconMap = (p: Props) => (
  <Glyph {...p}>
    <path d="M4 12l18-6 20 6 18-6v44l-18 6-20-6-18 6zm18 0v40m20-34v40" stroke="currentColor" strokeWidth="3" fill="none" />
  </Glyph>
);
export const IconCrown = (p: Props) => (
  <Glyph {...p}>
    <path d="M4 52h56v8H4zm0-6l4-30 12 12 12-22 12 22 12-12 4 30z" />
  </Glyph>
);
export const IconLogout = (p: Props) => (
  <Glyph {...p}>
    <path d="M36 8h-16a8 8 0 0 0-8 8v32a8 8 0 0 0 8 8h16a8 8 0 0 0 8-8v-6h-6v6c0 1-1 2-2 2H20c-1 0-2-1-2-2V16c0-1 1-2 2-2h16c1 0 2 1 2 2v6h6v-6a8 8 0 0 0-8-8zM52 32l-12-12v8H28v8h12v8z" />
  </Glyph>
);
export const IconUser = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 6a12 12 0 1 0 0 24 12 12 0 0 0 0-24zM12 56a20 20 0 0 1 40 0v2H12z" />
  </Glyph>
);
export const IconMail = (p: Props) => (
  <Glyph {...p}>
    <path d="M6 14h52a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4zm2 8L32 36 56 22V46H8z" />
  </Glyph>
);
export const IconChevron = (p: Props) => (
  <Glyph {...p}>
    <path d="M10 24l22 22 22-22-6-6-16 16-16-16z" />
  </Glyph>
);
export const IconCog = (p: Props) => (
  <Glyph {...p}>
    <path d="M27 4l-2 8a22 22 0 0 0-6 4l-8-2-5 9 6 6a22 22 0 0 0 0 6l-6 6 5 9 8-2a22 22 0 0 0 6 4l2 8h10l2-8a22 22 0 0 0 6-4l8 2 5-9-6-6a22 22 0 0 0 0-6l6-6-5-9-8 2a22 22 0 0 0-6-4l-2-8zm5 18a10 10 0 1 1 0 20 10 10 0 0 1 0-20z" />
  </Glyph>
);
export const IconPlus = (p: Props) => (
  <Glyph {...p}>
    <path d="M28 8h8v20h20v8H36v20h-8V36H8v-8h20z" />
  </Glyph>
);
export const IconTrash = (p: Props) => (
  <Glyph {...p}>
    <path d="M24 4h16v6h16v6H8v-6h16zm-12 14h40l-3 38a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" />
  </Glyph>
);
export const IconEdit = (p: Props) => (
  <Glyph {...p}>
    <path d="M46 6l12 12-30 30-15 3 3-15zm0 16l-22 22m24-26l-2-2" stroke="currentColor" strokeWidth="2" fill="currentColor" />
  </Glyph>
);
export const IconAxe = (p: Props) => (
  <Glyph {...p}>
    <path d="M16 4l6 6-30 30 6 6 30-30zm12 4a16 16 0 0 1 28 14l-8 4-12-12 4-8a16 16 0 0 1-12 2z" />
  </Glyph>
);
export const IconSkull = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 6a20 20 0 0 0-20 20v14l6 4v8h6v6h16v-6h6v-8l6-4V26A20 20 0 0 0 32 6zm-8 24a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm16 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-8 12l2 6h-4z" />
  </Glyph>
);
export const IconFlame = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 4c4 8-2 14-2 22 0-6-4-10-4-10s-12 8-12 22a18 18 0 0 0 36 0c0-12-12-22-18-34z" />
  </Glyph>
);
export const IconKey = (p: Props) => (
  <Glyph {...p}>
    <path d="M24 12a12 12 0 1 1-8 21l-3 3-4-4v6l-4 4-3-3v-6l16-16a12 12 0 0 1 6-5zm0 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
  </Glyph>
);
export const IconChart = (p: Props) => (
  <Glyph {...p}>
    <path d="M4 56h56v4H4zm6-10l12-14 10 8 16-22 12 14v18H10z" />
  </Glyph>
);
export const IconBow = (p: Props) => (
  <Glyph {...p}>
    <path d="M14 6c0 12 2 24 16 26-6 4-12 12-14 26h6c2-12 8-18 12-22l24 24h6v-6L40 30c-4-4-10-10-10-22h-6c0 8 4 14 8 18-4 2-12 6-18-20z" />
  </Glyph>
);
export const IconWand = (p: Props) => (
  <Glyph {...p}>
    <path d="M50 6l4 4 4 4-44 44-4-4-4-4zm6 16l3 1-1 3-3-1zm-2-12l1 3-3 1-1-3z" />
  </Glyph>
);
export const IconDagger = (p: Props) => (
  <Glyph {...p}>
    <path d="M32 4l-4 28 4 4 4-4zm-8 32h16v6h-2v18l-6 6-6-6V42h-2z" />
  </Glyph>
);
export const IconPotion = (p: Props) => (
  <Glyph {...p}>
    <path d="M24 4h16v8h-2v8a16 16 0 0 1 12 16v18a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8V36a16 16 0 0 1 12-16v-8h-2z" />
  </Glyph>
);
export const IconGem = (p: Props) => (
  <Glyph {...p}>
    <path d="M16 6h32l12 16-28 36L4 22z" />
  </Glyph>
);
export const IconDoor = (p: Props) => (
  <Glyph {...p}>
    <path d="M14 4h36v60H14zm6 6v48h24V10zm22 22a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
  </Glyph>
);
export const IconHelm = (p: Props) => (
  <Glyph {...p}>
    <path d="M12 30a20 20 0 0 1 40 0v18h-8v-8h-6v8H26v-8h-6v8h-8z" />
  </Glyph>
);

/* ---- Class portraits (silhouette + class color background) ---- */
export const ClassPortraitWarrior = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-w" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#4a3520" />
        <stop offset="100%" stopColor="#1a1004" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-w)" />
    <path d="M12 30a20 20 0 0 1 40 0v18h-8v-8h-6v8H26v-8h-6v8h-8z" fill="#d6a13d" />
    <path d="M32 14L26 8M32 14L38 8" stroke="#d6a13d" strokeWidth="2" />
  </svg>
);
export const ClassPortraitRanger = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-r" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#1d3920" />
        <stop offset="100%" stopColor="#0a1607" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-r)" />
    <path d="M14 8c0 12 2 24 14 26-4 4-10 10-12 22h4c2-10 8-16 12-20l20 22h4v-4L42 32c-4-4-10-12-10-22h-4c0 8 4 14 8 16-4 2-10 4-22-18z" fill="#6ad8a4" />
  </svg>
);
export const ClassPortraitMage = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-m" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#28184a" />
        <stop offset="100%" stopColor="#0c0420" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-m)" />
    <path d="M32 6L22 36h8L22 56l24-30h-10L42 6z" fill="#c294ff" />
    <circle cx="42" cy="14" r="2" fill="#fff" />
  </svg>
);
export const ClassPortraitRogue = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-rg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#3a1632" />
        <stop offset="100%" stopColor="#10040c" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-rg)" />
    <path d="M22 8c0-2 4-4 10-4s10 2 10 4l-2 14c0 4-3 8-8 8s-8-4-8-8zm-2 30l12 4 12-4-2 18-10 6-10-6z" fill="#e85a4f" />
  </svg>
);

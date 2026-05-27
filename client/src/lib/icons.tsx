import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const I: React.FC<IconProps & { d: string }> = ({ size = 16, d, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    <path d={d} />
  </svg>
);

export const IconHome = (p: IconProps) => <I {...p} d="M3 12 L12 3 L21 12 M5 10 V20 H10 V14 H14 V20 H19 V10" />;
export const IconScroll = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M7 4 H17 A3 3 0 0 1 20 7 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V7 A3 3 0 0 1 7 4 Z" />
    <path d="M8 8 H16 M8 12 H14 M8 16 H12" />
  </svg>
);
export const IconSword = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M14.5 17.5 L3 6 V3 H6 L17.5 14.5" />
    <path d="M13 19 L19 13" />
    <path d="M16 16 L20 20" />
    <path d="M19 21 L21 19" />
  </svg>
);
export const IconShield = (p: IconProps) => <I {...p} d="M12 3 L19 6 V12 C19 16 16 19 12 21 C8 19 5 16 5 12 V6 Z" />;
export const IconCoin = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9 H14 A2 2 0 0 1 14 13 H10 A2 2 0 0 0 10 17 H15" />
  </svg>
);
export const IconBag = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6 7 H18 L19 20 H5 Z" />
    <path d="M9 7 V5 A3 3 0 0 1 15 5 V7" />
  </svg>
);
export const IconStar = (p: IconProps) => <I {...p} d="M12 2 L15 9 L22 10 L17 15 L18 22 L12 18 L6 22 L7 15 L2 10 L9 9 Z" />;
export const IconHeart = (p: IconProps) => <I {...p} d="M12 21 C5 16 2 12 2 8 A5 5 0 0 1 12 6 A5 5 0 0 1 22 8 C22 12 19 16 12 21 Z" />;
export const IconBolt = (p: IconProps) => <I {...p} d="M13 2 L4 14 H11 L10 22 L20 10 H13 Z" />;
export const IconMap = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z" />
    <path d="M9 4 V18 M15 6 V20" />
  </svg>
);
export const IconCrown = (p: IconProps) => <I {...p} d="M3 18 L5 8 L9 12 L12 5 L15 12 L19 8 L21 18 Z M3 18 H21" />;
export const IconLogout = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 21 H5 A2 2 0 0 1 3 19 V5 A2 2 0 0 1 5 3 H9" />
    <path d="M16 17 L21 12 L16 7 M21 12 H9" />
  </svg>
);
export const IconUser = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21 V19 A6 6 0 0 1 10 13 H14 A6 6 0 0 1 20 19 V21" />
  </svg>
);
export const IconMail = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7 L12 13 L21 7" />
  </svg>
);
export const IconBolt2 = IconBolt;
export const IconChevron = (p: IconProps) => <I {...p} d="M6 9 L12 15 L18 9" />;

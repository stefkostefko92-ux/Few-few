import React from 'react';
import {
  Home, ScrollText, Sword, Shield, Coins, Backpack, Star, Heart, Zap, Map,
  Crown, LogOut, User, Mail, ChevronDown, Settings as Cog, Plus, Trash2,
  Pencil, Axe, Skull, Flame, Key, BarChart3, Crosshair, Wand2, Swords,
  FlaskRound, Gem, DoorOpen, HardHat, type LucideProps,
} from 'lucide-react';

/* =========================================================================
   NEXUS DOMINION — Icon library
   Powered by Lucide (MIT-licensed open-source icon set). Re-exported under
   the project's "IconX" naming for backward compatibility.
   ========================================================================= */

interface Props extends Omit<LucideProps, 'ref'> {
  size?: number;
  color?: string;
}

function wrap(Component: any) {
  return function Icon({ size = 18, ...rest }: Props): React.ReactElement {
    return <Component size={size} strokeWidth={1.75} absoluteStrokeWidth {...rest} />;
  };
}

export const IconHome     = wrap(Home);
export const IconScroll   = wrap(ScrollText);
export const IconSword    = wrap(Sword);
export const IconShield   = wrap(Shield);
export const IconCoin     = wrap(Coins);
export const IconBag      = wrap(Backpack);
export const IconStar     = wrap(Star);
export const IconHeart    = wrap(Heart);
export const IconBolt     = wrap(Zap);
export const IconMap      = wrap(Map);
export const IconCrown    = wrap(Crown);
export const IconLogout   = wrap(LogOut);
export const IconUser     = wrap(User);
export const IconMail     = wrap(Mail);
export const IconChevron  = wrap(ChevronDown);
export const IconCog      = wrap(Cog);
export const IconPlus     = wrap(Plus);
export const IconTrash    = wrap(Trash2);
export const IconEdit     = wrap(Pencil);
export const IconAxe      = wrap(Axe);
export const IconSkull    = wrap(Skull);
export const IconFlame    = wrap(Flame);
export const IconKey      = wrap(Key);
export const IconChart    = wrap(BarChart3);
export const IconBow      = wrap(Crosshair);
export const IconWand     = wrap(Wand2);
export const IconDagger   = wrap(Swords);
export const IconPotion   = wrap(FlaskRound);
export const IconGem      = wrap(Gem);
export const IconDoor     = wrap(DoorOpen);
export const IconHelm     = wrap(HardHat);

/* ---- Class portraits — still original silhouettes ---- */
export const ClassPortraitWarrior = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-w-2" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#4a3520" />
        <stop offset="100%" stopColor="#1a1004" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-w-2)" />
    <Sword size={36} x="14" y="14" color="#d6a13d" strokeWidth={2} />
  </svg>
);
export const ClassPortraitRanger = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-r-2" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#1d3920" />
        <stop offset="100%" stopColor="#0a1607" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-r-2)" />
    <Crosshair size={36} x="14" y="14" color="#6ad8a4" strokeWidth={2} />
  </svg>
);
export const ClassPortraitMage = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-m-2" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#28184a" />
        <stop offset="100%" stopColor="#0c0420" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-m-2)" />
    <Wand2 size={36} x="14" y="14" color="#c294ff" strokeWidth={2} />
  </svg>
);
export const ClassPortraitRogue = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64">
    <defs>
      <linearGradient id="bg-rg-2" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#3a1632" />
        <stop offset="100%" stopColor="#10040c" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="10" fill="url(#bg-rg-2)" />
    <Swords size={36} x="14" y="14" color="#e85a4f" strokeWidth={2} />
  </svg>
);

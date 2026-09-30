// Line styles, fills and colours of the drawings, in the manner of the lift layout drawings of the trade: black
// outlines, concrete speckled in orange, axes blue dash-dot, spaces for the maintenance person olive dashed, landing
// door jambs orange. Widths and dashes are on paper [mm].
import type { Fill, Ink, Stroke } from './types';

export const PALETTE: Readonly<Record<Ink, string>> = {
  ink: '#15181f',
  ink2: '#3b4252',
  muted: '#6b7280',
  axis: '#1f4fd8',
  space: '#7e8c2c',
  jamb: '#df6f16',
  concrete: '#ef7d1d',
  steel: '#9ba2ae',
  car: '#eef1f7',
  door: '#e5eaf2',
  cw: '#eceef2',
  paper: '#ffffff',
  accent: '#1d3271',
  dark: '#23272f',
};

export type StyleName = 'outline' | 'wall' | 'heavy' | 'thin' | 'fine' | 'dim' | 'axis' | 'space' | 'hidden' | 'jamb' | 'steel' | 'frame';

export const STYLES: Readonly<Record<StyleName, Stroke>> = {
  outline: { ink: 'ink', w: 0.3 },
  wall: { ink: 'ink', w: 0.35 },
  heavy: { ink: 'ink', w: 0.5 },
  thin: { ink: 'ink', w: 0.18 },
  fine: { ink: 'ink2', w: 0.1 },
  dim: { ink: 'ink', w: 0.13 },
  axis: { ink: 'axis', w: 0.18, dash: [5, 1, 0.6, 1] },
  space: { ink: 'space', w: 0.25, dash: [2.2, 1.1] },
  hidden: { ink: 'muted', w: 0.15, dash: [1.4, 0.9] },
  jamb: { ink: 'jamb', w: 0.45 },
  steel: { ink: 'ink2', w: 0.2 },
  frame: { ink: 'ink', w: 0.4 },
};

export type FillName = 'concrete' | 'car' | 'door' | 'cw' | 'steel' | 'dark' | 'paper';

export const FILLS: Readonly<Record<FillName, Fill>> = {
  concrete: { k: 'pattern', id: 'concrete' },
  car: { k: 'solid', ink: 'car' },
  door: { k: 'solid', ink: 'door' },
  cw: { k: 'solid', ink: 'cw' },
  steel: { k: 'solid', ink: 'steel' },
  dark: { k: 'solid', ink: 'dark' },
  paper: { k: 'solid', ink: 'paper' },
};

/** Lettering sizes on paper [mm]. */
export const TEXT = { dim: 2.5, label: 2.2, small: 1.6, note: 1.9, title: 3.6, subtitle: 2.4 } as const;

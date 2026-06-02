import { z } from "zod";
import type { GameKey } from "./games.js";

/**
 * Per-game cosmetics (§11.1). Bought with gems (premium currency acquired with
 * euro) — never with money directly, and never affecting gameplay. A cosmetic
 * is scoped to one game so the same felt bought for Belote and Santase are
 * distinct items. Some are VIP-exclusive (require an active VIP subscription).
 *
 * cosmeticId format: `${GAME}.${TYPE}.${variant}` e.g. "BELOTE.FELT.sapphire".
 */

export const COSMETIC_TYPES = ["FELT", "CARDBACK", "BOARD", "CUE"] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

export interface Cosmetic {
  id: string;
  game: GameKey;
  type: CosmeticType;
  name: string;
  gemPrice: number;
  vipExclusive: boolean;
  /** Display + application colours; meaning depends on `type`. */
  colors: { a: string; b: string };
}

/** Games that play on the felt card table (support FELT + CARDBACK). */
const CARD_GAMES: GameKey[] = [
  "BELOTE",
  "SANTASE",
  "SVARA",
  "HOLDEM",
  "KENT",
  "BRIDGE",
  "WAR",
  "RUMMY",
  "GOFISH",
];

/** Games on a checkered board (support BOARD square themes). */
const BOARD_GAMES: GameKey[] = ["CHESS", "DRAUGHTS"];

/** Cue-sport games (support CUE cloth themes). */
const CUE_GAMES: GameKey[] = ["EIGHTBALL", "NINEBALL", "SNOOKER"];

interface Template {
  variant: string;
  name: string;
  a: string;
  b: string;
  gemPrice: number;
  vipExclusive: boolean;
}

const FELT_THEMES: Template[] = [
  { variant: "sapphire", name: "Сапфирено сукно", a: "#173a63", b: "#0b1f38", gemPrice: 150, vipExclusive: false },
  { variant: "bordeaux", name: "Бордо сукно", a: "#5a1f2a", b: "#2a0c12", gemPrice: 150, vipExclusive: false },
  { variant: "midnight", name: "Среднощно сукно", a: "#1b1d2e", b: "#0a0b14", gemPrice: 150, vipExclusive: false },
  { variant: "emerald", name: "Изумрудено сукно", a: "#0f5132", b: "#06281a", gemPrice: 150, vipExclusive: false },
  { variant: "graphite", name: "Графитено сукно", a: "#2b2f36", b: "#14171c", gemPrice: 150, vipExclusive: false },
  { variant: "royal", name: "Кралско лилаво", a: "#3a1f5a", b: "#1a0c2a", gemPrice: 300, vipExclusive: true },
  { variant: "crimson-gold", name: "Алено със злато", a: "#6e1023", b: "#2a0a10", gemPrice: 350, vipExclusive: true },
];

const CARDBACK_THEMES: Template[] = [
  { variant: "ruby", name: "Рубинен гръб", a: "#7a1f2a", b: "#3a0c12", gemPrice: 200, vipExclusive: false },
  { variant: "sapphire", name: "Сапфирен гръб", a: "#1f3a7a", b: "#0c1a3a", gemPrice: 200, vipExclusive: false },
  { variant: "malachite", name: "Малахитен гръб", a: "#1f5a40", b: "#0c2417", gemPrice: 200, vipExclusive: false },
  { variant: "obsidian", name: "Обсидианов гръб", a: "#23262d", b: "#0c0e12", gemPrice: 200, vipExclusive: false },
  { variant: "ivory", name: "Слонова кост", a: "#e9e0c8", b: "#b8a878", gemPrice: 250, vipExclusive: false },
  { variant: "brocade", name: "Брокатен гръб", a: "#d9b25f", b: "#8a6a35", gemPrice: 350, vipExclusive: true },
  { variant: "peacock", name: "Паунов гръб", a: "#0e6b6b", b: "#3a1f5a", gemPrice: 400, vipExclusive: true },
];

const BOARD_THEMES: Template[] = [
  { variant: "marble", name: "Мраморна дъска", a: "#f0ece0", b: "#6a7a86", gemPrice: 200, vipExclusive: false },
  { variant: "walnut", name: "Орехова дъска", a: "#e8d0a8", b: "#6b4a2a", gemPrice: 200, vipExclusive: false },
  { variant: "ocean", name: "Океанска дъска", a: "#dce9f0", b: "#2f6f8f", gemPrice: 200, vipExclusive: false },
  { variant: "onyx", name: "Ониксова дъска", a: "#c8ccd0", b: "#2a2e34", gemPrice: 300, vipExclusive: true },
  { variant: "rose-gold", name: "Розово злато", a: "#f3dcd0", b: "#9c5a4a", gemPrice: 350, vipExclusive: true },
];

const CUE_THEMES: Template[] = [
  { variant: "british-green", name: "Британско зелено", a: "#1a6e3a", b: "#0c3a1f", gemPrice: 200, vipExclusive: false },
  { variant: "tournament-blue", name: "Турнирно синьо", a: "#1b4f8a", b: "#0c2748", gemPrice: 200, vipExclusive: false },
  { variant: "burgundy", name: "Бордо сукно", a: "#6e1d2e", b: "#350c16", gemPrice: 200, vipExclusive: false },
  { variant: "charcoal", name: "Антрацит", a: "#33383f", b: "#181b20", gemPrice: 200, vipExclusive: false },
  { variant: "royal-purple", name: "Кралско лилаво", a: "#4a2670", b: "#23123a", gemPrice: 350, vipExclusive: true },
];

function build(games: GameKey[], type: CosmeticType, themes: Template[]): Cosmetic[] {
  return games.flatMap((game) =>
    themes.map((tpl) => ({
      id: `${game}.${type}.${tpl.variant}`,
      game,
      type,
      name: tpl.name,
      gemPrice: tpl.gemPrice,
      vipExclusive: tpl.vipExclusive,
      colors: { a: tpl.a, b: tpl.b },
    })),
  );
}

export const COSMETICS: Cosmetic[] = [
  ...build(CARD_GAMES, "FELT", FELT_THEMES),
  ...build(CARD_GAMES, "CARDBACK", CARDBACK_THEMES),
  ...build(BOARD_GAMES, "BOARD", BOARD_THEMES),
  ...build(CUE_GAMES, "CUE", CUE_THEMES),
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export const cosmeticById = (id: string): Cosmetic | undefined => BY_ID.get(id);

export const cosmeticsForGame = (game: GameKey): Cosmetic[] =>
  COSMETICS.filter((c) => c.game === game);

/** True if the game has any cosmetics to customise. */
export const gameHasCosmetics = (game: GameKey): boolean => BY_ID.size > 0 && COSMETICS.some((c) => c.game === game);

export const buyCosmeticSchema = z.object({ id: z.string().min(3).max(64) });
export const equipCosmeticSchema = z.object({ id: z.string().min(3).max(64) });
export type BuyCosmeticInput = z.infer<typeof buyCosmeticSchema>;
export type EquipCosmeticInput = z.infer<typeof equipCosmeticSchema>;

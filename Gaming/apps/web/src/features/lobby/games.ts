import { GAME_ENGINE, type GameKey } from "@aso/shared";

export interface GameCard {
  key: GameKey;
  /** Canonical name — game/card terms are not machine-translated (§16). */
  title: string;
  players: string;
  /** Whether the game is playable yet (lit up as sprints land). */
  ready: boolean;
  /** True when a bespoke scene exists; otherwise the generic view is used. */
  bespoke?: boolean;
  glyph: string;
}

/** The full 21-game roster (§2), in lobby display order. All playable (S7). */
export const GAME_CATALOG: GameCard[] = [
  { key: "CHESS", title: "Шах", players: "2", ready: true, bespoke: true, glyph: "♞" },
  { key: "BACKGAMMON", title: "Табла", players: "2", ready: true, glyph: "⚀" },
  { key: "BELOTE", title: "Белот", players: "4", ready: true, bespoke: true, glyph: "♠" },
  { key: "SANTASE", title: "Сантасе (66)", players: "2", ready: true, bespoke: true, glyph: "♥" },
  { key: "SVARA", title: "Свара", players: "2–6", ready: true, glyph: "♣" },
  { key: "WAR", title: "Война", players: "2", ready: true, glyph: "♦" },
  { key: "GOFISH", title: "Бръкни в морето", players: "2–4", ready: true, glyph: "🐟" },
  { key: "KENT", title: "Кент Купе", players: "4", ready: true, glyph: "♤" },
  { key: "DRAUGHTS", title: "Дама", players: "2", ready: true, glyph: "⛀" },
  { key: "LUDO", title: "Не се сърди човече", players: "2–4", ready: true, glyph: "🎲" },
  { key: "RUMMY", title: "Реми", players: "2", ready: true, glyph: "🃏" },
  { key: "DOMINO", title: "Домино", players: "2–4", ready: true, glyph: "🁫" },
  { key: "BRIDGE", title: "Бридж", players: "4", ready: true, glyph: "♢" },
  { key: "BATTLESHIP", title: "Морски бой", players: "2", ready: true, glyph: "⚓" },
  { key: "DICE", title: "Покер на зарове", players: "2–4", ready: true, glyph: "⚄" },
  { key: "BINGO", title: "Бинго", players: "N", ready: true, glyph: "🔵" },
  { key: "WORDS", title: "Думи", players: "2+", ready: true, glyph: "✍" },
  { key: "EIGHTBALL", title: "Билярд (8 топки)", players: "2", ready: true, bespoke: true, glyph: "🎱" },
  { key: "NINEBALL", title: "Билярд (9 топки)", players: "2", ready: true, bespoke: true, glyph: "🎱" },
  { key: "SNOOKER", title: "Снукър", players: "2", ready: true, bespoke: true, glyph: "🔴" },
  { key: "MAGNAT", title: "Магнат", players: "2–6", ready: true, bespoke: true, glyph: "🏙" },
];

export const engineOf = (key: GameKey) => GAME_ENGINE[key];

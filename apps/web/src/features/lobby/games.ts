import { GAME_ENGINE, type GameKey } from "@aso/shared";

export interface GameCard {
  key: GameKey;
  /** Canonical name — game/card terms are not machine-translated (§16). */
  title: string;
  players: string;
  /** Whether the game is playable yet (lit up as sprints land). */
  ready: boolean;
  glyph: string;
}

/** The full 18-game roster (§2), in lobby display order. */
export const GAME_CATALOG: GameCard[] = [
  { key: "CHESS", title: "Шах", players: "2", ready: true, glyph: "♞" },
  { key: "BACKGAMMON", title: "Табла", players: "2", ready: false, glyph: "⚀" },
  { key: "BELOTE", title: "Белот", players: "4", ready: false, glyph: "♠" },
  { key: "SANTASE", title: "Сантасе (66)", players: "2", ready: false, glyph: "♥" },
  { key: "SVARA", title: "Свара", players: "2–6", ready: false, glyph: "♣" },
  { key: "WAR", title: "Война", players: "2", ready: false, glyph: "♦" },
  { key: "GOFISH", title: "Бръкни в морето", players: "2–4", ready: false, glyph: "🐟" },
  { key: "KENT", title: "Кент Купе", players: "4", ready: false, glyph: "♤" },
  { key: "DRAUGHTS", title: "Дама", players: "2", ready: false, glyph: "⛀" },
  { key: "LUDO", title: "Не се сърди човече", players: "2–4", ready: false, glyph: "🎲" },
  { key: "RUMMY", title: "Реми", players: "2", ready: false, glyph: "🃏" },
  { key: "HOLDEM", title: "Тексас Холдем", players: "2–9", ready: false, glyph: "♧" },
  { key: "DOMINO", title: "Домино", players: "2–4", ready: false, glyph: "🁫" },
  { key: "BRIDGE", title: "Бридж", players: "4", ready: false, glyph: "♢" },
  { key: "BATTLESHIP", title: "Морски бой", players: "2", ready: false, glyph: "⚓" },
  { key: "DICE", title: "Покер на зарове", players: "1–4", ready: false, glyph: "⚄" },
  { key: "BINGO", title: "Бинго", players: "N", ready: false, glyph: "🔵" },
  { key: "WORDS", title: "Думи", players: "2+", ready: false, glyph: "✍" },
];

export const engineOf = (key: GameKey) => GAME_ENGINE[key];

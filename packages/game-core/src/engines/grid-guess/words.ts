import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";

/**
 * Думи (Words) — original BG word-chain race (§4.18). Players take turns adding
 * a valid word that begins with the last letter of the previous word and hasn't
 * been used. A word must come from the engine's embedded BG word set (original
 * curated list — no licensed dictionary). Failing to find a word (PASS) loses a
 * life; last player with lives wins. First word is seeded.
 *
 * No hidden information; redact is a no-op. Validation lives server-side.
 */

// A small original curated Bulgarian word list (lowercase). Extendable later.
// Validated to contain only Cyrillic letters at module load.
const WORD_LIST = [
  "арфа", "акула", "ангел", "балон", "баба", "вода", "вълк", "врата",
  "градина", "гора", "гълъб", "дъга", "дъб", "дума", "езеро", "елен", "жаба",
  "звезда", "змия", "игла", "икона", "китка", "котка", "куче", "крава",
  "лале", "луна", "лъв", "море", "маса", "мляко", "небе", "нос", "облак", "око",
  "перо", "птица", "риба", "роза", "слон", "сняг", "тигър",
  "трева", "уста", "ухо", "фар", "хляб", "цвете", "чаша", "шапка", "ябълка",
  "ягода", "арена", "осел", "лодка", "ананас", "автобус", "сирене",
].filter((w) => /^[а-я]+$/.test(w));

const WORD_SET = new Set(WORD_LIST);
const STARTING_LIVES = 2;

export interface WordsState {
  used: string[];
  lastLetter: string;
  lives: number[];
  turn: Seat;
  seats: number;
  winner: Seat | null;
  done: boolean;
}

export type WordsAction = { type: "PLAY"; word: string } | { type: "PASS" };
export type WordsEvent =
  | { type: "PLAY"; seat: Seat; word: string }
  | { type: "PASS"; seat: Seat; livesLeft: number }
  | { type: "WIN"; seat: Seat };

const firstLetter = (w: string): string => w[0] ?? "";
const lastLetter = (w: string): string => w[w.length - 1] ?? "";

/** Words available now: in the set, unused, and starting with the required letter. */
export function availableWords(state: WordsState): string[] {
  return WORD_LIST.filter(
    (w) => !state.used.includes(w) && (state.lastLetter === "" || firstLetter(w) === state.lastLetter),
  );
}

export const wordsEngine: GameEngine<WordsState, WordsAction, WordsEvent> = {
  init(opts: InitOpts, rng: SeededRng): WordsState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    const seed = rng.shuffle(WORD_LIST)[0] ?? "дума";
    return {
      used: [seed],
      lastLetter: lastLetter(seed),
      lives: new Array<number>(seats).fill(STARTING_LIVES),
      turn: 0,
      seats,
      winner: null,
      done: false,
    };
  },

  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    const words = availableWords(state);
    if (words.length === 0) return [{ type: "PASS" }];
    return words.map((word) => ({ type: "PLAY" as const, word }));
  },

  reduce(state, action) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: WordsState = { ...state, used: state.used.slice(), lives: state.lives.slice() };
    const events: WordsEvent[] = [];

    if (action.type === "PASS") {
      next.lives[seat] = (next.lives[seat] ?? 0) - 1;
      events.push({ type: "PASS", seat, livesLeft: next.lives[seat]! });
      const alive = next.lives.filter((l) => l > 0).length;
      if (alive <= 1) {
        const winner = next.lives.findIndex((l) => l > 0);
        const w = winner >= 0 ? winner : seat;
        events.push({ type: "WIN", seat: w });
        return { state: { ...next, winner: w, done: true }, events };
      }
      next.turn = nextAlive(next, seat);
      return { state: next, events };
    }

    // PLAY
    const word = action.word.toLowerCase();
    if (!WORD_SET.has(word)) throw new IllegalActionError("Не е валидна дума");
    if (next.used.includes(word)) throw new IllegalActionError("Думата вече е използвана");
    if (next.lastLetter !== "" && firstLetter(word) !== next.lastLetter) {
      throw new IllegalActionError("Грешна начална буква");
    }
    next.used.push(word);
    next.lastLetter = lastLetter(word);
    events.push({ type: "PLAY", seat, word });
    next.turn = nextAlive(next, seat);
    return { state: next, events };
  },

  isTerminal: (s) => s.done,

  score(state): SeatScore[] {
    const winner = state.winner ?? 0;
    return state.lives.map((_, seat) => ({
      seat,
      result: seat === winner ? "win" : "loss",
      points: seat === winner ? 1 : 0,
    }));
  },

  redact: (s) => s,
};

function nextAlive(state: WordsState, from: Seat): Seat {
  for (let i = 1; i <= state.seats; i++) {
    const cand = (from + i) % state.seats;
    if ((state.lives[cand] ?? 0) > 0) return cand;
  }
  return from;
}

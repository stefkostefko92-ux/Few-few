import {
  IllegalActionError,
  type GameEngine,
  type InitOpts,
  type Seat,
  type SeatScore,
} from "../../kernel/contract.js";
import type { SeededRng } from "../../kernel/rng.js";
import { WORDS_BG } from "./wordlist-bg.js";

/**
 * Думи (Words) — original BG word-chain race (§4.18). Players take turns TYPING
 * a word that begins with the last letter of the previous word and hasn't been
 * used. Words must come from the engine's curated BG word list (wordlist-bg.ts
 * — original list, no licensed dictionary).
 *
 * - A wrong word (not in the dictionary / wrong first letter / already used)
 *   costs a life (WRONG event); the player keeps the turn while alive.
 * - PASS costs a life and RESEEDS the chain with a fresh unused word, so a
 *   dead-end letter never forces a pass spiral.
 * - Answers are never served: `legalActions` exposes only PASS; free-form PLAY
 *   input is checked by `validate` + `reduce` (server-authoritative).
 *
 * No hidden information; redact is a no-op.
 */

// Defensive filter: the list is unit-tested, but the engine never trusts input.
const WORD_LIST = WORDS_BG.filter((w) => /^[а-я]+$/.test(w));

const WORD_SET = new Set(WORD_LIST);
const STARTING_LIVES = 3;

export interface WordsState {
  used: string[];
  lastLetter: string;
  lives: number[];
  turn: Seat;
  seats: number;
  winner: Seat | null;
  done: boolean;
  /** Optional per-session settings (read by the realtime host's turn clock). */
  config?: { turnSeconds: number };
}

export type WordsAction = { type: "PLAY"; word: string } | { type: "PASS" };
export type WrongReason = "dict" | "letter" | "used";
export type WordsEvent =
  | { type: "PLAY"; seat: Seat; word: string }
  | { type: "WRONG"; seat: Seat; word: string; reason: WrongReason; livesLeft: number }
  | { type: "PASS"; seat: Seat; livesLeft: number }
  | { type: "RESEED"; word: string }
  | { type: "WIN"; seat: Seat };

const firstLetter = (w: string): string => w[0] ?? "";
const lastLetter = (w: string): string => w[w.length - 1] ?? "";

/** Words available now: in the set, unused, and starting with the required letter. */
export function availableWords(state: WordsState): string[] {
  const used = new Set(state.used);
  return WORD_LIST.filter(
    (w) => !used.has(w) && (state.lastLetter === "" || firstLetter(w) === state.lastLetter),
  );
}

/** Why `word` can't be played now, or null when it is playable. */
function wrongReason(state: WordsState, word: string): WrongReason | null {
  if (!WORD_SET.has(word)) return "dict";
  if (state.used.includes(word)) return "used";
  if (state.lastLetter !== "" && firstLetter(word) !== state.lastLetter) return "letter";
  return null;
}

export const wordsEngine: GameEngine<WordsState, WordsAction, WordsEvent> = {
  init(opts: InitOpts, rng: SeededRng): WordsState {
    const seats = Math.min(Math.max(opts.seats, 2), 4);
    const seed = rng.shuffle(WORD_LIST)[0] ?? "дума";
    const cfg = opts.config as { turnSeconds?: number } | undefined;
    const turnSeconds = typeof cfg?.turnSeconds === "number" && cfg.turnSeconds > 0 ? cfg.turnSeconds : undefined;
    return {
      used: [seed],
      lastLetter: lastLetter(seed),
      lives: new Array<number>(seats).fill(STARTING_LIVES),
      turn: 0,
      seats,
      winner: null,
      done: false,
      ...(turnSeconds ? { config: { turnSeconds } } : {}),
    };
  },

  // The word list must never be served to the client as ready-made answers —
  // only PASS is enumerated; typed PLAY input goes through `validate` below.
  legalActions(state, seat) {
    if (state.done || seat !== state.turn) return [];
    return [{ type: "PASS" }];
  },

  // Free-form typed input: any non-empty word on your turn is ACCEPTED as an
  // attempt (a wrong word costs a life in reduce — that's the game mechanic).
  validate(state, seat, action) {
    if (state.done || seat !== state.turn) return false;
    if (action.type === "PASS") return true;
    return action.type === "PLAY" && typeof action.word === "string" && action.word.trim().length > 0;
  },

  reduce(state, action, rng) {
    if (state.done) throw new IllegalActionError("Game over");
    const seat = state.turn;
    const next: WordsState = { ...state, used: state.used.slice(), lives: state.lives.slice() };
    const events: WordsEvent[] = [];

    const loseLife = (): boolean => {
      next.lives[seat] = (next.lives[seat] ?? 0) - 1;
      const alive = next.lives.filter((l) => l > 0).length;
      if (alive <= 1) {
        const winner = next.lives.findIndex((l) => l > 0);
        const w = winner >= 0 ? winner : seat;
        events.push({ type: "WIN", seat: w });
        next.winner = w;
        next.done = true;
        return true;
      }
      return false;
    };

    if (action.type === "PASS") {
      events.push({ type: "PASS", seat, livesLeft: (next.lives[seat] ?? 0) - 1 });
      if (loseLife()) return { state: next, events };
      // Reseed the chain with a fresh word so a dead-end letter never spirals.
      const usedSet = new Set(next.used);
      const unused = WORD_LIST.filter((w) => !usedSet.has(w));
      const reseed = unused.length > 0 ? rng.shuffle(unused)[0]! : null;
      if (reseed) {
        next.used.push(reseed);
        next.lastLetter = lastLetter(reseed);
        events.push({ type: "RESEED", word: reseed });
      }
      next.turn = nextAlive(next, seat);
      return { state: next, events };
    }

    if (action.type !== "PLAY" || typeof action.word !== "string") {
      throw new IllegalActionError("Непозната команда");
    }

    const word = action.word.trim().toLowerCase();
    const reason = wrongReason(next, word);
    if (reason) {
      // A wrong word costs a life; the player keeps the turn while alive.
      events.push({ type: "WRONG", seat, word, reason, livesLeft: (next.lives[seat] ?? 0) - 1 });
      if (loseLife()) return { state: next, events };
      if ((next.lives[seat] ?? 0) <= 0) next.turn = nextAlive(next, seat);
      return { state: next, events };
    }

    next.used.push(word);
    next.lastLetter = lastLetter(word);
    events.push({ type: "PLAY", seat, word });
    next.turn = nextAlive(next, seat);
    return { state: next, events };
  },

  // Bot: pick a uniformly random valid word; pass only when truly stuck.
  bot(state, seat, rng) {
    if (state.done || seat !== state.turn) return null;
    const words = availableWords(state);
    if (words.length === 0) return { type: "PASS" };
    return { type: "PLAY", word: words[rng.int(words.length)]! };
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

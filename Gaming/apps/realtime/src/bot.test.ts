import { describe, expect, it } from "vitest";
import { chooseBotAction, GAME_ENGINES, SeededRng, type AnyEngine } from "@aso/game-core";
import { GAME_SEATS, type GameKey } from "@aso/shared";
import { RandomBot } from "./bot.js";

describe("RandomBot — EASY/NORMAL виждат само редактирания изглед", () => {
  const spy = (): { engine: AnyEngine; seen: unknown[] } => {
    const seen: unknown[] = [];
    const engine = {
      legalActions: (s: unknown) => {
        seen.push(s);
        return [{ type: "X" }];
      },
      redact: (_s: unknown, seat: number) => ({ view: seat }),
    } as unknown as AnyEngine;
    return { engine, seen };
  };

  for (const d of ["EASY", "NORMAL"] as const) {
    it(`${d}: двигателят получава изгледа на мястото, не суровото състояние`, () => {
      const { engine, seen } = spy();
      new RandomBot("s", d).pick(engine, { secret: "AS" }, 1);
      expect(seen.length).toBeGreaterThan(0);
      for (const s of seen) expect(s).toEqual({ view: 1 });
    });
  }

  it("изгледът не променя избрания ход: същият избор като върху суровото състояние във всички игри", () => {
    for (const [game, engine] of Object.entries(GAME_ENGINES) as [GameKey, AnyEngine][]) {
      for (const d of ["EASY", "NORMAL"] as const) {
        const viaView = new RandomBot(`eq:${game}`, d);
        const rawRng = new SeededRng(`eq:${game}`);
        const gameRng = new SeededRng(`g:${game}`);
        let state = engine.init({ seats: GAME_SEATS[game] }, gameRng);
        for (let i = 0; i < 12 && !engine.isTerminal(state); i++) {
          let moved = false;
          for (let seat = 0; seat < GAME_SEATS[game]; seat++) {
            if (engine.legalActions(state, seat).length === 0) continue;
            const x = viaView.pick(engine, state, seat);
            const y = chooseBotAction(engine, state, seat, d, rawRng);
            expect(x, `${game}/${d} ход ${i}`).toEqual(y);
            if (x === null) continue;
            state = engine.reduce(state, x, gameRng).state;
            moved = true;
            break;
          }
          if (!moved) break;
        }
      }
    }
  }, 60_000);
});

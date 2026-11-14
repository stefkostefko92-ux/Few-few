import { describe, expect, it } from "vitest";
import { ball } from "@aso/shared";
import {
  eightBallEngine,
  nineBallEngine,
  onEightBall,
  SeededRng,
  snookerEngine,
  type CueActionX,
  type CueStateX,
} from "@aso/game-core";
import { onEight, openDecision } from "./cueDecision";

const rng = () => new SeededRng("cue-decision");
/** Нищо не е взето, мачът тече, топките стоят. */
const fresh = { live: true, animating: false, called: false, pushArmed: false, playedOn: false };

/**
 * Прозорецът за решение е отворен ТОЧНО когато решението е мое, мачът тече и
 * изборите в него са законни за двигателя — проверено върху истински
 * състояния от сървърния двигател (вкл. тези, до които ботът никога не стига:
 * той не прави push-out, затова „съперникът изигра push-out“ няма в e2e).
 */
describe("openDecision — кога излиза прозорецът на билярда", () => {
  it("8 топки на осмицата: „обяви джоб“ — до обявяването; без джоб ударът е незаконен", () => {
    const s: CueStateX = {
      ...eightBallEngine.init({ seats: 2 }, rng()),
      shotNo: 9,
      open: false,
      groups: ["solids", "stripes"],
      ballInHand: false,
      balls: [ball(0, 1.0, 0.5), ball(8, 1.5, 0.75), ball(9, 0.2, 0.2)],
    };
    expect(onEight(s)).toBe(onEightBall(s));
    expect(openDecision(s, 0, fresh)).toBe("call");
    expect(openDecision(s, 0, { ...fresh, called: true })).toBeNull();
    // Не е мой ред / мачът свърши / топките още се търкалят.
    expect(openDecision(s, 1, fresh)).toBeNull();
    expect(openDecision(s, 0, { ...fresh, live: false })).toBeNull();
    expect(openDecision(s, 0, { ...fresh, animating: true })).toBeNull();
    const shot: CueActionX = { type: "SHOOT", angle: 0.46, power: 0.9 };
    expect(eightBallEngine.validate!(s, 0, shot)).toBe(false);
    for (let pocket = 0; pocket < 6; pocket++) {
      expect(eightBallEngine.validate!(s, 0, { ...shot, pocket } as CueActionX)).toBe(true);
    }
    // Остава топка от групата ми — не съм на осмицата.
    const notYet = { ...s, balls: [...s.balls, ball(3, 0.3, 0.8)] };
    expect(onEight(notYet)).toBe(onEightBall(notYet));
    expect(openDecision(notYet, 0, fresh)).toBeNull();
    // Отворена маса / разбиване: никога.
    expect(openDecision(eightBallEngine.init({ seats: 2 }, rng()), 0, fresh)).toBeNull();
  });

  it("9 топки: push-out след разбиването (по желание), после „играя / върни удара“ за съперника", () => {
    const s0 = nineBallEngine.init({ seats: 2 }, rng());
    expect(openDecision(s0, 0, fresh), "при разбиването няма push-out").toBeNull();
    const s1 = nineBallEngine.reduce(s0, nineBallEngine.legalActions(s0, 0)[0]!, rng()).state;
    expect(s1.pushAvail).toBe(true);
    const pusher = s1.turn;
    const other = pusher === 0 ? 1 : 0;
    expect(openDecision(s1, pusher, fresh)).toBe("push");
    expect(openDecision(s1, other, fresh)).toBeNull();
    expect(openDecision(s1, pusher, { ...fresh, pushArmed: true })).toBeNull();
    const push: CueActionX = { type: "SHOOT", angle: Math.PI, power: 0.1, pushOut: true };
    expect(nineBallEngine.validate!(s1, pusher, push)).toBe(true);

    const s2 = nineBallEngine.reduce(s1, push, rng()).state;
    expect(s2.turn).toBe(other);
    expect(openDecision(s2, other, fresh)).toBe("pushReply");
    expect(openDecision(s2, pusher, fresh)).toBeNull();
    expect(openDecision(s2, other, { ...fresh, playedOn: true })).toBeNull();
    expect(nineBallEngine.validate!(s2, other, { type: "PASS" })).toBe(true);
    // Push-out само веднъж: след него и след „върни удара“ — нищо.
    const s3 = nineBallEngine.reduce(s2, { type: "PASS" }, rng()).state;
    expect(openDecision(s3, s3.turn, fresh)).toBeNull();
  });

  it("снукър след фал: „играя / нека играе пак / върни топките“ — само за входящия", () => {
    // Фал и пропуск: бялата бута настрани, без да докосне червената.
    const s: CueStateX = {
      ...snookerEngine.init({ seats: 2 }, rng()),
      ballInHand: false,
      shotNo: 4,
      turn: 0,
      balls: [ball(0, 0.5, 0.5), ball(11, 1.8, 0.2)],
    };
    expect(openDecision(s, 0, fresh)).toBeNull();
    const n = snookerEngine.reduce(
      s,
      { type: "SHOOT", angle: -Math.PI / 2, power: 0.05 },
      rng(),
    ).state;
    expect(n.foulChoice).toBe(true);
    expect(n.turn).toBe(1);
    expect(openDecision(n, 1, fresh)).toBe("foul");
    expect(openDecision(n, 0, fresh), "нарушителят не избира").toBeNull();
    expect(openDecision(n, 1, { ...fresh, playedOn: true })).toBeNull();
    expect(snookerEngine.validate!(n, 1, { type: "PASS" })).toBe(true);
    expect(snookerEngine.validate!(n, 1, { type: "REPLAY" })).toBe(!!n.missReplay);
    // Изборът е направен („нека играе пак“) — вече няма решение.
    const again = snookerEngine.reduce(n, { type: "PASS" }, rng()).state;
    expect(openDecision(again, again.turn, fresh)).toBeNull();
  });

  it("свършил мач: нищо", () => {
    const done = {
      ...nineBallEngine.init({ seats: 2 }, rng()),
      phase: "DONE" as const,
      pushAvail: true,
    };
    expect(openDecision(done, 0, fresh)).toBeNull();
  });
});

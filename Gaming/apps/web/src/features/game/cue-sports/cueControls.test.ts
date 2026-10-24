import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { POCKETS, runShot, spinOk, TABLE, ball } from "@aso/shared";
import {
  animFrameAt,
  FRAME_MS,
  pocketForSlot,
  pocketHole,
  replayDecision,
  snapSpin,
  spaceShoots,
} from "./cueControls";
import { makeCueCamera } from "./cueCamera";

describe("animFrameAt — възпроизвеждане по стенния часовник", () => {
  it("свършва точно когато сървърът смята, че анимацията е свършила (lastShotMs)", () => {
    const balls = [ball(0, 0.5, 0.5), ball(1, 1.35, 0.5), ball(2, 1.4, 0.53)];
    const frames = runShot(balls, { angle: 0, power: 0.8 }).frames.length;
    const lastShotMs = Math.round((frames * 1000) / 60); // формулата на двигателя
    expect(animFrameAt(lastShotMs - FRAME_MS, frames)).toBeLessThan(frames);
    expect(animFrameAt(lastShotMs + 1, frames)).toBe(frames);
  });

  it("бавна нишка пропуска кадри, не разтяга удара", () => {
    // Едно „тиктакане“ след 1 s показва кадър 60, не кадър 1.
    expect(animFrameAt(1000, 300)).toBe(60);
    expect(animFrameAt(0, 300)).toBe(0);
    expect(animFrameAt(-5, 300)).toBe(0);
    expect(animFrameAt(Number.NaN, 300)).toBe(0);
    expect(animFrameAt(1e9, 300)).toBe(300);
  });
});

describe("replayDecision — кой удар да се изиграе на екрана", () => {
  it("първото състояние на мача: начало (0) или влизане по средата → приема се тихо", () => {
    expect(replayDecision(null, 0, false)).toBe("adopt");
    expect(replayDecision(null, 7, true)).toBe("adopt");
  });
  it("живото разбиване (удар 1) се изиграва дори като първо състояние", () => {
    expect(replayDecision(null, 1, true)).toBe("animate");
  });
  it("регресия: два удара в един рендер (0 → 2) са жива игра, не влизане — последният се изиграва", () => {
    expect(replayDecision(0, 2, true)).toBe("animate");
    expect(replayDecision(3, 5, true)).toBe("animate");
  });
  it("повторно изпратено състояние на същия удар не прекъсва анимацията", () => {
    expect(replayDecision(4, 4, true)).toBe("skip");
    expect(replayDecision(4, 3, true)).toBe("skip");
    expect(replayDecision(0, 0, false)).toBe("skip");
  });
});

describe("snapSpin — ефектът винаги е в диска, който сървърът приема", () => {
  it("регресия: ръбът по диагонал (0.7071 → 0.71) вече не прави удара незаконен", () => {
    const s = snapSpin(0.9, 0.9);
    expect(spinOk(s.x, s.y)).toBe(true);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0.98); // остава на ръба
  });

  it("всяка точка от подложката (вкл. извън ръба) дава валиден ефект", () => {
    for (let px = -1.25; px <= 1.25; px += 0.0125) {
      for (let py = -1.25; py <= 1.25; py += 0.0125) {
        const s = snapSpin(px, py);
        if (!spinOk(s.x, s.y)) throw new Error(`(${px}, ${py}) → (${s.x}, ${s.y}) е извън диска`);
        expect(Math.round(s.x * 100)).toBeCloseTo(s.x * 100, 6); // мрежа 0.01
      }
    }
  });

  it("всяка посока по ръба е валидна (преди: 172 от 360 се отхвърляха)", () => {
    for (let a = 0; a < 3600; a++) {
      const r = (a / 10) * (Math.PI / 180);
      const s = snapSpin(1.2 * Math.cos(r), 1.2 * Math.sin(r));
      expect(spinOk(s.x, s.y)).toBe(true);
      expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0.98);
    }
  });

  it("стрелките от клавиатурата (стъпки 0.1 / 0.05) никога не излизат от диска", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let v = { x: 0, y: 0 };
    for (let i = 0; i < 5000; i++) {
      const d = rnd() < 0.5 ? 0.1 : 0.05;
      const k = Math.floor(rnd() * 4);
      v = snapSpin(v.x + (k === 0 ? d : k === 1 ? -d : 0), v.y + (k === 2 ? d : k === 3 ? -d : 0));
      expect(spinOk(v.x, v.y)).toBe(true);
    }
  });

  it("центърът е точно 0 (не −0) — „без ефект“", () => {
    const s = snapSpin(-0.001, -0.004);
    expect(Object.is(s.x, 0)).toBe(true);
    expect(Object.is(s.y, 0)).toBe(true);
  });
});

describe("spaceShoots — Space стреля, освен при писане", () => {
  it("плъзгачът за сила (range) не поглъща Space", () => {
    expect(spaceShoots({ tagName: "INPUT", type: "range" })).toBe(true);
  });
  it("текстовите полета задържат Space", () => {
    expect(spaceShoots({ tagName: "INPUT", type: "text" })).toBe(false);
    expect(spaceShoots({ tagName: "INPUT" })).toBe(false);
    expect(spaceShoots({ tagName: "input", type: "search" })).toBe(false);
    expect(spaceShoots({ tagName: "TEXTAREA" })).toBe(false);
    expect(spaceShoots({ tagName: "SELECT" })).toBe(false);
    expect(spaceShoots({ tagName: "DIV", isContentEditable: true })).toBe(false);
  });
  it("бутон, ефект (svg) или нищо на фокус → удар", () => {
    expect(spaceShoots({ tagName: "BUTTON" })).toBe(true);
    expect(spaceShoots({ tagName: "svg" })).toBe(true);
    expect(spaceShoots({ tagName: "BODY" })).toBe(true);
    expect(spaceShoots(null)).toBe(true);
  });
});

describe("pocketHole — натискане върху отвора обявява джоба, до него се прицелва", () => {
  it("отворът на всеки джоб обявява точно него", () => {
    POCKETS.forEach(([x, y], pocket) => {
      expect(pocketHole({ x, y })).toBe(pocket);
      expect(pocketHole({ x: x + (x < 1 ? 1 : -1) * TABLE.pocketR * 0.7, y })).toBe(pocket);
    });
  });

  it("регресия: топка (или призрачна топка) в устието на джоба е прицел, не обявяване", () => {
    // Най-близо до джоба център на топка може да е на pocketR (иначе е вкарана).
    POCKETS.forEach(([px, py]) => {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const p = {
          x: px + Math.cos(a) * TABLE.pocketR * 1.02,
          y: py + Math.sin(a) * TABLE.pocketR * 1.02,
        };
        expect(pocketHole(p)).toBe(-1);
      }
      // …и всичко на една топка от отвора (старата зона 2.2×R го поглъщаше).
      const q = {
        x: px + (px < 1 ? 1 : -1) * (TABLE.pocketR + TABLE.ballR),
        y: py + (py < 0.5 ? 1 : -1) * TABLE.ballR,
      };
      expect(pocketHole(q)).toBe(-1);
    });
  });
});

describe("pocketForSlot — бутоните за джоб следват картината на екрана", () => {
  /** Екранен слот (0 горе-ляво … 5 долу-дясно) на точка в NDC. */
  const slotOf = (ndcX: number, ndcY: number): number => {
    const col = ndcX < -0.33 ? 0 : ndcX > 0.33 ? 2 : 1;
    const row = ndcY > 0 ? 0 : 1; // NDC +y = горе
    return row * 3 + col;
  };

  it("2D: джоб i е точно където го рисува SVG (горният ред е y = 0)", () => {
    POCKETS.forEach(([x, y], pocket) => {
      const ndcX = (x / TABLE.w) * 2 - 1;
      const ndcY = 1 - (y / TABLE.h) * 2;
      expect(pocketForSlot(slotOf(ndcX, ndcY), false)).toBe(pocket);
    });
  });

  it("3D: слотът съвпада с проекцията на истинската камера на масата", () => {
    const camera = makeCueCamera();
    POCKETS.forEach(([x, y], pocket) => {
      const v = new Vector3(x - TABLE.w / 2, 0, y - TABLE.h / 2).project(camera);
      expect(pocketForSlot(slotOf(v.x, v.y), true)).toBe(pocket);
    });
  });

  it("съответствието е обратимо (слот ↔ джоб)", () => {
    for (let k = 0; k < 6; k++) {
      expect(pocketForSlot(pocketForSlot(k, true), true)).toBe(k);
      expect(pocketForSlot(k, false)).toBe(k);
    }
  });
});

import type { CueState } from "@aso/shared";

/**
 * Решенията на масата за билярд — моментите, в които играчът избира нещо, а
 * не просто удря. Всяко излиза само като прозорец (DecisionPrompt), когато е
 * на ред:
 *  - `call`      — 8 топки на осмицата: обяви джоб (задължително — без него
 *                  ударът не тръгва);
 *  - `push`      — 9 топки, ударът след разбиването: push-out (по желание);
 *  - `pushReply` — 9 топки след push-out на съперника: играя / връщам удара
 *                  (задължително);
 *  - `foul`      — снукър след фал на съперника: играя / нека играе пак /
 *                  (при пропуск) върни топките (задължително).
 */
export type CueDecision = "call" | "push" | "pushReply" | "foul";

/** Полетата на състоянието, по които се решава (CueState + разширенията на двигателя). */
export type CueDecisionState = Pick<
  CueState,
  "variant" | "phase" | "turn" | "open" | "shotNo" | "groups" | "balls"
> & {
  pushAvail?: boolean;
  pushDecision?: boolean;
  foulChoice?: boolean;
};

/** 8 топки: играчът на ход е на осмицата — групата му е изчистена (същото
 *  правило като `onEightBall` в двигателя; паритетът е в теста). */
export function onEight(s: CueDecisionState): boolean {
  if (s.variant !== "EIGHTBALL" || s.open || s.shotNo === 0) return false;
  const g = s.groups[s.turn] ?? null;
  if (g === null) return false;
  const mine = (id: number) => (g === "solids" ? id >= 1 && id <= 7 : id >= 9 && id <= 15);
  return !s.balls.some((b) => !b.potted && mine(b.id));
}

/**
 * Кое решение е отворено за `seat` сега — или null. Само когато мачът тече,
 * ходът е мой и топките не се търкалят; а вече взетото решение (обявен джоб,
 * обявен push-out, „Играя аз“) го затваря.
 */
export function openDecision(
  s: CueDecisionState,
  seat: number,
  f: {
    /** Мачът тече (фаза „playing“). */
    live: boolean;
    /** Анимацията на последния удар още върви. */
    animating: boolean;
    /** 8 топки: джобът вече е обявен. */
    called: boolean;
    /** 9 топки: push-out вече е обявен. */
    pushArmed: boolean;
    /** „Играя аз“ — вече избрано за това положение. */
    playedOn: boolean;
  },
): CueDecision | null {
  if (!f.live || f.animating || s.phase !== "PLAY" || s.turn !== seat) return null;
  if (s.variant === "EIGHTBALL") return onEight(s) && !f.called ? "call" : null;
  if (s.variant === "NINEBALL") {
    if (s.pushDecision) return f.playedOn ? null : "pushReply";
    if (s.pushAvail) return f.pushArmed ? null : "push";
    return null;
  }
  return s.foulChoice && !f.playedOn ? "foul" : null;
}

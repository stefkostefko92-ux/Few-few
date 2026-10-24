import { clampSpin, POCKETS, spinOk, TABLE } from "@aso/shared";

/**
 * Pure rules behind the cue table's controls (kept out of the React view so
 * they are unit-tested): shot playback timing, the spin value a player can
 * pick, the Space shortcut and the on-screen order of the pocket buttons.
 */

/** One animation frame of `runShot` (the physics samples at 60 fps). The
 *  engine's `lastShotMs` — by which the server paces the bot and extends the
 *  turn clock — is exactly `frames.length × FRAME_MS`. */
export const FRAME_MS = 1000 / 60;

/**
 * Frame to show `elapsedMs` after the shot started. Playback follows the WALL
 * CLOCK, not timer ticks: a busy or throttled main thread (slow phone, heavy
 * 3D frame, background tab) drops frames instead of stretching the shot. A
 * tick-per-frame player ran 2–3× longer than `lastShotMs`, so the bot's next
 * shot cut the animation short and the player's clock burnt while the balls
 * were still rolling. Returns `frameCount` once the shot is over.
 */
export function animFrameAt(elapsedMs: number, frameCount: number): number {
  if (!(elapsedMs > 0)) return 0;
  // × 60 / 1000 rather than ÷ FRAME_MS: 1000 / (1000 / 60) is 59.999… in floats.
  return Math.min(frameCount, Math.floor((elapsedMs * 60) / 1000));
}

/**
 * What the view does with a state carrying shot `shotNo`, having caught up
 * with `seen` (null = no state of this match seen yet):
 *  - "adopt"   — the first state of a match joined/resumed mid-way: take the
 *                count silently (replaying a stale shot would be wrong);
 *  - "animate" — replay the state's last shot (a live break is shot 1);
 *  - "skip"    — nothing new (a re-broadcast of the same shot).
 * "Seen 0" is a real value: two shots rendered in one batch (0 → 2) are a
 * live game, not a rejoin — the latest shot still plays.
 */
export function replayDecision(
  seen: number | null,
  shotNo: number,
  hasLastShot: boolean,
): "adopt" | "animate" | "skip" {
  if (seen === null && shotNo !== 1) return "adopt";
  if (!hasLastShot || shotNo <= (seen ?? 0)) return "skip";
  return "animate";
}

export interface SpinValue {
  /** −1..1 — вляво/вдясно от центъра спрямо посоката на удара. */
  x: number;
  /** −1..1 — долу (draw) / горе (follow). */
  y: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const trunc2 = (v: number): number => Math.trunc(v * 100) / 100;

/**
 * The spin a player picked, on a 0.01 grid and ALWAYS inside the unit disk
 * the server accepts (`spinOk`). Rounding a point already on the rim could
 * land outside it (0.7071 → 0.71 per axis = |1.004|): about half of the rim
 * directions made every shot come back as an illegal action. When rounding
 * overshoots (judged by the server's own `spinOk`), the components are cut
 * toward the centre instead.
 */
export function snapSpin(x: number, y: number): SpinValue {
  const c = clampSpin(x, y);
  let sx = round2(c.spinX);
  let sy = round2(c.spinY);
  if (!spinOk(sx, sy)) {
    sx = trunc2(c.spinX);
    sy = trunc2(c.spinY);
  }
  // `+ 0` folds −0 into 0 (a centred pad must read as "no spin").
  return { x: sx + 0, y: sy + 0 };
}

/** What `spaceShoots` needs to know about the focused element. */
export interface FocusTarget {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

/**
 * Should Space shoot with this element focused? Only text entry keeps the key
 * (chat, any typing). The power slider is an `<input type="range">`: once the
 * player had dragged it, focus stayed there and Space silently did nothing —
 * exactly the moment they wanted to shoot.
 */
export function spaceShoots(el: FocusTarget | null | undefined): boolean {
  if (!el) return true;
  if (el.isContentEditable) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return false;
  if (tag === "INPUT") return (el.type ?? "text").toLowerCase() === "range";
  return true;
}

/**
 * 8-ball on the 8: the pocket whose HOLE the felt point is on (a press there
 * calls it), or -1. Only the hole: a zone of 2.2× its radius swallowed presses
 * on a ball or ghost-ball spot next to a pocket, so the 8 sitting in the jaws
 * could not be aimed at. No ball centre is ever inside a hole (it would have
 * dropped), so the hole never competes with aiming.
 */
export function pocketHole(p: { x: number; y: number }): number {
  return POCKETS.findIndex(([px, py]) => (px - p.x) ** 2 + (py - p.y) ** 2 <= TABLE.pocketR ** 2);
}

/**
 * Pocket called from the button in screen slot `slot` (0 top-left, 1 top-middle,
 * 2 top-right, 3 bottom-left, 4 bottom-middle, 5 bottom-right — the order of
 * the `cue.pockets.*` labels and arrow glyphs). The 2D table is drawn exactly
 * as the engine indexes its pockets; the 3D camera looks from the far long
 * rail, so its picture is the 2D one turned 180° and the pocket shown in slot
 * k is pocket 5 − k. The mapping is its own inverse (slot ↔ pocket).
 */
export function pocketForSlot(slot: number, rotated: boolean): number {
  return rotated ? 5 - slot : slot;
}

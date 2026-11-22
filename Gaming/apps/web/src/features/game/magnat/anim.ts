/** Време за прескок на пула през едно поле (ms). */
export const HOP_MS = 145;
/** Таван на един кадър за анимациите: пази само от скок след скрит раздел. */
export const MAX_FRAME_MS = 1000;

/**
 * Продължителност на кадъра за анимациите — по стенния часовник. При предишния
 * таван от 50 ms бавен рендер (софтуерен WebGL, секунди на кадър) разтягаше
 * 1,5-секундна разходка на пула до минути непрекъснато рисуване.
 */
export function frameDt(now: number, last: number): number {
  return last ? Math.min(now - last, MAX_FRAME_MS) : 16;
}

/** Придвижва разходката поле по поле с `dt` ms; true, щом е стигнала последното поле. */
export function advanceWalk(w: { seg: number; t: number }, segments: number, dt: number): boolean {
  w.t += dt / HOP_MS;
  while (w.t >= 1 && w.seg < segments - 1) {
    w.seg += 1;
    w.t -= 1;
  }
  return w.seg >= segments - 1 && w.t >= 1;
}

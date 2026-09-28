/**
 * Easing primitives for the combat choreographer.
 *
 * Every curve takes `t` in [0,1] and returns a value in [0,1]; the executor
 * blends two keyframes' values with that as the mix factor. `hold` always
 * returns 0 — i.e. snap to the LEFT keyframe — which is how camera "freeze"
 * frames and hit-stop framing are encoded.
 *
 * The library is intentionally tiny and dependency-free so it can be imported
 * from track executors, timeline definitions and the lil-gui live-tune panel.
 */

export type Ease =
  | 'linear'
  | 'cubicIn' | 'cubicOut' | 'cubicInOut'
  | 'expoOut' | 'expoInOut'
  | 'elasticOut'
  | 'sine'
  | 'hold';

const EASES: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  expoOut: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  expoInOut: (t) => t === 0 ? 0 : t === 1 ? 1 :
    t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  // Slight overshoot for snappy recovery (sword tip flick, dolly-zoom settle).
  elasticOut: (t) => {
    if (t === 0 || t === 1) return t;
    const c = (2 * Math.PI) / 0.3;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * c) + 1;
  },
  sine: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
  // `hold` means: do not interpolate; stay on the LEFT keyframe until the
  // segment ends. Used for hit-stop frames and dolly-zoom locks.
  hold: () => 0,
};

export function ease(t: number, fn: Ease | undefined): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return (EASES[fn ?? 'linear'])(clamped);
}

/** Linear blend between two scalars by an easing fraction. */
export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

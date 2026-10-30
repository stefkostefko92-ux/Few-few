// How many device pixels the lift's stage draws per CSS pixel. While something moves: the screen's own up to the tier's
// cap, times the governor's scale (it holds the frame rate). For a still picture: the tier's still cap, above the
// screen's own a supersampled frame the browser scales down. Both bounded in pixels, for the GPU's memory at full
// screen (the HDR targets and the temporal filter's history grow with them). Pure.
import type { Quality } from '../machine/quality';

/** Pixels drawn at most while moving and for a still picture (4K). */
export const MOTION_PIXELS = 6e6;
export const STILL_PIXELS = 3840 * 2160;
const MIN_RATIO = 0.5;

/** `w`, `h`: the canvas in CSS pixels; `dpr`: the screen's device pixel ratio; `scale`: the governor's. */
export function motionRatio(q: Quality, scale: number, w: number, h: number, dpr: number): number {
  return Math.max(MIN_RATIO, Math.min(Math.min(dpr, q.maxDPR) * scale, Math.sqrt(MOTION_PIXELS / Math.max(1, w * h))));
}

export function stillRatio(q: Quality, w: number, h: number): number {
  return Math.max(MIN_RATIO, Math.min(q.stillDPR, Math.sqrt(STILL_PIXELS / Math.max(1, w * h))));
}

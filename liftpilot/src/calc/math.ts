import { K } from './norme';

export const G = K.g;
export const rad = (d: number): number => (d * Math.PI) / 180;
export const deg = (r: number): number => (r * 180) / Math.PI;
/** T1/T2 with T1 the larger pull; Infinity when a side is slack. */
export const ratio = (a: number, b: number): number => (Math.min(a, b) <= 0 ? Infinity : Math.max(a, b) / Math.min(a, b));
/** Rounds up to a step, tolerant of the floating-point noise just above a multiple. */
export const ceilTo = (x: number, step: number): number => Math.ceil(x / step - 1e-9) * step;

// What the two surveys of a drawing in the browser share (the shaft on /progetto, SurveyPanel; the machine room of a
// replacement, LocaleCad, round 50): a click measured with the four rays — the walls' direction taken from the segments
// within 3 m of the point, the rays up to 30 m, both in millimetres whatever the drawing's unit — and an error of the
// reading as the key of its text (shaft.err_*). Pure, and light: the reader itself (read.ts, acad-ts) is loaded only
// when a file is chosen.
import type { CadModel } from './model';
import { castRays, dominantAngle, type Survey } from './measure';

/** The segments within this distance of the point clicked give the walls' direction [mm]. */
export const ANGLE_PROBE_MM = 3000;
/** No wall within this distance of the point: it is not closed in [mm]. */
export const RAY_MAX_MM = 30000;

/** The clear rectangle around a point clicked on the drawing; null when the point is not closed in. */
export function pickSurvey(m: CadModel, visible: (layer: number) => boolean, x: number, y: number, mmPerUnit: number): Survey | null {
  return castRays(m, visible, x, y, dominantAngle(m, visible, x, y, ANGLE_PROBE_MM / mmPerUnit), RAY_MAX_MM / mmPerUnit);
}

/** Why a drawing could not be read (CadReadError.code in read.ts), each with its text. */
export const CAD_READ_ERRORS = ['tooLarge', 'dwgVersion', 'unreadable', 'empty'] as const;
export type CadReadErrorCode = (typeof CAD_READ_ERRORS)[number];

/** An error of the reading as its code and detail (a DWG's version); any other error is «unreadable». */
export function cadReadError(e: unknown): { code: CadReadErrorCode; detail: string } {
  const code = e instanceof Error && 'code' in e ? String(e.code) : '', detail = e instanceof Error && 'detail' in e ? String(e.detail) : '';
  return { code: CAD_READ_ERRORS.find((c) => c === code) ?? 'unreadable', detail };
}

// The pit's buffers by type (registry ammortizzatori.*): linear energy accumulation (springs) and non-linear
// (polyurethane pads) up to 1 m/s, energy dissipation (hydraulic) at any speed; the stroke the geometry takes (a
// polyurethane pad is fully compressed at 90 % of its height), the stroke the rated speed needs, and a typical buffer
// of each type from the catalogues of the registry. Pure.
import { KV_VERT } from './norme-vert';
import { DEFAULT_VERTICAL, type BufferType, type VerticalInputs } from './vertical';

export const BUFFER_TYPES: readonly BufferType[] = ['spring', 'pu', 'oil'];

/** The buffers' type the software takes where none is chosen: springs up to KV_VERT.springMaxV, energy dissipation
 *  (hydraulic) over it, the only type the rated speed allows there (UNI EN 81-20:2020, 5.8.1.5; registry
 *  ammortizzatori.idraulici). */
export const standardBufferType = (v: number): BufferType => (v > KV_VERT.springMaxV + 1e-9 ? 'oil' : 'spring');

export const bufferType = (V: VerticalInputs, side: 'car' | 'cw'): BufferType => (side === 'car' ? V.carBufferType : V.cwBufferType) ?? standardBufferType(V.v);

/** The stroke the section takes [mm]: a polyurethane pad's 90 % of its height, else the one entered. */
export function bufferStroke(V: VerticalInputs, side: 'car' | 'cw'): number {
  const h = side === 'car' ? V.carBufferH : V.cwBufferH;
  return bufferType(V, side) === 'pu' ? Math.round(KV_VERT.puStroke * h) : side === 'car' ? V.carBufferStroke : V.cwBufferStroke;
}

/** The least stroke the rated speed needs [mm]; 0: none by formula (a pad's certificate gives its masses). */
export function strokeNeeded(V: VerticalInputs, t: BufferType): number {
  const v2 = V.v * V.v * 1000;
  return t === 'pu' ? 0 : t === 'oil' ? KV_VERT.oilStrokeK * v2 : Math.max(KV_VERT.strokeMin, KV_VERT.strokeK * v2);
}

/** The highest rated speed the type allows [m/s]; null: any. */
export const maxSpeed = (t: BufferType): number | null => (t === 'oil' ? null : KV_VERT.springMaxV);

/** A typical buffer of the type at the rated speed v: its height and stroke [mm] (a pad's stroke follows its height). */
export function typicalBuffer(t: BufferType, v: number): { h: number; stroke: number } {
  if (t === 'pu') return { h: KV_VERT.puTypical, stroke: Math.round(KV_VERT.puStroke * KV_VERT.puTypical) };
  if (t === 'oil') {
    const o = KV_VERT.oilTypical.find((_, i) => v <= [1, 1.6][i] + 1e-9);
    if (o) return { h: Math.round(o[0]), stroke: Math.floor(o[1]) };
    const stroke = Math.ceil((KV_VERT.oilStrokeK * v * v * 1000) / 10) * 10;
    return { h: Math.round((stroke * KV_VERT.oilTypical[1][0]) / KV_VERT.oilTypical[1][1]), stroke };
  }
  return { h: DEFAULT_VERTICAL.carBufferH, stroke: DEFAULT_VERTICAL.carBufferStroke };
}

/** The vertical data with the buffers of a side changed to a type: a typical buffer of it, its base raised or lowered
 *  so that the buffer's top (and the run-by) stays where it was. */
export function withBufferType(V: VerticalInputs, side: 'car' | 'cw', t: BufferType): VerticalInputs {
  const b = typicalBuffer(t, V.v);
  if (side === 'car') return { ...V, carBufferType: t, carBufferH: b.h, carBufferStroke: b.stroke, carBufferBase: Math.max(0, V.carBufferBase + V.carBufferH - b.h) };
  return { ...V, cwBufferType: t, cwBufferH: b.h, cwBufferStroke: b.stroke, cwBufferBase: Math.max(0, V.cwBufferBase + V.cwBufferH - b.h) };
}

/** The vertical data with the buffers left to the software as its standard for the rated speed: a side whose type is
 *  not chosen takes standardBufferType and, where its height and stroke are still the standard springs' (DEFAULT_VERTICAL),
 *  the typical buffer of that type, its base moved so that its top stays (as withBufferType). Up to KV_VERT.springMaxV,
 *  or with the type chosen, the data as they are (the same object). The layout takes the shaft through it (layout.ts),
 *  so the section, the checks, the drawings and the 3D show the one buffer; the form shows it as the software's. */
export function withStandardBuffers(V: VerticalInputs): VerticalInputs {
  const t = standardBufferType(V.v), D = DEFAULT_VERTICAL;
  if (t === 'spring') return V;
  const b = typicalBuffer(t, V.v), own = (x: number, std: number, typical: number): number => (x === std ? typical : x);
  let X = V;
  if (!V.carBufferType) {
    const h = own(V.carBufferH, D.carBufferH, b.h);
    X = { ...X, carBufferH: h, carBufferStroke: own(V.carBufferStroke, D.carBufferStroke, b.stroke), carBufferBase: Math.max(0, V.carBufferBase + V.carBufferH - h) };
  }
  if (!V.cwBufferType) {
    const h = own(V.cwBufferH, D.cwBufferH, b.h);
    X = { ...X, cwBufferH: h, cwBufferStroke: own(V.cwBufferStroke, D.cwBufferStroke, b.stroke), cwBufferBase: Math.max(0, V.cwBufferBase + V.cwBufferH - h) };
  }
  return X;
}

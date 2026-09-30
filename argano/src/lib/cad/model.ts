// A CAD drawing reduced to what the shaft survey needs: straight segments by layer, in drawing units, with the
// scale to millimetres. Arcs, circles, polylines with bulges and splines arrive already cut into segments; blocks
// arrive exploded. Pure types and helpers: the reader is read.ts (acad-ts), the measure is measure.ts.

export type CadUnits = 'mm' | 'cm' | 'dm' | 'm' | 'in' | 'ft' | 'unknown';

/** Millimetres per drawing unit; a unitless drawing is taken as millimetres until the user says otherwise. */
export const MM_PER_UNIT: Readonly<Record<CadUnits, number>> = { mm: 1, cm: 10, dm: 100, m: 1000, in: 25.4, ft: 304.8, unknown: 1 };

/** $INSUNITS of the DXF/DWG header → units. */
export function unitsOf(insUnits: number): CadUnits {
  switch (insUnits) {
    case 1: return 'in';
    case 2: return 'ft';
    case 4: return 'mm';
    case 5: return 'cm';
    case 6: return 'm';
    case 14: return 'dm';
    default: return 'unknown';
  }
}

export interface CadLayer {
  name: string;
  /** segments on the layer */
  count: number;
  /** off or frozen in the file, or a layer of dimensions, texts or hatches by its name: not used to measure */
  hidden: boolean;
}

export interface CadModel {
  name: string;
  format: 'dxf' | 'dwg';
  /** version string of the file, e.g. AC1027 */
  version: string;
  units: CadUnits;
  layers: CadLayer[];
  /** x1, y1, x2, y2 of every segment, in drawing units */
  seg: Float64Array;
  /** index into layers of every segment */
  layerOf: Uint16Array;
  count: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** more segments than the reader keeps */
  truncated: boolean;
  /** entities not drawn: texts, dimensions, hatches, images, 3D solids */
  skipped: number;
}

/** Layers usually holding annotations, not walls: hidden by default so the measure does not stop on them. */
const ANNOTATION = /(quot|dim|text|testo|scritt|hatch|tratt|campit|arred|furn|asse|axis|griglia|grid|defpoints)/i;
export const isAnnotationLayer = (name: string): boolean => ANNOTATION.test(name);

/** "AC1027"-style version of a DWG, null when the bytes are not a DWG. */
export function dwgVersion(bytes: Uint8Array): string | null {
  if (bytes.length < 6) return null;
  const s = String.fromCharCode(...bytes.subarray(0, 6));
  return /^AC10\d\d$/.test(s) ? s : null;
}

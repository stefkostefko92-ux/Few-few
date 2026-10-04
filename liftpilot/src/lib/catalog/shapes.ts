// The makers' machines as they are (src/shaft/machine-shape.ts), each brand from its own documents: SICOR from its
// technical sheets and CAD models (shapes-sicor.ts), Montanari from the dimensioned drawings of its range sheets
// (shapes-montanari.ts), Sassi from those of its catalogue (shapes-sassi.ts, shapes-sassi-mf.ts). A catalogue model
// without a shape keeps the generic machine. Pure.
import type { MachineShape } from '@/shaft/machine-shape';
import { MONTANARI_SHAPES } from './shapes-montanari';
import { SASSI_SHAPES } from './shapes-sassi';
import { SASSI_MF_SHAPES } from './shapes-sassi-mf';
import { SICOR_SHAPES } from './shapes-sicor';

export const SHAPES: readonly MachineShape[] = [...SICOR_SHAPES, ...MONTANARI_SHAPES, ...SASSI_SHAPES, ...SASSI_MF_SHAPES];

/** The shape of a catalogue machine; null for a model without one (the generic machine stands in). */
export const shapeOf = (brand: string, model: string): MachineShape | null => SHAPES.find((s) => s.brand === brand && s.model === model) ?? null;

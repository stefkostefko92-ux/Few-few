// What a component section of the relazione tecnica di modifica gives the derivation: its component's data, its checks,
// its points and the data it misses. Types only.
import type { CheckStatus } from '@/calc/types';
import type { ComponenteRt, MancanteRt, PuntoRt, RtCheck } from '../types';

/** A check of the RT's own, computed: its status, value and limit (a window: limitMin to limit). */
export interface Esito {
  status: CheckStatus;
  value: number | null;
  limit: number | null;
  limitMin?: number | null;
}

export interface EsitoSezione {
  componente: ComponenteRt;
  checks: RtCheck[];
  punti: PuntoRt[];
  mancanti: MancanteRt[];
}

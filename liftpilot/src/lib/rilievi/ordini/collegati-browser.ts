// The linked data for the browser (collegati-client.ts and prefill-client.ts): the links with their names and places,
// nothing of the sheet's data. Plain data a server page hands to the form as a prop (no inline script: the CSP allows
// none); rilievi put the same object, as JSON, in a <script type="application/json"> (src/ordini/collegati-browser.ts,
// commit 988f3cf37).
import { fieldByKey, type FieldKind } from '../fields';
import type { RilieviT } from '../t';
import { COLLEGAMENTI, confrontato, type Luogo, type MembroNumero, type MembroScelta } from './collegamenti';
import { SLOTS, type ModuloSlot, type Prefisso } from './registry';

/** Who writes the sheet — for the modules' fields with the company and the person (prefill-client.ts). */
export interface ContestoBrowser {
  azienda: string;
  utente: string;
  ruolo: string;
  email: string;
}

/** The sheet's field for the browser: its kind and bounds — a value from a module goes in only when it fits («480 kg» →
 *  480 in the load; «1,6» is no number of stops). */
export interface CampoScheda {
  kind?: FieldKind;
  min?: number;
  max?: number;
  maxLength?: number;
}

export type MembroBrowser = (Extract<MembroNumero | MembroScelta, { luogo: 'scheda' }> & CampoScheda) | Exclude<MembroNumero | MembroScelta, { luogo: 'scheda' }>;

export interface GruppoBrowser {
  key: string;
  tipo: 'numero' | 'scelta';
  /** the link's name (`collegati.<key>`) */
  nome: string;
  /** compared (the list of discrepancies) or prefill only */
  confronto: boolean;
  membri: MembroBrowser[];
}

export interface CollegatiDati {
  /** the column of each module: the modules of one column (the panel — Pelazza and MoviLift) lend their values to each
   *  other when the make changes */
  colonne: Record<Prefisso, ModuloSlot['column']>;
  /** the places' names (`collegati.luogo.<place>`) */
  luoghi: Record<Luogo, string>;
  gruppi: GruppoBrowser[];
  contesto: ContestoBrowser;
}

function campoScheda(key: string): CampoScheda {
  const field = fieldByKey(key);
  if (!field) return {};
  return {
    kind: field.kind,
    ...('min' in field ? { min: field.min, max: field.max } : {}),
    ...('maxLength' in field ? { maxLength: field.maxLength } : {}),
  };
}

/** The links for the browser — with their names and their places', nothing of the sheet's data. */
export function collegatiPerBrowser(t: RilieviT, contesto: ContestoBrowser): CollegatiDati {
  const membri = (list: readonly (MembroNumero | MembroScelta)[]): MembroBrowser[] =>
    list.map((m) => (m.luogo === 'scheda' ? { ...m, ...campoScheda(m.campo) } : m));
  const luoghi: Luogo[] = ['scheda', ...SLOTS.map((slot) => slot.prefix)];
  return {
    colonne: Object.fromEntries(SLOTS.map((slot) => [slot.prefix, slot.column])) as Record<Prefisso, ModuloSlot['column']>,
    luoghi: Object.fromEntries(luoghi.map((luogo) => [luogo, t(`collegati.luogo.${luogo}`)])) as Record<Luogo, string>,
    gruppi: COLLEGAMENTI.map((link) => ({ key: link.key, tipo: link.tipo, nome: t(`collegati.${link.key}`), confronto: confrontato(link), membri: membri(link.membri) })),
    contesto,
  };
}

// «Dati Generali» of the RT after the owner's model (round 52): which components the fascicolo must carry and why — the
// parts the calculation's intervention replaces, and what the changes of the loads and of the speed bring (the model's
// hints G89:G102, which there only appear on screen and select nothing: corrected, they bring the component in, E-DG-5,
// E-DG-6, E-DG-8) — the components the engineer adds, and the order of the fascicolo with its pages. Pure.
import type { Parte } from '../lift/collaudo';
import { COMPONENTI_RT2, type ComponenteRt2, type ContestoRt2 } from './types';

/** Why a component is in: a part replaced, a change of the loads or of the speed (with its clause), or the engineer's
 *  choice. */
export interface MotivoRt2 {
  tipo: 'parte' | 'carico' | 'velocita' | 'scelta';
  testo: string;
}

/** The parts each component describes (the model's component buttons over the calculation's parts «Sì»). */
const PER_PARTE: Readonly<Partial<Record<Parte, readonly ComponenteRt2[]>>> = {
  controller: ['quadro'], car: ['cabina'], sling: ['cabina'], ropes: ['funi'], machine: ['macchina', 'funi'], rails: ['guideCabina'],
  cw: ['contrappeso'], buffers: ['ammCabina', 'ammCwt'], governor: ['limitatore'], landingDoors: ['porte'], carDoors: ['porte'],
  slidingDoors: ['porte'], safetyGear: ['cabina', 'guideCabina'],
};
const NOME_PARTE: Readonly<Partial<Record<Parte, string>>> = {
  controller: 'quadro di manovra', car: 'cabina', sling: 'arcata', ropes: 'funi di trazione', machine: 'argano', rails: 'guide',
  cw: 'contrappeso', buffers: 'ammortizzatori', governor: 'limitatore di velocità', landingDoors: 'porte di piano', carDoors: 'porte di cabina',
  slidingDoors: 'porte di cabina scorrevoli', safetyGear: 'paracadute',
};

/** What a change of the loads brings (the model's G89–G91 and G101, UNI 10411-1:2024 6.1, 6.4–6.8) and of the speed
 *  (G89–G91, G101–G102, 15.2–15.15). */
const PER_CARICO: readonly ComponenteRt2[] = ['funi', 'guideCabina', 'ammCabina', 'contrappeso', 'ammCwt', 'cabina'];
const PER_VELOCITA: readonly ComponenteRt2[] = ['funi', 'guideCabina', 'ammCabina', 'ammCwt', 'limitatore', 'cabina'];

/** The components the RT must carry, each with its reasons, in the fascicolo's order. */
export function componentiRichiesti(ctx: ContestoRt2): Map<ComponenteRt2, MotivoRt2[]> {
  const out = new Map<ComponenteRt2, MotivoRt2[]>();
  const add = (c: ComponenteRt2, m: MotivoRt2): void => { out.set(c, [...(out.get(c) ?? []), m]); };
  for (const p of ctx.parti) for (const c of PER_PARTE[p] ?? []) add(c, { tipo: 'parte', testo: `parte sostituita: ${NOME_PARTE[p] ?? p}` });
  const v = ctx.carico, u1 = ctx.norma === '10411-1' ? 'UNI 10411-1:2024' : 'UNI 10411-11:2024';
  if (v && (v.p1 || v.p2 || v.calo || v.rapporto)) {
    const perche = v.p1 ? 'portata o carico statico T* = P + Q oltre il prospetto 1' : v.p2 ? 'contrappeso oltre il prospetto 2'
      : v.calo ? 'carico statico o contrappeso diminuiti' : 'rapporto dei carichi sospesi variato';
    for (const c of PER_CARICO) add(c, { tipo: 'carico', testo: `${perche} (${u1}, 6.1)` });
  }
  const s = ctx.velocita;
  if (s && (ctx.norma === '10411-1' ? s.aumento : s.variata)) {
    for (const c of PER_VELOCITA) add(c, { tipo: 'velocita', testo: ctx.norma === '10411-1' ? `velocità aumentata oltre il 5 % (${u1}, 15.1)` : `velocità variata (${u1}, 15)` });
  }
  return new Map(COMPONENTI_RT2.filter((c) => out.has(c)).map((c) => [c, out.get(c) ?? []]));
}

/** The components of the fascicolo: the required ones and those the engineer adds, in the model's order. */
export const componentiScelti = (richiesti: ReadonlyMap<ComponenteRt2, unknown>, aggiunti: readonly ComponenteRt2[]): ComponenteRt2[] =>
  COMPONENTI_RT2.filter((c) => richiesti.has(c) || aggiunti.includes(c));

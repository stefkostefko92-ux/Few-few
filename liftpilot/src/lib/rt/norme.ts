// The registry of the relazione tecnica di modifica (round 49): the numbers of the standards its own checks use (KR),
// the obligations of the parts UNI 10411 has no point of their own for (OBBLIGHI_RT: new rails, buffers, counterweight,
// and under -11 the sling), and the shape of its entries (VOCI_RT, norme-voci.ts). Every number of KR has an entry whose
// text states it (rt-norme.test.ts); the numbers reused from the shaft's registries (KV_VERT, KV_GOV) keep their own
// entries and are named in ours. Clause numbers and values only, in our words, read on the standards' text with the
// norm expert (research/norme-ascensori, private: nothing of its text here); nothing from the third-party template.
// These obligations never enter AMBITO_*/OBBLIGHI_*/KL (the scope key of ambito-version stays). Pure.
import type { Stato } from '@/calc/norme';
import { dv, type PuntoInSito } from '../lift/punti';
import type { Norma10411 } from '../lift/modifica';
import type { RtNewCheckId } from './types';

export const KR = {
  // UNI EN 81-20:2020, 5.8.2.1.1.2: a linear (spring) buffer makes its stroke under a static load between these
  // multiples of the car with its rated load (P + Q), or of the counterweight — per buffer; both ends included (the
  // text says «between»: the software's reading)
  springStaticMin: 2.5,
  springStaticMax: 4,
  // 5.8.2.1.2.1 and 5.8.2.2.3: the non-linear and the hydraulic buffers are struck at this share of the rated speed —
  // the certified impact speed covers it
  bufImpactRatio: 1.15,
  // 5.6.2.2.1.1 d): the governor's tensile force in the rope at tripping at least the larger of twice the force that
  // engages the safety gear and 300 N [N]; 5.6.2.2.1.3 b): the rope's minimum breaking load at least 8 times that force
  govForceMin: 300,
  govForceGear: 2,
  govRopeSf: 8,
  // 5.10.1.3.2: control and safety circuits at most this [V] (mean d.c., r.m.s. a.c.)
  ctrlVoltageMax: 250,
  // UNI 10411-1:2024, 11.1.2: the existing landing locks' contacts a test finger reaches at most this, a.c. and d.c. [V]
  lockContactAc: 25,
  lockContactDc: 50,
  // UNI EN 81-50:2020, 5.10.3: the omega method covers steels of Rm 370 and 520 N/mm², ω interpolated linearly between
  // them; Rm 520: [λ up to, a, exponent, b] of ω = a·λ^exponent + b (λ ≤ 250)
  railRmMin: 370,
  railRmMax: 520,
  omega520: [[50, 0.0000824, 2.06, 1.021], [70, 0.00001895, 2.41, 1.05], [89, 0.00002447, 2.36, 1.03], [250, 0.0002533, 2, 0]],
  // UNI EN 81-20:2020, 5.7.4.5 (prospetto 15): rails of an elongation A5 from 8 to 12 %, St in normal use and at the
  // safety gear's operation (over 12 %: KV_GUIDE.railStRun, railStGear)
  railStRun812: 3.75,
  railStGear812: 3.0,
  // 5.7.4.6 b): counterweight rails without a safety gear, deflection at most this both ways [mm]
  cwRailDeflNoGear: 10,
  // 5.7.2.3.5: the brackets' push Fp may be neglected up to this travel [m]
  fpTravelMax: 40,
  // UNI 10411-1:2024, 19.1: a new landing door lower than this follows UNI EN 81-21:2022, 5.12 too [mm]
  doorHeightEn8121: 1900,
  // UNI EN 81-21:2022, 5.12: the landing door as high as the building allows, never under this [mm]; under UNI EN 81-20's
  // height the lintel's edges sloped at most this from the horizontal (or padded) [°]
  doorHeightMin8121: 1800,
  doorLintelAngle: 30,
} as const;

export type CostanteRt = keyof typeof KR;

export type GruppoRt = 'relazione' | 'impianto' | 'quadro' | 'cabina' | 'guide' | 'ammortizzatori' | 'limitatore' | 'porte' | 'obblighi';

/** The groups as the engineer's checklist names them. */
export const GRUPPO_RT: Readonly<Record<GruppoRt, string>> = {
  relazione: 'sezioni, documenti e strutture', impianto: 'dati dell’impianto', quadro: 'quadro di manovra', cabina: 'cabina e carichi', guide: 'guide',
  ammortizzatori: 'ammortizzatori', limitatore: 'limitatore di velocità e paracadute', porte: 'porte di piano',
  obblighi: 'parti sostituite senza un punto proprio della UNI 10411',
};

/** An entry of the RT's registry (the shape of VoceImpianto, with the RT's checks). */
export interface VoceRt {
  id: string;
  gruppo: GruppoRt;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteRt[];
  verifiche?: readonly RtNewCheckId[];
  /** the clauses a check of the entry cites, when not all of the entry's (report/refs.ts checkRefs) */
  rifVerifica?: Partial<Readonly<Record<RtNewCheckId, string>>>;
  nota?: string;
}

/** The parts the RT's sections take in although UNI 10411 has no point of their own for them replaced: new rails,
 *  buffers and counterweight (and under -11 the sling): the changed part is assessed by point 4 (-11: 4.3), with the
 *  points the cases bring. The software's reading, to confirm on the standard: stato da_verificare. */
export const OBBLIGHI_RT: Readonly<Record<Norma10411, Partial<Readonly<Record<'rails' | 'buffers' | 'cw' | 'sling', PuntoInSito>>>>> = {
  '10411-1': {
    rails: dv('UNI 10411-1:2024, 4, 6.5, 15.5–15.6 e 16 g)', 'guide nuove o sostituite: la parte cambiata si valuta secondo il punto 4, con la UNI EN '
      + '81-20 5.7 e la verifica della UNI EN 81-50 5.10 (lettura del software); con i carichi oltre i prospetti 1 o 2 la resistenza di guide e '
      + 'ancoraggi con il metodo semplificato della UNI EN 81-1:1987 (punto 10, nota) o con la UNI EN 81-20 5.7 (6.5); con la velocità aumentata la UNI EN '
      + '81-20 5.7 e le caratteristiche del certificato del paracadute (15.5–15.6); i tratti aggiunti con la corsa allungata (16 g))'),
    buffers: dv('UNI 10411-1:2024, 4, 6.1, 6.4 e 15.2', 'ammortizzatori nuovi o sostituiti: la parte cambiata si valuta secondo il punto 4, con la '
      + 'UNI EN 81-20 5.8 (lettura del software); con i carichi oltre i prospetti (6.4), diminuiti o con il rapporto cambiato (6.1) e con la '
      + 'velocità variata (15.2) secondo la UNI EN 81-20 5.8; non lineari e idraulici con certificato d’esame del tipo e dichiarazione, a molla '
      + 'con il calcolo e i diagrammi (appendice C)'),
    cw: dv('UNI 10411-1:2024, 4, 6.1, 6.13, 15.7 e 16 a)', 'contrappeso nuovo o modificato (zavorre aggiunte o tolte): la sua massa si confronta '
      + 'con quella documentata, in aumento con il prospetto 2 e in diminuzione con le verifiche della 6.1; aumentata, guide secondo la UNI EN '
      + '81-20 5.7.1 e difesa del suo percorso secondo la 5.2.5.5.1 (6.13), così anche con la velocità aumentata (15.7) e con la corsa allungata '
      + '(16 a)); la parte cambiata si valuta secondo il punto 4'),
  },
  '10411-11': {
    rails: dv('UNI 10411-11:2024, 4.3, 6.5, 15 j)–k) e 16 f)', 'guide nuove o sostituite: verificate per l’impianto con la valutazione 4.3; con i '
      + 'carichi aumentati la resistenza di guide e ancoraggi per i nuovi carichi (6.5); con la velocità cambiata coerenti con il certificato del '
      + 'paracadute e degli ACOP (15 j), k)); i tratti aggiunti con i loro ancoraggi per la nuova corsa (16 f))'),
    buffers: dv('UNI 10411-11:2024, 4.3, 6.4 e 15 a)', 'ammortizzatori nuovi o sostituiti: verificati per l’impianto con la valutazione 4.3, per i '
      + 'nuovi carichi (6.4) e per la nuova velocità (15 a))'),
    cw: dv('UNI 10411-11:2024, 4.3 e 6.1', 'contrappeso nuovo o modificato: la sua massa si confronta con quella documentata; ogni aumento porta i '
      + 'punti da 6.2 a 6.13, ogni diminuzione la verifica degli ammortizzatori e del paracadute progressivo (6.1); valutazione 4.3'),
    sling: dv('UNI 10411-11:2024, 4.3 e 6.9', 'arcata nuova: verificata per l’impianto con la valutazione 4.3 e, con i carichi aumentati, per i '
      + 'nuovi carichi (6.9)'),
  },
};

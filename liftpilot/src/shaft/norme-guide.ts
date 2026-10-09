// Registry of the check of the car's guide rails (src/lib/tavole/rail-check.ts) and of the safety gear's type for the
// speed: the constants are spread into KV_VERT (norme-vert.ts), the entries into VOCI_VERT. Same form as norme.ts;
// Italian texts, clause numbers and values only.
import { letto } from '../calc/norme-fonti';
import type { VoceVano } from './norme';

export const KV_GUIDE = {
  // UNI EN 81-20:2020, 5.7.4.5 and 5.7.4.6: rails of steel Rm 370 N/mm² (the lowest of the standard: the software's
  // choice), the permissible stress Rm/St with St in normal use (running, loading) and at the safety gear's operation
  // (elongation A5 > 12 %); deflection of the T rails on which a safety gear acts, both directions [mm]
  railRm: 370,
  railStRun: 2.25,
  railStGear: 1.8,
  railDeflection: 5,
  // UNI EN 81-20:2020, 5.7.2.3.6: loading at a floor, the force on the middle of the car door's sill Fs by the lift's
  // use — passengers 0,4·g·Q, goods passenger 0,6·g·Q, with heavy handling devices outside Q 0,85·g·Q; the use not
  // given, by the rated load as UNI EN 81-1:2008, G.2.5 (0,6 from 2500 kg)
  sillLoad: 0.4,
  sillLoadHeavy: 0.6,
  sillLoadDevices: 0.85,
  sillHeavyQ: 2500,
  // UNI EN 81-50:2020, 5.10: bending of a rail between two brackets M = 3·F·l/16; the omega method for buckling with
  // the slenderness λ = l/i (Rm 370: [λ up to, a, exponent, b] of ω = a·λ^exponent + b, λ ≤ 250); σc = σk + 0,9·σm;
  // flange bending σF = 1,85·Fx/c² (roller guide shoes); deflections δ = 0,7·F·l³/(48·E·I)
  railBend: 0.1875,
  omega370: [[60, 0.0001292, 1.89, 1], [85, 0.00004627, 2.14, 1], [115, 0.00001711, 2.35, 1.04], [250, 0.00016887, 2, 0]],
  railCombine: 0.9,
  railFlange: 1.85,
  railDeflK: 0.7,
  // UNI EN 81-20:2020, 5.6.2: instantaneous safety gear (also of the captive roller type) up to this rated speed [m/s]
  gearInstantV: 0.63,
  // UNI EN 81-20:2020, 5.2.5.4: with a space people can reach under the shaft the pit floor is designed for at least
  // this [N/m²] and the counterweight has a safety gear; 5.6.2.1.2.3 and prospetto 11: an instantaneous one, or one
  // tripped by the suspension's breakage or by a safety rope instead of a governor, only up to this rated speed [m/s]
  pitFloorAccessible: 5000,
  cwGearInstantV: 1,
} as const;

export const COSTANTI_GUIDE = {
  'guide.verifica': ['railRm', 'railStRun', 'railStGear', 'railDeflection', 'sillLoad', 'sillLoadHeavy', 'sillLoadDevices', 'sillHeavyQ', 'railBend', 'omega370',
    'railCombine', 'railFlange', 'railDeflK'],
  'paracadute.tipo': ['gearInstantV'],
  'paracadute.contrappeso': ['pitFloorAccessible', 'cwGearInstantV'],
} as const;

export const VOCI_GUIDE: readonly VoceVano[] = [
  {
    id: 'guide.verifica', gruppo: 'carichi', titolo: 'Verifica delle guide di cabina',
    valore: 'tra due staffe (l = distanza massima tra le staffe della guida) con le spinte della voce guide.spinte, portata spostata di 1/8 '
      + 'della cabina in un senso e poi nell’altro: flessione M = 3·F·l/16, σm = σx + σy; intervento del paracadute: forza verticale '
      + 'Fv = k1·g·(P+Q)/n più il peso della guida, carico di punta con il metodo omega (λ = l/i con il raggio d’inerzia minore √(I/A), '
      + 'λ ≤ 250; acciaio Rm 370: ω = 0,0001292·λ^1,89 + 1 fino a λ 60, 0,00004627·λ^2,14 + 1 fino a 85, 0,00001711·λ^2,35 + 1,04 fino a 115, '
      + '0,00016887·λ^2 fino a 250), σ = σm + Fv/A e σc = σk + 0,9·σm; marcia: k2 = 1,2 e il peso della guida; carico al piano: cabina vuota e '
      + 'Fs al centro della soglia di cabina, a ogni accesso, secondo l’uso indicato nei dati dell’impianto: persone 0,4·g·Q, merci accompagnate '
      + '0,6·g·Q, con mezzi di carico pesanti fuori portata 0,85·g·Q (senza l’uso: secondo la portata, 0,6·g·Q da 2500 kg); flessione della '
      + 'suola σF = 1,85·Fx/c² (pattini a '
      + 'rotelle); frecce δx = 0,7·Fx·l³/(48·E·Iy) e δy = 0,7·Fy·l³/(48·E·Ix) ≤ 5 mm. Tensione ammissibile Rm/St con St = 2,25 in marcia e al '
      + 'carico, 1,8 all’intervento del paracadute (allungamento A5 > 12 %): con Rm 370 N/mm², 164,4 e 205,6 N/mm²',
    riferimento: 'UNI EN 81-50:2020, 5.10.2–5.10.6; UNI EN 81-20:2020, 5.7.2.3.5, 5.7.2.3.6, 5.7.4.5 (Prospetto 15), 5.7.4.6 e Prospetto 14; '
      + 'UNI EN 81-1:2008, G.2.5 (l’uso non indicato)',
    fonte: `${letto('UNI EN 81-50:2020', 'pp. 35–39')}; ${letto('UNI EN 81-20:2020', 'pp. 94–97')}; Rm 370 è scelta del software (il valore più basso)`,
    stato: 'confermato', verifiche: ['gr_stress', 'gr_flange', 'gr_defl'],
    nota: 'Confermati sul testo i coefficienti, le formule e i limiti, e il carico al piano per uso (UNI EN 81-20:2020, 5.7.2.3.6). Senza l’uso '
      + 'nei dati dell’impianto vale la regola per portata della UNI EN 81-1:2008 (G.2.5), che per un ascensore per persone da 2500 kg in su è '
      + 'dal lato della sicurezza. La formula di ω per Rm 370 è data '
      + 'da λ 20 a 250: sotto 20 il software usa ω di λ 20 (dal lato della sicurezza). Non contate: la spinta di scorrimento delle staffe (assestamento '
      + 'dell’edificio), le apparecchiature appese alle guide, le frecce di staffe ed edificio (la norma vuole la somma entro il limite) e le '
      + 'guide del contrappeso. La flessione della suola è quella dei pattini a rotelle (5.10.5 ha una formula a parte per quelli a scorrimento; '
      + 'il tipo di pattino non è un dato del software).',
  },
  {
    id: 'guide.sezioni', gruppo: 'carichi', titolo: 'Sezioni delle guide di cabina',
    valore: 'area, momenti d’inerzia e moduli di resistenza minimi attorno all’asse parallelo alla suola (x) e all’asse di simmetria (y), '
      + 'spessore c del collo tra lama e suola, per ogni profilo del software; raggi d’inerzia calcolati come √(I/A)',
    riferimento: 'ISO 7465:2007 (ora ISO 8100-33:2022); EN 10055:1995 per il T 70×70×8 laminato',
    fonte: 'tabella ISO 7465:2007 stampata da Savera (Standard Savera Guide, Rev 03/10; assi e c dalla Rev 08.26), anteprime ISO 7465:1997 e '
      + 'ISO 8100-33:2022 (correzione dei raggi del T127-1/B, stampati nel 2007 uguali ai moduli), EN 10055:1995, Tabella 1. La EN 10055 non ha '
      + 'il T 45: al T 45×45×5 il software dà la sezione del T45/A, delle stesse misure',
    stato: 'da_verificare',
  },
  {
    id: 'paracadute.tipo', gruppo: 'carichi', titolo: 'Tipo di paracadute per la velocità nominale',
    valore: 'istantaneo (anche a rulli imprigionati) fino a 0,63 m/s; oltre, progressivo (la UNI EN 81-20 non ha più l’istantaneo con '
      + 'effetto ammortizzato fino a 1 m/s); il tipo viene dai dati dell’impianto (se manca: progressivo, con la nota sul foglio)',
    riferimento: 'UNI EN 81-20:2020, 5.6.2.1.2.1; la regola precedente in UNI EN 81-1 (1999, 2008), 9.8.2.1',
    fonte: `${letto('UNI EN 81-20:2020', 'p. 81')}; ${letto('UNI EN 81-1:2008', 'p. 58')}`, stato: 'confermato', verifiche: ['sg_type'],
  },
  {
    id: 'paracadute.contrappeso', gruppo: 'carichi', titolo: 'Spazio accessibile sotto il vano: paracadute del contrappeso e fondo della fossa',
    valore: 'con uno spazio accessibile sotto il vano (macchina sotto la fossa) il contrappeso ha il paracadute e il fondo della fossa è '
      + 'progettato per almeno 5000 N/m² oltre alle reazioni degli ammortizzatori (P6, P8) e delle guide (P5, P7, con la presa del paracadute); '
      + 'il paracadute del contrappeso è progressivo oltre 1 m/s, fino a 1 m/s anche istantaneo, ed è azionato dal limitatore o, fino a 1 m/s, '
      + 'dalla rottura della sospensione o da una fune di sicurezza. Il tipo e l’azionamento si indicano nei dati dell’impianto: finché mancano '
      + 'la verifica non passa; il carico P7 conta la presa (progressivo se non indicato) su metà del contrappeso per guida',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.4, 5.2.1.8.4, 5.6.2.1.2.3, prospetto 11 (5.6.1.2), 5.6.2.2.2 e 5.6.2.2.3; UNI EN 81-50:2020, 5.10',
    fonte: letto('UNI EN 81-20:2020', 'pp. 27, 35, 79, 81'), stato: 'confermato', verifiche: ['sg_cw'],
    nota: 'le guide del contrappeso con la presa del paracadute (UNI EN 81-50:2020, 5.10) non sono verificate dal software (modello.non.calcolate); '
      + 'in una modifica la UNI 10411-1:2024 (6.14) accetta al posto del paracadute un pilastro esistente fino al terreno, verificato per i nuovi '
      + 'carichi: è una scelta del progettista; con la UNI 10411-11:2024 il pilastro è quello che l’impianto ha secondo la sua edizione della UNI '
      + 'EN 81-1 (5.5 a)), verificato per i nuovi carichi (6.6 e 6.13)',
  },
];

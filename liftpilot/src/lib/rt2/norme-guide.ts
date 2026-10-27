// The numbers of the guide-rail and counterweight pages of the RT after the owner's model (round 52) that no other
// registry holds (K_GUIDE: the model's own, status 'prassi'), the clauses its checks cite (RIF_GUIDE) and the entries
// (VOCI_GUIDE) of every check of the two components with the numbers they use — the norm's from the registries that
// already hold them by name (KV_GUIDE and KV_VERT of the shaft, KR of the first RT, KL of the plant), stated in the text.
// Clause numbers and values only, never a text of a standard. Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import { KV_VERT } from '@/shaft/norme-vert';
import { KL } from '../lift/norme';
import { KR } from '../rt/norme';
import type { VoceRt2 } from './norme';

export const K_GUIDE = {
  // TABELLE!D46: the rails' modulus of elasticity of the model's catalogue [N/mm²]
  E: 206000,
  // TABELLE!N4:N35: the mass of one rail line = A [mm²] × the rail column [m] × this [kg/(mm²·m)] (steel of 7850 kg/m³)
  massaAcciaio: 0.00785,
  // 'Contrappeso solo inserimento'!K14: the rail column = travel + headroom + pit, less this [m]
  colonnaRiduzione: 0.1,
  // «VERIFICA CWT»: the overtravels of the counterweight and of the car the model types [mm] (proposed), the tie rods'
  // room [mm] and the margin 0,3 + 0,035·v² [m] the clearance must exceed with them
  vcExtracorsa: 300,
  vcTiranti: 600,
  vcBase: 0.3,
  vcV2: 0.035,
} as const;
export type CostanteGuide = keyof typeof K_GUIDE;

const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';

/** The clauses the checks of the two components cite. */
export const RIF_GUIDE = {
  flessione: `${T50}, 5.10.2; ${T20}, 5.7.4.5 (prospetto 15)`,
  composta: `${T50}, 5.10.4; ${T20}, 5.7.2.3.5 e 5.7.4.5`,
  puntaComposta: `${T50}, 5.10.3 e 5.10.4; ${T20}, 5.7.4.5`,
  suola: `${T50}, 5.10.5; ${T20}, 5.7.4.5`,
  freccia: `${T50}, 5.10.6; ${T20}, 5.7.4.6`,
  carico: `${T20}, 5.7.2.3.6`,
  paracadute: `${T20}, 5.6.2.1.2.1`,
  eccentricita: `${T20}, 5.7.2.3.3`,
  peso1: 'UNI 10411-1:2024, 6.1 (prospetto 2)',
  peso11: 'UNI 10411-11:2024, 6.1',
  margine: 'modello del titolare, foglio «VERIFICA CWT» (nessun punto di norma)',
} as const;

const it = (x: number): string => String(x).replace('.', ',');
const pct = (x: number): string => it(Math.round(x * 1000) / 10);
const MODELLO = 'modello Excel del titolare (RT-E MOD 10411-1, fogli «guide cabina 8120», «guide cwt 8120», «Contrappeso solo inserimento», '
  + '«VERIFICA CWT», «TABELLE»)';
const CASI = ['sm', 'sf', 'dx', 'dy', 's'] as const;
const ids = (pre: string, casi: readonly string[]): string[] => casi.map((c) => `${pre}.${c}`);
const ultimoLambda = KV_GUIDE.omega370[KV_GUIDE.omega370.length - 1][0];

export const VOCI_GUIDE: readonly VoceRt2[] = [
  {
    id: 'rt2.guide.verifica', area: 'guide', titolo: 'Verifica delle guide di cabina (marcia, intervento del paracadute, carico al piano)',
    valore: `flessione tra due ancoraggi M = 3·F·l/16 (${it(KV_GUIDE.railBend)}·F·l), σm = |σx| + |σy|; flessione della suola σF = ${it(KV_GUIDE.railFlange)}·|Fx|/c²; `
      + `frecce δ = ${it(KV_GUIDE.railDeflK)}·F·l³/(48·E·J) entro ${KV_GUIDE.railDeflection} mm in ogni caso; marcia con K2 = ${it(KV_VERT.k2Running)}; `
      + `intervento del paracadute con K1 (${KV_VERT.k1Instant} istantaneo a cunei, ${KV_VERT.k1Roller} a rulli, ${KV_VERT.k1Progressive} progressivo): `
      + 'Fk = K1·g·(P + Q)/n + Mg·g + Fp, σk = Fk·ω/A, σ = σm + Fk/A, '
      + `σc = σk + ${it(KV_GUIDE.railCombine)}·σm; carico al piano Fs = ${it(KV_GUIDE.sillLoad)}·g·Q (persone), ${it(KV_GUIDE.sillLoadHeavy)}·g·Q (merci), `
      + `${it(KV_GUIDE.sillLoadDevices)}·g·Q (merci con carrelli) a ogni accesso; in marcia e al carico anche σ = σm + (Mg·g + Fp)/A. Tensione ammissibile `
      + `Rm/St: St = ${it(KV_GUIDE.railStRun)} in marcia e al carico, ${it(KV_GUIDE.railStGear)} all’intervento del paracadute (A5 oltre 12 %), `
      + `${it(KR.railStRun812)} e ${it(KR.railStGear812)} (A5 da 8 a 12 %), sotto 8 % non ammesso; ω con λ = l/i, i = √(min(Jx, Jy)/A), λ esatto `
      + `(il modello lo arrotondava all’intero: corretto), per Rm da ${KR.railRmMin} a ${KR.railRmMax} N/mm² interpolato (fuori non applicabile), λ sotto 20 come 20, oltre `
      + `${ultimoLambda} non applicabile; la portata spostata dal centro della cabina di XQ e YQ (1/8 della cabina) nel verso più gravoso`,
    riferimento: `${T50}, 5.10.2–5.10.6; ${T20}, 5.7.2.3.4–5.7.2.3.6, 5.7.4.5 (prospetto 15), 5.7.4.6 e prospetto 14`,
    fonte: `voci vano.guide.verifica (KV_GUIDE), rt.guide.rm e rt.guide.fp (KR) già confermate; ${MODELLO}`, stato: 'confermato',
    verifiche: [...ids('guideCabina.marcia', CASI), ...ids('guideCabina.paracadute', ['sm', 's', 'sc', 'sf', 'dx', 'dy']), ...ids('guideCabina.carico', CASI),
      ...ids('guideCabina.carico2', CASI)],
    nota: 'Il modello combina le due eccentricità della portata nello stesso caso (più severo della norma, che le prende una alla volta): '
      + 'mantenuto. La flessione della suola è quella dei pattini a rulli (5.10.5 ha una formula a parte per quelli a strisciamento).',
  },
  {
    id: 'rt2.guide.distribuzione', area: 'guide', titolo: 'Caso «Distribuzione del carico» del modello (K1 rispetto al punto di sospensione)',
    valore: `le forze del caso di marcia con K1 al posto di K2, σm e σF entro la tensione ammissibile in marcia, frecce entro ${KV_GUIDE.railDeflection} mm; `
      + 'non è un caso della norma: il non verificato è un’attenzione, non un esito negativo',
    riferimento: `${T50}, 5.10 (caso non previsto)`, fonte: MODELLO, stato: 'prassi', verifiche: ids('guideCabina.distr', ['sm', 'sf', 'dx', 'dy']),
  },
  {
    id: 'rt2.guide.dati', area: 'guide', titolo: 'Dati del catalogo del modello per le guide',
    valore: `modulo di elasticità E = ${K_GUIDE.E} N/mm²; massa di una colonna guida Mg = A·L·${it(K_GUIDE.massaAcciaio)} kg con L = corsa + testata + `
      + `fossa − ${it(K_GUIDE.colonnaRiduzione)} m; sezioni del catalogo TABELLE (Jx, Jy, Wx, Wy, A, σr, c)`,
    riferimento: 'ISO 7465 (catalogo del modello)', fonte: MODELLO, stato: 'prassi', costanti: ['E', 'massaAcciaio', 'colonnaRiduzione'],
    nota: 'Le sezioni del catalogo del modello differiscono un poco da quelle del software (src/shaft/rails.ts) per gli stessi profili: '
      + 'la relazione segue il catalogo del modello.',
  },
  {
    id: 'rt2.guide.paracadute', area: 'guide', titolo: 'Tipo del paracadute della cabina per la velocità nominale',
    valore: `istantaneo (a cunei o a rulli) fino a ${it(KV_GUIDE.gearInstantV)} m/s compresi; oltre, progressivo`,
    riferimento: RIF_GUIDE.paracadute, fonte: 'voce vano.paracadute.tipo (KV_GUIDE) già confermata', stato: 'confermato',
    verifiche: ['guideCabina.tipoParacadute'],
  },
  {
    id: 'rt2.guide.contrappeso', area: 'guide', titolo: 'Verifica delle guide del contrappeso',
    valore: `massa del contrappeso spostata dal centro del ${pct(KV_GUIDE.cwEccWidth)} % della distanza fra le guide (YS) e del ${pct(KV_GUIDE.cwEccDepth)} % `
      + `della sua profondità (XS): Fx = K·g·Mcwt·XS/(n·h), Fy = K·g·Mcwt·YS/((n/2)·h); marcia con K2 = ${it(KV_VERT.k2Running)}: σm, σF e σ = σm + `
      + `(Mg·g + Fp)/A entro Rm/St in marcia, frecce entro ${KR.cwRailDeflNoGear} mm senza paracadute e ${KV_GUIDE.railDeflection} mm con il paracadute; `
      + 'con il paracadute anche l’intervento con K1: σm, σF, Fv = K1·g·Mcwt/n + Mg·g + Fp, σk = Fv·ω/A, σ = σm + Fv/A e σc = σk + '
      + `${it(KV_GUIDE.railCombine)}·σm entro Rm/St all’intervento, frecce entro ${KV_GUIDE.railDeflection} mm`,
    riferimento: `${T20}, 5.7.2.3.3, 5.7.4.5 e 5.7.4.6; ${T50}, 5.10.2–5.10.6`,
    fonte: 'voci vano.guide.contrappeso (KV_GUIDE) e rt.guide.contrappeso.marcia (KR) già confermate', stato: 'confermato',
    verifiche: [...ids('contrappeso.marcia', CASI), ...ids('contrappeso.paracadute', ['sm', 's', 'sc', 'sf', 'dx', 'dy'])],
  },
  {
    id: 'rt2.contrappeso.peso', area: 'contrappeso', titolo: 'Variazione della massa del contrappeso',
    valore: `con la UNI 10411-1 l’aumento del contrappeso entro il ${pct(KL.loadIncTcp[0])} % della portata (oltre ${KL.loadSplitQ} kg: `
      + `${pct(KL.loadIncTcp[1])} %), misurato sulla portata minore tra prima e dopo, con la riga più severa se una delle due supera ${KL.loadSplitQ} kg; `
      + 'con la UNI 10411-11 ogni aumento porta le verifiche; la verifica vale qualunque sia l’intervento sul contrappeso',
    riferimento: `${RIF_GUIDE.peso1}; ${RIF_GUIDE.peso11}`, fonte: 'voce impianto.variazione.carico (KL) già confermata', stato: 'confermato',
    verifiche: ['contrappeso.peso'],
  },
  {
    id: 'rt2.contrappeso.margine', area: 'contrappeso', titolo: 'Verifica del margine iniziale del contrappeso («VERIFICA CWT»)',
    valore: 'M = testata + fossa − ingombro del contrappeso − pilastrino − (L ammortizzatore − freccia) − extracorsa del contrappeso − extracorsa della '
      + `cabina, maggiore di ${it(K_GUIDE.vcBase)} m + ${it(K_GUIDE.vcV2)}·v² m più ${K_GUIDE.vcTiranti} mm di ingombro dei tiranti; extracorse proposte `
      + `${K_GUIDE.vcExtracorsa} mm`,
    riferimento: RIF_GUIDE.margine, fonte: MODELLO, stato: 'prassi', costanti: ['vcExtracorsa', 'vcTiranti', 'vcBase', 'vcV2'], verifiche: ['contrappeso.margine'],
    nota: 'Verifica interna del modello senza un punto di norma: il non verificato è un’attenzione. 0,3 m + 0,035·v² è la distanza delle '
      + 'apparecchiature sul tetto della cabina (UNI EN 81-1:1998, 5.7.1.1 c) 1); UNI 10411-1:2024, 13.1.3 b)); per il contrappeso valgono il '
      + 'prospetto 2 della UNI EN 81-20:2020 (+ 0,035·v²) e la corsa guidata ulteriore di almeno 0,10 m (5.2.5.6.2); i 600 mm dei tiranti non hanno '
      + 'un punto di norma (risposta 11 dell’esperto di norme).',
  },
];

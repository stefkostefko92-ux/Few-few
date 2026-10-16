// What UNI 10411-1/-11:2024 ask when a modification changes the rated speed, the loads or the travel (round 46, B5): one
// point per case — under -1 the speed increased (15.1–15.15) or decreased (15.16–15.17), a change within the two limits
// noted (with the speed after 50 Hz alone, the reduction not measured — round 47 recheck); the
// loads beyond prospetto 1 or 2, decreased, or their ratio changed (6.1 with App. D) — answered «Sì» by hand while the
// documented loads show none of these, a point for the engineer (round 46 final check); the travel lengthened (16, with
// the ⚠ over 8 m) or shortened (point 4) —, under -11 any change of the speed (15 with 15 i)), of the loads (6.1–6.13)
// and of the travel (16), each with the assessment 4.3. Round 47 (owner's decision D1): the speed or the travel answered
// «Sì» by hand while the documents show no change, a point for the engineer as the loads' (speedDocumentati,
// travelDocumentati); a new car whose design loads are the documented ones, the car's mass to confirm — on the existing
// sling with point 22 (loadCabinaNuova), with the sling replaced too 6.1 alone (loadCabinaArcata: point 22 is the new
// car on the old sling; round 47 review). In our words with the clause numbers and values, read on the standards' text
// — never their text (CEN-CENELEC and UNI copyright). obblighi.ts picks them by the documents of the existing lift
// (modifica.ts). Pure.
import { lt, type PuntoInSito } from './punti';
import type { Norma10411 } from './modifica';

/** The cases of a change of speed, load or travel. */
export type CasoVariazione = 'speedUp' | 'speedDown' | 'speedWithin' | 'speedWithin50' | 'speedUcm' | 'loadP1' | 'loadP2' | 'loadCalo' | 'loadRapporto'
  | 'loadDocumentati' | 'travelUp' | 'travelOver8' | 'travelDown' | 'speedDocumentati' | 'travelDocumentati' | 'loadCabinaNuova' | 'loadCabinaArcata';

const DA_VERIFICARE = (rif: string, testo: string): PuntoInSito => ({ rif, testo, stato: 'da_verificare' });
/** The new car's mass to confirm while the design's loads are the documented ones (round 47, D1): on the existing sling
 *  (point 22) or with the sling replaced too. */
const MASSA_CABINA = (cosa: string): string => `${cosa} con i carichi del progetto uguali a quelli documentati: P va confermata come massa della `
  + 'cabina nuova completa (arcata, porte e operatore compresi); se cambia, i carichi si confrontano di nuovo con quelli documentati';

export const OBBLIGHI_VARIAZIONI: Readonly<Record<Norma10411, Partial<Readonly<Record<CasoVariazione, PuntoInSito>>>>> = {
  '10411-1': {
    speedUp: lt('UNI 10411-1:2024, 15.1–15.15', 'velocità portata oltre il 5 % sopra il riferimento (la maggiore tra quella del libretto, o '
      + 'accertata in seguito con verbale, e quella dopo il passaggio della rete a 50 Hz): ammortizzatori (15.2) e paracadute (15.3) secondo la '
      + 'UNI EN 81-20, guide con attacchi e giunzioni (15.5–15.6), contrappeso guidato e difesa del suo percorso (15.7), funi verificate con il '
      + '14.1 anche se macchina e puleggia restano (15.8), spazi liberi in fossa e in testata (15.11, con la UNI EN 81-21 se i luoghi non lo '
      + 'consentono: 15.12); non calcolati dal software: ACOP secondo la 5.6.6 (15.4), ispezione non oltre 0,63 m/s (15.9), porta a ogni accesso '
      + 'della cabina (15.10), limitatore secondo la 5.6.2.2.1 (15.13), extracorsa secondo la 5.12.2 (15.14), precisione di arresto e '
      + 'livellamento secondo la 5.12.1.1.4 (15.15)'),
    speedDown: lt('UNI 10411-1:2024, 15.16–15.17', 'velocità ridotta di più del 5 % sotto l’iniziale o quella documentata con verbale: '
      + 'ammortizzatori secondo la UNI EN 81-20 5.8 (15.2) e paracadute fatto intervenire dal limitatore entro i limiti della normativa in '
      + 'vigore all’installazione (15.17)'),
    // not a change by 15.1 and 15.16 (round 47 recheck: said as the two limits, never «within 5 % of the reference» — a
    // design up to 5 % above the reference may be far below it, down to 5 % under the logbook's speed); with the speed
    // after 50 Hz alone the reduction from the initial speed is not measured (speedWithin50)
    speedWithin: DA_VERIFICARE('UNI 10411-1:2024, 15.1 e 15.16', 'velocità né oltre il 5 % sopra il riferimento (15.1) né oltre il 5 % sotto la '
      + 'velocità iniziale del libretto o documentata con verbale (15.16): i punti da 15.2 a 15.17 non si applicano; se sia comunque un cambio '
      + 'della velocità ai sensi del DPR 162/1999 (art. 2 c.1 lett. cc) n. 1)) lo valuta il tecnico'),
    speedWithin50: DA_VERIFICARE('UNI 10411-1:2024, 15.1 e 15.16', 'velocità non oltre il 5 % sopra il riferimento, la velocità dopo il passaggio '
      + 'della rete a 50 Hz (15.1): i punti da 15.2 a 15.15 non si applicano; la riduzione dalla velocità iniziale (15.16) non si misura senza la '
      + 'velocità del libretto — indicata come non variata, i punti 15.2 e 15.17 valgono se il tecnico accerta sul libretto una riduzione di oltre '
      + 'il 5 %; se sia comunque un cambio della velocità ai sensi del DPR 162/1999 (art. 2 c.1 lett. cc) n. 1)) lo valuta il tecnico'),
    loadP1: lt('UNI 10411-1:2024, 6.1, 6.3–6.12 e 6.15', 'T* o portata oltre il prospetto 1: strutture dell’edificio secondo il punto 5 '
      + '(6.3), ammortizzatori secondo la UNI EN 81-20 5.8 (6.4), guide e ancoraggi (6.5), paracadute di cabina per i nuovi carichi (6.6), funi '
      + 'e attacchi (6.8), arcata (6.9), macchina (6.10) e altri componenti interessati (6.15); non calcolati dal software: controllo del carico '
      + 'secondo la 5.12.1.2 (6.11) e ACOP secondo la 5.6.6 (6.12)'),
    loadP2: lt('UNI 10411-1:2024, 6.1, 6.4, 6.5, 6.8 e 6.13–6.15', 'contrappeso oltre il prospetto 2: ammortizzatori (6.4), guide e '
      + 'ancoraggi (6.5), funi e attacchi (6.8), contrappeso guidato e difesa del suo percorso (6.13), altri componenti interessati (6.15); non '
      + 'calcolato dal software: con spazi accessibili sotto il vano fondo della fossa per almeno 5000 N/m² e paracadute del contrappeso (6.14)'),
    loadCalo: lt('UNI 10411-1:2024, 6.1', 'T* o contrappeso diminuiti: ammortizzatori esistenti secondo la UNI EN 81-20 5.8 e paracadute '
      + 'progressivo, se c’è, secondo la 5.6.2'),
    // the load answered «Sì» by hand while the documented loads show no case (round 46 final check): for the engineer
    loadDocumentati: DA_VERIFICARE('UNI 10411-1:2024, 6.1', 'carichi indicati come variati, ma secondo i carichi documentati la variazione resta '
      + 'entro i prospetti 1 e 2, nessun carico diminuisce e il rapporto tra i carichi appesi non cambia: i punti da 6.3 a 6.15 e l’App. D valgono '
      + 'solo se il tecnico conferma una variazione oltre questi limiti'),
    loadRapporto: lt('UNI 10411-1:2024, 6.1 e App. D', 'rapporto tra i carichi appesi lato cabina e lato contrappeso cambiato: stabilità '
      + 'allo scorrimento (D.1) e pressione nelle gole (D.2) verificate, ammortizzatori secondo la UNI EN 81-20 5.8 sotto cabina e contrappeso; '
      + 'aderenza eccessiva delle funi esclusa (UNI EN 81-20 5.5.3 c))'),
    travelUp: lt('UNI 10411-1:2024, 16 a)–l)', 'corsa allungata rispetto al primo collaudo (fino a 8 m l’intervento non conta come nuova '
      + 'installazione, punto 16): contrappeso guidato e difesa del suo '
      + 'percorso (a)), locale o macchina spostati con i punti 8 e 9 (b), c)), difese dei tratti di vano aggiunti (d)), linee elettriche (e)), '
      + 'quadro (f)), guide dei tratti aggiunti (g)), funi nuove con il 17.2 (h)), fune del limitatore (i)), spazi liberi in fossa e in testata '
      + '(j)), porte di piano nuove con il punto 19 (k)), extracorsa all’estremità interessata (l))'),
    travelOver8: DA_VERIFICARE('UNI 10411-1:2024, 16', '⚠ corsa allungata di oltre 8 m rispetto al primo collaudo: l’intervento conta come '
      + 'nuova installazione; la procedura la conferma il tecnico con il soggetto che esegue la verifica'),
    travelDown: DA_VERIFICARE('UNI 10411-1:2024, 16 e 4', 'corsa accorciata: il punto 16 tratta solo l’allungamento; la modifica (DPR '
      + '162/1999, art. 2 c.1 lett. cc) n. 3)) si valuta secondo il punto 4'),
    // round 47 (D1): the speed or the travel answered «Sì» by hand while the documents show no change, for the engineer
    speedDocumentati: DA_VERIFICARE('UNI 10411-1:2024, 15.1 e 15.16', 'velocità indicata come variata, ma secondo i dati documentati quella '
      + 'del progetto non supera di oltre il 5 % il riferimento né, quando il libretto ne riporta la velocità, scende di oltre il 5 % sotto di essa: '
      + 'i punti da 15.2 a 15.15 (aumento) o 15.2 e 15.17 (riduzione) valgono solo se il tecnico accerta una variazione oltre questi limiti'),
    travelDocumentati: DA_VERIFICARE('UNI 10411-1:2024, 16', 'corsa indicata come variata, ma quella del progetto coincide con la corsa del '
      + 'primo collaudo entro l’arrotondamento dei dati: le lettere a)–l) del punto 16 valgono solo se il tecnico accerta un allungamento (un '
      + 'accorciamento si valuta secondo il punto 4)'),
    // a new car with the design's loads equal to the documented ones: the car's mass to confirm before the loads count as unchanged
    loadCabinaNuova: DA_VERIFICARE('UNI 10411-1:2024, 22 e 6.1', MASSA_CABINA('cabina nuova sull’arcata esistente')),
    loadCabinaArcata: DA_VERIFICARE('UNI 10411-1:2024, 6.1', MASSA_CABINA('cabina e arcata nuove')),
  },
  '10411-11': {
    speedUp: lt('UNI 10411-11:2024, 15 a)–k) e 4.3', 'velocità cambiata, in più o in meno: verificati per la nuova velocità ammortizzatori '
      + '(a)), paracadute (b)), ACOP (c)), organi di sospensione (d)), limitatore (f)), extracorsa (g)) e guide di cabina e del contrappeso con '
      + 'attacchi e giunzioni (j), k)); spazi liberi in fossa e in testata (e)); precisione di arresto e livellamento secondo la UNI EN 81-20 '
      + '5.12.1.1.4 (h)); valutazione 4.3'),
    speedUcm: lt('UNI 10411-11:2024, 15 i)', 'protezione UCM secondo la UNI EN 81-20 5.6.7, salvo con una variazione della velocità entro il '
      + '5 % su un impianto dove la 5.6.7 non era applicata'),
    loadP1: lt('UNI 10411-11:2024, 6.1–6.13', 'T* aumentato: verificati per i nuovi carichi organi di sospensione (6.3), ammortizzatori (6.4), '
      + 'guide (6.5), paracadute (6.6), attacchi (6.8), arcata (6.9), ACOP e UCM (6.10), controllo del carico (6.11), macchina (6.12) e altri '
      + 'componenti interessati (6.13); entro il 10 %, anche sommato alle modifiche precedenti, le strutture del punto 5 no (6.2)'),
    loadP2: lt('UNI 10411-11:2024, 6.1–6.13', 'contrappeso aumentato: i punti da 6.2 a 6.13 per i nuovi carichi, tranne l’arcata (6.9)'),
    loadCalo: lt('UNI 10411-11:2024, 6.1', 'T* o contrappeso diminuiti: ammortizzatori e, se c’è, paracadute progressivo verificati per i '
      + 'nuovi carichi'),
    loadDocumentati: DA_VERIFICARE('UNI 10411-11:2024, 6.1', 'carichi indicati come variati, ma secondo i carichi documentati T* e contrappeso '
      + 'restano gli stessi entro l’arrotondamento dei dati: i punti da 6.2 a 6.13 valgono solo se il tecnico conferma un aumento di T* o del '
      + 'contrappeso (con una riduzione, le verifiche della 6.1)'),
    travelUp: lt('UNI 10411-11:2024, 16 a)–i) e 4.3', 'corsa allungata: locale o macchina spostati con i punti 8 e 9 (a), b)), difese dei '
      + 'tratti di vano aggiunti (c)), linee elettriche (d)), quadro (e)), guide dei tratti aggiunti con gli ancoraggi (f)), organi di sospensione '
      + 'nuovi con il punto 17 (g)), fune nuova del limitatore (h)), spazi liberi in fossa e in testata (i)); valutazione 4.3'),
    travelDown: DA_VERIFICARE('UNI 10411-11:2024, 16 e 4.3', 'corsa accorciata: il punto 16 tratta solo l’allungamento; la modifica (DPR '
      + '162/1999, art. 2 c.1 lett. cc) n. 3)) si valuta con la 4.3'),
    speedDocumentati: DA_VERIFICARE('UNI 10411-11:2024, 15 e 4.3', 'velocità indicata come variata, ma quella del progetto coincide con la '
      + 'documentata entro l’arrotondamento dei dati: le lettere a)–k) del punto 15 e la valutazione 4.3 valgono solo se il tecnico conferma una '
      + 'variazione; la protezione UCM (15 i)) con una variazione oltre il 5 % o dove la 5.6.7 era già applicata'),
    travelDocumentati: DA_VERIFICARE('UNI 10411-11:2024, 16 e 4.3', 'corsa indicata come variata, ma quella del progetto coincide con la '
      + 'documentata entro l’arrotondamento dei dati: le lettere a)–i) del punto 16 e la valutazione 4.3 valgono solo se il tecnico accerta un '
      + 'allungamento (un accorciamento con la 4.3)'),
    loadCabinaNuova: DA_VERIFICARE('UNI 10411-11:2024, 22 e 6.1', MASSA_CABINA('cabina nuova sull’arcata esistente')),
    loadCabinaArcata: DA_VERIFICARE('UNI 10411-11:2024, 6.1', MASSA_CABINA('cabina e arcata nuove')),
  },
};

/** D.1 at the brake test (round 47, owner's decision D2): with the ratio of the loads changed under UNI 10411-1 (the
 *  check tr_d1), a point to verify on site in the relazioni's «Adempimenti» — the car's braking deceleration measured
 *  at the brake test against a_lim, the limit up to which D.1 holds (calc/d1.ts aLim; report/cases.ts d1Sito splices
 *  the values into D1_FORMULA); above it D.1 done again with the measured one does not hold. D.1 gives the loads of its
 *  two cases and where the car stands, not a direction of travel: the brake test's directions are the software's
 *  reading, said as such (round 47 review). When not even C1's band minimum meets D.1 (aLim null), no measured
 *  deceleration does (D1_NON_REGGE). Out of OBBLIGHI_VARIAZIONI: no case of a change, the verdict stays round 46's; the
 *  list of verification names both, with D.1's reading as their source (scripts/lista-verifica.ts). */
export const D1_FORMULA = '(a_lim = g·(C1lim − 1)/(C1lim + 1), con C1lim della relazione)';
/** Where the two templates come from, for the list of verification (round 47 review): D.1 read on the standard. */
export const D1_FONTE = 'UNI 10411-1:2024, testo della norma, letto il 2026-10-06, p. 33 (D.1); il confronto alla prova del freno: scelta del software';
export const D1_PROVA_FRENO: PuntoInSito = { ...DA_VERIFICARE('UNI 10411-1:2024, 6.1 e D.1', 'alla prova del freno si misura la decelerazione di '
  + 'frenatura della cabina con i carichi dei due casi della D.1 (1,25·Q e cabina vuota) — in discesa con 1,25·Q e in salita a vuoto, scelta del '
  + 'software: la D.1 dà i carichi e la posizione della cabina ferma, non il verso di marcia —, e la maggiore si confronta con a_lim, la '
  + `decelerazione fino alla quale la D.1 regge nel caso più sfavorevole ${D1_FORMULA}; se quella misurata supera a_lim, la D.1 rifatta con essa non `
  + 'regge e vanno rivisti il rapporto tra i carichi o la frenatura; come si fa la prova lo decide il tecnico e quale decelerazione intenda la D.1 '
  + 'il soggetto della verifica'), fonte: D1_FONTE };
export const D1_NON_REGGE: PuntoInSito = { ...DA_VERIFICARE('UNI 10411-1:2024, 6.1 e D.1', 'la D.1 non regge nemmeno con il C1 minimo della '
  + 'fascia di velocità: nessuna decelerazione misurata alla prova del freno la rispetta, e il rapporto tra i carichi va rivisto con il soggetto '
  + 'della verifica'), fonte: D1_FONTE };

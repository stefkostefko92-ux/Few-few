// The numbers of the buffer pages of the RT after the owner's model (round 52, sheets «Amm. a molla / in autan /
// idraulici», cabin and counterweight) that no other registry holds (K_AMM), and the entries of every check of those
// pages (VOCI_AMM). The numbers of UNI EN 81-20 the engines already hold are reused by name: KV_VERT.springMaxV,
// strokeK, strokeMin, oilStrokeK (the shaft's buffers, registry ammortizzatori.*), KR.springStaticMin/Max and
// KR.bufImpactRatio (the first RT). Clause numbers and values only, never a text of a standard. Pure.
import { letto } from '@/calc/norme-fonti';
import { KV_VERT } from '@/shaft/norme-vert';
import { KR } from '../rt/norme';
import type { VoceRt2 } from './norme';

export const K_AMM = {
  // the model's spring geometry (its own choice, kept): active coils n = (L0 − 1,5·d)/p (the coil ends, its cell Z71
  // «im»), stroke f = L0 − d·(1 + 1,1·n)
  spireEstremi: 1.5,
  frecciaSpire: 1.1,
  // UNI EN 81-20:2020, 5.8.2.2.2 (the slowdown at the terminal floors monitored, 5.12.1.3): the hydraulic buffer's stroke
  // reduced only over `ridottaSoglia` m/s, computed with the speed at which the car or the counterweight reaches the
  // buffer instead of 115 % of the rated one, never under `ridottaMin` mm (round 52, norm expert's answer 2: the
  // model's 50 % and a third, with the floors 420/540 mm, are UNI EN 81-1:1998 10.4.3.2's)
  ridottaSoglia: 2.5,
  ridottaMin: 420,
} as const;
export type CostanteAmm = keyof typeof K_AMM;

const it = (x: number): string => String(x).replace('.', ',');
const T20 = 'UNI EN 81-20:2020', T50 = 'UNI EN 81-50:2020';
const MODELLO = 'modello Excel del titolare (RT-E MOD 10411-1, fogli «Amm. a molla», «Amm. in autan», «Amm. idraulici» cabina e CWT)';
const LATI = ['ammCabina', 'ammCwt'] as const;
const ver = (...nomi: string[]): string[] => LATI.flatMap((l) => nomi.map((n) => `${l}.${n}`));

export const VOCI_AMM: readonly VoceRt2[] = [
  {
    id: 'rt2.amm.velocita', area: 'ammortizzatori', titolo: 'Ammortizzatori ad accumulo di energia (molle e autan): velocità nominale',
    valore: `ammessi fino a ${it(KV_VERT.springMaxV)} m/s di velocità nominale, lineari (molle) e non lineari (autan)`,
    riferimento: `${T20}, 5.8.1.5`, fonte: `${letto(T20, 'p. 98')}; voce ammortizzatori.corsa del vano`, stato: 'confermato',
    verifiche: ver('mollaVelocita', 'autanVelocita'),
    nota: 'Il modello non verifica la velocità: le molle 78.025–78.028, RC01713 e RC01714 passavano la corsa fino a 1,01–1,12 m/s (correzione X3).',
  },
  {
    id: 'rt2.amm.molla.corsa', area: 'ammortizzatori', titolo: 'Ammortizzatori a molla: corsa',
    valore: `corsa ≥ ${it(KV_VERT.strokeK)}·v² m (stampata «fmin = 135 v²» in mm) e comunque ≥ ${KV_VERT.strokeMin} mm, estremo compreso`,
    riferimento: `${T20}, 5.8.2.1.1.1`, fonte: `${letto(T20, 'p. 98')}; voce ammortizzatori.corsa del vano`, stato: 'confermato',
    verifiche: ver('mollaCorsa'),
    nota: 'Il modello chiedeva f > 65 mm (estremo escluso) e dava FALSO invece di «NO!» con f < fmin (correzioni S1, X6).',
  },
  {
    id: 'rt2.amm.molla.carichi', area: 'ammortizzatori', titolo: 'Ammortizzatori a molla: forza a corsa completa',
    valore: `Fadm/Fris tra ${it(KR.springStaticMin)} e ${KR.springStaticMax}, estremi compresi; Fris = (P + Q)·g/Na per la cabina, Mcw·g/Na per il contrappeso`,
    riferimento: `${T20}, 5.8.2.1.1.2`, fonte: `${letto(T20, 'p. 98')}; voce ammortizzatori.molla della prima relazione`, stato: 'confermato',
    verifiche: ver('mollaCarichi'),
    nota: 'Fadm è la forza della molla alla sua corsa f (la lettura del modello e del software); il modello escludeva gli estremi (correzione S2).',
  },
  {
    id: 'rt2.amm.molla.geometria', area: 'ammortizzatori', titolo: 'Ammortizzatori a molla: spire, corsa e forza dalla geometria',
    valore: `spire attive i = (L0 − ${it(K_AMM.spireEstremi)}·d)/p; corsa f = L0 − d·(1 + ${it(K_AMM.frecciaSpire)}·i); `
      + 'Fadm = f·G·d⁴/(8·D³·i); g = 9,81 m/s²',
    riferimento: `${T20}, 5.8.2.1.1 (il modello)`, fonte: MODELLO, stato: 'prassi', costanti: ['spireEstremi', 'frecciaSpire'],
    verifiche: ver('mollaCorsa', 'mollaCarichi'),
    nota: 'Formule del modello («sistemata come in calcolo 95/16/CE», 2005): per le molle TAA danno una corsa minore di quella del catalogo '
      + '(a favore di sicurezza). La riga «78.026 Centoducati» del catalogo ha 14,25 spire invece delle 15,25 che danno la sua corsa, la sua '
      + 'costante e il suo carico massimo: corretta (S6).',
  },
  {
    id: 'rt2.amm.urto', area: 'ammortizzatori', titolo: 'Ammortizzatori autan e idraulici: velocità d’urto',
    valore: `${it(KR.bufImpactRatio)}·v non oltre la velocità d’urto massima del certificato d’esame del tipo`,
    riferimento: `${T20}, 5.8.2.1.2.1 e 5.8.2.2.3; ${T50}, 5.5.4`, fonte: `${letto(T20, 'pp. 98–99')}; voce ammortizzatori.velocita della prima relazione`,
    stato: 'confermato', verifiche: ver('autanUrto', 'idrUrto'),
    nota: 'Il modello non lo verifica (correzioni A1, H4). Per gli idraulici del catalogo del modello, senza il dato del certificato, il '
      + `software prende ${it(KR.bufImpactRatio)} volte la seconda cifra di «v nom» (1,6 e 2 m/s): lettura del catalogo, da confermare con il certificato.`,
  },
  {
    id: 'rt2.amm.masse', area: 'ammortizzatori', titolo: 'Ammortizzatori autan e idraulici: masse del certificato',
    valore: 'la massa su ciascun ammortizzatore entro il campo minimo–massimo del certificato: cabina vuota P/Na e a pieno carico (P + Q)/Na, '
      + 'contrappeso Mcw/Na',
    riferimento: `${T50}, 5.5.4; ${T20}, 5.8.2.1.2.1 e 5.8.2.2.3`, fonte: `${letto(T50, 'p. 24')}; voce ammortizzatori.massa della prima relazione`,
    stato: 'scelta',
    verifiche: ['autan', 'idr'].flatMap((t) => [`ammCabina.${t}MassaVuota`, `ammCabina.${t}MassaCarica`, `ammCwt.${t}Massa`]),
    nota: 'Che vi rientri anche la cabina vuota è la lettura del software (come nella prima relazione). Il catalogo idraulico del modello dà '
      + '«carico [kg]» 300–2000 per ammortizzatore, non verificato dal modello (H4).',
  },
  {
    id: 'rt2.amm.idraulici.corsa', area: 'ammortizzatori', titolo: 'Ammortizzatori idraulici: corsa',
    valore: `corsa ≥ ${it(KV_VERT.oilStrokeK)}·v² m; nessun minimo di 65 mm (vale solo per le molle)`,
    riferimento: `${T20}, 5.8.2.2.1`, fonte: `${letto(T20, 'p. 99')}; voce ammortizzatori.idraulici del vano`, stato: 'confermato',
    verifiche: ver('idrCorsa'),
    nota: 'Il modello applicava anche f > 65 mm (correzione H3).',
  },
  {
    id: 'rt2.amm.idraulici.ridotta', area: 'ammortizzatori', titolo: 'Ammortizzatori idraulici: corsa ridotta con il rallentamento controllato',
    valore: `con il rallentamento controllato («CON») e la velocità nominale oltre ${it(K_AMM.ridottaSoglia)} m/s: corsa ≥ ${it(KV_VERT.oilStrokeK)}·vi², `
      + `con vi la velocità di contatto con l’ammortizzatore garantita dal controllo (al posto del 115 % della nominale), comunque non meno di `
      + `${K_AMM.ridottaMin} mm né più della corsa piena ${it(KV_VERT.oilStrokeK)}·v²; fino a ${it(K_AMM.ridottaSoglia)} m/s nessuna riduzione`,
    riferimento: `${T20}, 5.8.2.2.2 e 5.12.1.3`, fonte: `${letto(T20, 'p. 99')}; ${MODELLO}`, stato: 'confermato',
    costanti: ['ridottaSoglia', 'ridottaMin'], verifiche: ver('idrCorsa'),
    nota: 'Il modello riduceva la corsa al 50 % (a un terzo oltre 4 m/s) a ogni velocità: sono le regole della UNI EN 81-1:1998, 10.4.3.2 '
      + '(con i minimi di 420 e 540 mm), non della UNI EN 81-20:2020 — corretto. Con vi la formula tiene il fattore 0,0674 della corsa piena '
      + '(lettura a favore di sicurezza; senza il 115 % sarebbe vi²/(2·g)): da confermare con il soggetto della verifica.',
  },
  {
    id: 'rt2.amm.cataloghi', area: 'ammortizzatori', titolo: 'Cataloghi degli ammortizzatori del modello',
    valore: 'molle: elenco A (TAA90, 78.0xx Centoducati) ed elenco B (DONATI / CMM); autan: MAA 320 H1–H6 (f max, F1); idraulici DONATI 150510 e '
      + '150520 (v nom, carico min–max, corsa reale); le righe senza dati non sono offerte',
    riferimento: 'dati di catalogo del modello', fonte: MODELLO, stato: 'prassi',
    nota: 'Dati del modello, non della norma: vanno confrontati con la scheda del costruttore dell’ammortizzatore montato.',
  },
];

import { AGGIUNTI } from './collegamenti-aggiunti.js';
import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни — СПИСЪКЪТ: едно и също нещо от уредбата, записано на повече от едно място — в
 * картата, в поръчката за таблото (Pelazza `oq`, MoviLift `om`, Mastech NG120 `mn` или QI Touch `mq` —
 * според марката и модела, никога две), в листа с данни за аргано (`pa`) и в листа на 2SG (`sg`).
 * Всяко място, в което човекът не е писал, се попълва от другите — във всяка посока и докато се пише
 * (public/js/collegati.js); различните стойности се сравняват (collegati.ts). Типовете и проверката
 * при старт са в collegamenti.ts; добавените по-късно връзки — в collegamenti-aggiunti.ts (след тези).
 *
 * Редът на местата е и редът на източниците: първо картата, после таблата, аргано и 2SG. Редът на
 * връзките е редът в списъка с разминавания (и в отпечатъка на потвърждението) — новите са накрая.
 * Решено със собственика (октомври 2026): спирките, скоростта и видът ѝ, ходът, товарът, напрежението
 * на мотора и на спирачката, капацитетът, № на асансьора, входовете, вратите, достъпите, мястото на
 * машината, въжетата; после — адресът, матрикулата, марката, видът на уредбата, операторът (между
 * таблата), токът и оборотите на мотора; после — централата и Mastech (и в тези връзки). Марката,
 * напрежението и светлият отвор на оператора в картата — махнати (собственикът, октомври 2026).
 */
const BASE: readonly Collegamento[] = [
  {
    // „Piani n°“ на листа за аргано са спирките.
    key: 'fermate',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'fermate' },
      { luogo: 'oq', campo: 'nFermate' },
      { luogo: 'om', campo: 'fermate' },
      { luogo: 'mn', campo: 'nFermate' },
      { luogo: 'mq', campo: 'numeroFermate' },
      { luogo: 'pa', campo: 'piani' },
    ],
  },
  {
    // Скоростта: до 21 октомври 2026 и в централата на картата (махната — собственикът).
    key: 'velocita',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'velocita' },
      { luogo: 'om', campo: 'velocita' },
      { luogo: 'mn', campo: 'velocita' },
      { luogo: 'mq', campo: 'velocita' },
      { luogo: 'pa', campo: 'velocita' },
    ],
  },
  {
    // Табло „1/2 Velocità, VVVF“ ↔ двигател на аргано AC1/AC2/Inverter.
    key: 'tipoVelocita',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'oq',
        voci: { tq1Velocita: '1V', tq2Velocita: '2V', tqVvvfAperto: 'VVVF', tqVvvfChiuso: 'VVVF' },
      },
      { luogo: 'mn', voci: { velocita1: '1V', velocita2: '2V', vvvf: 'VVVF' } },
      { luogo: 'pa', voci: { motoreAc1: '1V', motoreAc2: '2V', motoreInverter: 'VVVF' } },
    ],
  },
  {
    // Ходът в метри; „Corsa [mm]“ на QI Touch е в милиметри — не е тук. Ходът на централата на картата —
    // махнат (21 октомври 2026).
    key: 'corsa',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'corsa' },
      { luogo: 'om', campo: 'corsa' },
      { luogo: 'mn', campo: 'corsa' },
      { luogo: 'pa', campo: 'corsa' },
    ],
  },
  {
    key: 'portata',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'portataKg' },
      { luogo: 'om', campo: 'portata' },
      { luogo: 'mq', campo: 'portataNominale' },
      { luogo: 'pa', campo: 'portata' },
    ],
  },
  {
    key: 'capienza',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'capienzaPersone' },
      { luogo: 'om', campo: 'capienza' },
      { luogo: 'pa', campo: 'persone' },
    ],
  },
  {
    key: 'numeroImpianto',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'numeroImpianto' },
      { luogo: 'om', campo: 'nImpianto' },
      { luogo: 'pa', campo: 'nImpianto' },
    ],
  },
  {
    // MoviLift: „Tens.“ в данните на аргано („Fune“). Тяхното „Freno“ не казва дали е напрежение.
    key: 'tensioneMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motVca' },
      { luogo: 'om', campo: 'tensFune' },
    ],
  },
  {
    key: 'tensioneFreno',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'circuitoFrenoVcc' },
      { luogo: 'mn', campo: 'tensioneFreno' },
      { luogo: 'mq', campo: 'tensioneFreno' },
      { luogo: 'pa', campo: 'tensioneFreno' },
    ],
  },
  {
    // Операторът, който 2SG доставя (кабината), е за автоматични или полуавтоматични врати.
    key: 'porte',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoPorte',
        voci: {
          AUTOMATICHE: 'AUTOMATICHE',
          SEMIAUTOMATICHE: 'SEMIAUTOMATICHE',
          MANUALI: 'MANUALI',
        },
      },
      {
        luogo: 'oq',
        voci: {
          porteAutomatiche: 'AUTOMATICHE',
          porteSemiautomatiche: 'SEMIAUTOMATICHE',
          porteManuali: 'MANUALI',
        },
      },
      // NG120: „Tipo di Operatore 1“ — вратите на първия достъп.
      {
        luogo: 'mn',
        voci: {
          op1Automatico: 'AUTOMATICHE',
          op1Semiautomatico: 'SEMIAUTOMATICHE',
          op1Manuale: 'MANUALI',
        },
      },
      { luogo: 'sg', voci: { automatico: 'AUTOMATICHE', semiautomatico: 'SEMIAUTOMATICHE' } },
    ],
  },
  {
    // „Accessi: 2“ в картата = 2 достъпа в поръчката.
    key: 'accessi',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', valori: { si: '2', no: '1' } },
      { luogo: 'oq', campo: 'nAccessi' },
      { luogo: 'mq', campo: 'numeroAccessi' },
    ],
  },
  {
    // Същото за MoviLift: радио „Operatore Unico / Doppio Ingresso (Selezionato)“.
    key: 'ingressi',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'doppioAccesso', voci: { no: 'UNICO', si: 'DOPPIO' } },
      {
        luogo: 'om',
        campo: 'ingressi',
        voci: { unico: 'UNICO', doppio: 'DOPPIO', doppioSelezionato: 'DOPPIO' },
      },
    ],
  },
  {
    // На листа за аргано мястото на машината е текст („Macchina basso/alto“) — попълва се от
    // огледа (`prefill`), не се сравнява.
    key: 'macchina',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'ubicazioneMacchina', voci: { ALTO: 'ALTO', BASSO: 'BASSO' } },
      { luogo: 'om', campo: 'locMacc', voci: { alto: 'ALTO', basso: 'BASSO' } },
    ],
  },
  {
    key: 'funiNumero',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiNumero' },
      { luogo: 'pa', campo: 'funiN' },
    ],
  },
  {
    key: 'funiDiametro',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiDiametroMm' },
      { luogo: 'pa', campo: 'funiDiametro' },
    ],
  },
  {
    key: 'funiTrefoli',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'funiTrefoli' },
      { luogo: 'pa', campo: 'trefoli' },
    ],
  },
  {
    key: 'indirizzo',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'indirizzo' },
      { luogo: 'pa', campo: 'indirizzo' },
    ],
  },
  {
    key: 'matricola',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'matricola' },
      { luogo: 'pa', campo: 'matricola' },
    ],
  },
  {
    key: 'marca',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'marca' },
      { luogo: 'pa', campo: 'marca' },
    ],
  },
  {
    // „Idraulico“ в „Tipo di Quadro“ на Pelazza; електрическата и MRL нямат своя отметка там.
    key: 'tipoImpianto',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoImpianto',
        voci: { ELETTRICO: 'ELETTRICO', IDRAULICO: 'IDRAULICO', GEARLESS: 'GEARLESS' },
      },
      { luogo: 'oq', voci: { tqIdraulico: 'IDRAULICO' } },
    ],
  },
  {
    // Операторът — таблата помежду си, само при смяна на марката или модела (отворено е едно). „Modello“
    // на Pelazza често е по-подробен от марката („Selcom Midi Supra“) — само попълване.
    key: 'operatoreMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'oq', campo: 'opModello' },
      { luogo: 'om', campo: 'marcaOpA' },
      { luogo: 'mq', campo: 'modelloOperatore1' },
    ],
  },
  {
    // Токът на мотора: „In (A)“ на Pelazza, „Amp.“ в „Fune“ на MoviLift, „Corrente (A)“ на аргано.
    key: 'correnteMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motIn' },
      { luogo: 'om', campo: 'amp' },
      { luogo: 'mn', campo: 'correnteNominale' },
      { luogo: 'mq', campo: 'correnteMotore' },
      { luogo: 'pa', campo: 'ampere' },
    ],
  },
  {
    key: 'giriMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'om', campo: 'numGiri' },
      { luogo: 'pa', campo: 'giri' },
    ],
  },
];

export const COLLEGAMENTI: readonly Collegamento[] = [...BASE, ...AGGIUNTI];

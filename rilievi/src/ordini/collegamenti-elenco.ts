import { AGGIUNTI } from './collegamenti-aggiunti.js';
import { IMPIANTO } from './collegamenti-impianto.js';
import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни — СПИСЪКЪТ: едно и също нещо от уредбата, записано на повече от едно място — в
 * картата, в поръчката за таблото (Pelazza `oq`, MoviLift `om`, Mastech NG120 `mn` или QI Touch `mq`,
 * Elettroquadri geared `eg`, gearless `el` или oleodinamico `eo` — според марката, модела и вида на
 * уредбата, никога две), в листа с данни за аргано (`pa`) и в листа на 2SG (`sg`).
 * Всяко място, в което човекът не е писал, се попълва от другите — във всяка посока и докато се пише
 * (public/js/collegati.js); различните стойности се сравняват (collegati.ts). Типовете и проверката
 * при старт са в collegamenti.ts; втората част на първия списък (от адреса нататък) — в
 * collegamenti-impianto.ts; добавените по-късно връзки — в collegamenti-aggiunti.ts (след тези).
 *
 * Редът на местата е и редът на източниците: първо картата, после таблата, аргано и 2SG. Редът на
 * връзките е редът в списъка с разминавания (и в отпечатъка на потвърждението) — новите са накрая.
 * Решено със собственика (октомври 2026): спирките, скоростта и видът ѝ, ходът, товарът, напрежението
 * на мотора и на спирачката, капацитетът, № на асансьора, входовете, вратите, достъпите, мястото на
 * машината, въжетата; после — адресът, матрикулата, марката, видът на уредбата, операторът (между
 * таблата), токът и оборотите на мотора; после — централата и Mastech (и в тези връзки). Марката,
 * напрежението и светлият отвор на оператора в картата — махнати (собственикът, октомври 2026).
 * Elettroquadri (30 октомври 2026) — в същите връзки; вратите им са разделени на етажни и на кабината
 * (полуавтоматичните са две отметки) — не са във връзката на вратите.
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
      { luogo: 'eg', campo: 'nFermate' },
      { luogo: 'el', campo: 'nFermate' },
      { luogo: 'eo', campo: 'nFermate' },
      { luogo: 'pa', campo: 'piani' },
      { luogo: 'au', campo: 'fermate' },
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
      { luogo: 'eg', campo: 'velocita' },
      { luogo: 'el', campo: 'velocita' },
      { luogo: 'eo', campo: 'velocita' },
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
      // Elettroquadri geared: „2 velocità“ и „Con VVVF“ в „Motore“ (едноскоростен няма своя отметка).
      { luogo: 'eg', voci: { dueVelocita: '2V', conVvvf: 'VVVF' } },
      { luogo: 'pa', voci: { motoreAc1: '1V', motoreAc2: '2V', motoreInverter: 'VVVF' } },
    ],
  },
  {
    // Ходът в метри; „Corsa [mm]“ на QI Touch е в милиметри — не е тук. Ходът на централата на картата —
    // махнат (21 октомври 2026). Elettroquadri: „Corsa (m)“ на gearless; geared и oleodinamico — същото.
    key: 'corsa',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'corsa' },
      { luogo: 'om', campo: 'corsa' },
      { luogo: 'mn', campo: 'corsa' },
      { luogo: 'eg', campo: 'corsa' },
      { luogo: 'el', campo: 'corsa' },
      { luogo: 'eo', campo: 'corsa' },
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
      { luogo: 'au', campo: 'portata' },
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
      { luogo: 'eg', campo: 'frenoV' },
      { luogo: 'el', campo: 'frenoVcc' },
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
      { luogo: 'so', voci: { automatico: 'AUTOMATICHE', semiautomatico: 'SEMIAUTOMATICHE' } },
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
      // Elettroquadri: „Numero di accessi in cabina“ 1/2/3 (три достъпа картата не казва).
      { luogo: 'eg', voci: { accessi1: 'UNICO', accessi2: 'DOPPIO' } },
      { luogo: 'el', voci: { accessi1: 'UNICO', accessi2: 'DOPPIO' } },
      { luogo: 'eo', voci: { accessi1: 'UNICO', accessi2: 'DOPPIO' } },
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
      // Elettroquadri: позицията на централата в машинното (oleodinamico). „Con Locale macchina: Basso /
      // Alto“ на gearless — не: листът се отваря при MRL (без машинно), там е „MRL gearless“ (видът).
      { luogo: 'eo', voci: { centralinaAlto: 'ALTO', centralinaBasso: 'BASSO' } },
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
];

export const COLLEGAMENTI: readonly Collegamento[] = [...BASE, ...IMPIANTO, ...AGGIUNTI];

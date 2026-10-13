import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни — СПИСЪКЪТ: едно и също нещо от уредбата, записано на повече от едно място — в
 * картата, в поръчката за таблото (Pelazza `oq` или MoviLift `om` — според марката, никога двете), в
 * листа с данни за аргано (`pa`) и в листа на 2SG (`sg`). Всяко място, в което човекът не е писал, се
 * попълва от другите — във всяка посока и докато се пише (public/js/collegati.js); различните
 * стойности се сравняват (collegati.ts). Типовете и проверката при старт са в collegamenti.ts.
 *
 * Редът на местата е и редът на източниците: първо картата, после таблото, аргано и 2SG. Редът на
 * връзките е редът в списъка с разминавания (и в отпечатъка на потвърждението) — новите са накрая.
 * Решено със собственика (октомври 2026): спирките, скоростта и нейният вид, ходът, товарът,
 * напрежението на мотора и на спирачката — плюс досегашното попълване от картата (врати, достъпи,
 * място на машината, въжета). MoviLift и листът за аргано пишат и капацитета и № на асансьора;
 * MoviLift — и входовете на кабината. После (октомври 2026, „всички полета с еднакви параметри“):
 * адресът, матрикулата и марката (листът за аргано), видът на уредбата (Pelazza „Idraulico“), вратите
 * на 2SG, операторът (марка, напрежение) и светлият отвор, токът и оборотите на мотора.
 */
export const COLLEGAMENTI: readonly Collegamento[] = [
  {
    // „Piani n°“ на листа за аргано са спирките.
    key: 'fermate',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'fermate' },
      { luogo: 'oq', campo: 'nFermate' },
      { luogo: 'om', campo: 'fermate' },
      { luogo: 'pa', campo: 'piani' },
    ],
  },
  {
    key: 'velocita',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'velocita' },
      { luogo: 'om', campo: 'velocita' },
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
      { luogo: 'pa', voci: { motoreAc1: '1V', motoreAc2: '2V', motoreInverter: 'VVVF' } },
    ],
  },
  {
    key: 'corsa',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'corsa' },
      { luogo: 'om', campo: 'corsa' },
      { luogo: 'pa', campo: 'corsa' },
    ],
  },
  {
    key: 'portata',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'portataKg' },
      { luogo: 'om', campo: 'portata' },
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
    // „Modello“ на Pelazza често е по-подробен от марката („Selcom Midi Supra“) — само попълване.
    key: 'operatoreMarca',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'operatoreMarca' },
      { luogo: 'oq', campo: 'opModello' },
      { luogo: 'om', campo: 'marcaOpA' },
    ],
  },
  {
    key: 'operatoreTensione',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'operatoreTensione' },
      { luogo: 'om', campo: 'voltA' },
    ],
  },
  {
    // „Luce porte“ на картата е свободен текст („800 x 2000“, „800“) — на 2SG е широчина x височина
    // на вратата на кабината. Само попълване: „800“ срещу „800 x 2000“ не е разлика.
    key: 'lucePorte',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'lucePorte' },
      { luogo: 'sg', campi: ['luceCabinaL', 'luceCabinaH'] },
    ],
  },
  {
    // Токът на мотора: „In (A)“ на Pelazza, „Amp.“ в „Fune“ на MoviLift, „Corrente (A)“ на аргано.
    key: 'correnteMotore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'motIn' },
      { luogo: 'om', campo: 'amp' },
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

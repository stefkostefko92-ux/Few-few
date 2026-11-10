import type { Collegamento } from './collegamenti.js';

/**
 * Свързаните данни на картата от 3 ноември 2026 (собственикът: „tutti i dati possibili … in tutti i campi
 * che hanno voci identiche“) — след добавените (collegamenti-aggiunti.ts): новата централа, кит A3,
 * намаленото пространство, вратите на етажа и на кабината, аргано, инверторът и операторът. Таблата
 * помежду си — в collegamenti-quadri.ts, бутониерите на DMG — в collegamenti-pulsantiere.ts (в този ред).
 * Каквото не е тук нарочно: различна мерна единица (kW ↔ HP, ход в mm ↔ m), поле без единица („Pot.
 * Mot.“ на MoviLift), избор, при който едната страна е по-подробна и би се гадало („Display“ Matisse
 * 7″ / 10,1″ ↔ „Matisse“), и полета, които модулът показва само при друг свой избор.
 */
export const SCHEDA_NUOVI: readonly Collegamento[] = [
  {
    // Мощността в HP на мотора (при хидравлична — на централата). „Cv“ на листа за аргано е същото
    // число от табелата на мотора.
    key: 'potenzaHp',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'centralinaMotoreHp' },
      { luogo: 'oq', campo: 'motHp' },
      { luogo: 'mn', campo: 'potenzaHp' },
      { luogo: 'eg', campo: 'motoreHp' },
      { luogo: 'eo', campo: 'motoreHp' },
      { luogo: 'pa', campo: 'potenzaCv' },
    ],
  },
  {
    // Пускането на мотора. Вариантите „с моторизиран клапан“ и „Soft Starter + електроклапан“ на Pelazza
    // и „Tra le fasi“ на Elettroquadri нямат двойка — не са тук.
    key: 'avviamento',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'centralinaAvvio',
        voci: { DIRETTO: 'DIRETTO', STELLA_TRIANGOLO: 'STELLA' },
      },
      {
        luogo: 'oq',
        voci: { avvDiretto: 'DIRETTO', avvStellaTriangolo: 'STELLA', avvSoftStarter: 'SOFT' },
      },
      {
        luogo: 'om',
        campo: 'avviamento',
        voci: { diretto: 'DIRETTO', stellaTriangolo: 'STELLA', softStart: 'SOFT' },
      },
      {
        luogo: 'dp',
        campo: 'avviamento',
        voci: { diretto: 'DIRETTO', stellaTriangolo: 'STELLA', softStarter: 'SOFT' },
      },
      {
        luogo: 'eo',
        voci: {
          avviamentoDiretto: 'DIRETTO',
          avviamentoStellaTriangolo: 'STELLA',
          softStarter: 'SOFT',
        },
      },
    ],
  },
  {
    // „ElettroValv.“ на MoviLift не казва дали е напрежение — не е тук (броят им — да, по-долу).
    key: 'tensioneValvole',
    tipo: 'numero',
    membri: [
      { luogo: 'scheda', campo: 'centralinaTensioneValvole' },
      { luogo: 'oq', campo: 'elettrovalvoleVcc' },
      { luogo: 'dp', campo: 'valvoleTensione' },
      { luogo: 'eo', campo: 'elettrovalvoleV' },
    ],
  },
  {
    // „Installare kit A3?“ на картата и „Emendamento A3“ на таблата.
    key: 'emendamentoA3',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'emendamentoA3', voci: { si: 'A3' } },
      { luogo: 'oq', voci: { normaEmendA3: 'A3' } },
      { luogo: 'dp', voci: { emendamentoA3: 'A3' } },
      { luogo: 'mq', voci: { a32009: 'A3' } },
      { luogo: 'eg', voci: { emendamentoA3: 'A3' } },
      { luogo: 'el', voci: { a3: 'A3' } },
      { luogo: 'eo', voci: { emendamentoA3: 'A3' } },
    ],
  },
  {
    // „Testata ridotta?“ — Pitagora „Testata ridotta (EN81-21)“, Elettroquadri „Se EN81.21 › Testata“.
    key: 'testataRidotta',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'testataRidotta', voci: { si: 'SI' } },
      { luogo: 'dp', voci: { testataRidotta: 'SI' } },
      { luogo: 'eg', voci: { en8121Testata: 'SI' } },
      { luogo: 'eo', voci: { en8121Testata: 'SI' } },
    ],
  },
  {
    key: 'fossaRidotta',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'fossaRidotta', voci: { si: 'SI' } },
      { luogo: 'dp', voci: { fossaRidotta: 'SI' } },
      { luogo: 'eg', voci: { en8121Fossa: 'SI' } },
      { luogo: 'eo', voci: { en8121Fossa: 'SI' } },
    ],
  },
  {
    // Престилката в ямата: таблото на DMG трябва да я управлява.
    key: 'grembiule',
    tipo: 'scelta',
    membri: [
      { luogo: 'scheda', campo: 'fossaInterventi', voci: { GREMBIULE_3_STADI: 'SI' } },
      { luogo: 'dp', voci: { grembiule: 'SI' } },
    ],
  },
  {
    // Вратите на етажа: при полуавтоматични — ръчни (на кабината — автоматични, следващата връзка). От
    // „ръчни“ сама картата не избира (може да са и полуавтоматични).
    key: 'portePiano',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoPorte',
        voci: { AUTOMATICHE: 'AUTO', SEMIAUTOMATICHE: 'MANUALI', MANUALI: 'MANUALI' },
      },
      { luogo: 'dp', campo: 'portePiano', voci: { automatiche: 'AUTO', manuali: 'MANUALI' } },
      { luogo: 'eg', voci: { pianoAutomatiche: 'AUTO', pianoManuali: 'MANUALI' } },
      { luogo: 'el', voci: { pianoAutomatiche: 'AUTO', pianoManuali: 'MANUALI' } },
      { luogo: 'eo', voci: { pianoAutomatiche: 'AUTO', pianoManuali: 'MANUALI' } },
    ],
  },
  {
    // Вратите на кабината. Pitagora различава автоматичните по оператора (Autonome, Regolate, Trifase) —
    // от картата там се слага само „Manuali“.
    key: 'porteCabina',
    tipo: 'scelta',
    membri: [
      {
        luogo: 'scheda',
        campo: 'tipoPorte',
        voci: { AUTOMATICHE: 'AUTO', SEMIAUTOMATICHE: 'AUTO', MANUALI: 'MANUALI' },
      },
      { luogo: 'dp', campo: 'porteCabina', voci: { manuali: 'MANUALI' } },
      { luogo: 'eg', voci: { cabinaAutomatiche: 'AUTO', cabinaManuali: 'MANUALI' } },
      { luogo: 'el', voci: { cabinaAutomatiche: 'AUTO' } },
      { luogo: 'eo', voci: { cabinaAutomatiche: 'AUTO', cabinaManuali: 'MANUALI' } },
    ],
  },
  {
    // „Tipo argano esistente“ (аргано остава) — машината, която новото табло ще води. Само попълване:
    // NG120 пише модела отделно.
    key: 'argano',
    tipo: 'numero',
    confronto: false,
    membri: [
      { luogo: 'scheda', campo: 'arganoTipo' },
      { luogo: 'om', campo: 'argano' },
      { luogo: 'mn', campo: 'argano' },
    ],
  },
  {
    // Листът за аргано и gearless на Elettroquadri: мощността на инвертора в kW.
    key: 'potenzaInverter',
    tipo: 'numero',
    membri: [
      { luogo: 'el', campo: 'vvvfKw' },
      { luogo: 'pa', campo: 'potenzaInverter' },
    ],
  },
  {
    // Напрежението на оператора на вратите (променливо): таблото на Pelazza и листът на 2SG.
    key: 'tensioneOperatore',
    tipo: 'numero',
    membri: [
      { luogo: 'oq', campo: 'opVcaValore' },
      { luogo: 'sg', campo: 'motoreVca' },
      { luogo: 'so', campo: 'motoreVca' },
    ],
  },
];

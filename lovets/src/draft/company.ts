/**
 * Подателят на търговските съобщения — импресумът (ЗЕТ чл. 5, ал. 3, т. 2; ТЗ чл. 13, ал. 1; d.lgs. 70/2003
 * чл. 8; Codice чл. 130, ал. 5). Продуктите не споделят код — същите данни като в fakturist/src/company.ts.
 * Банкова сметка (ТЗ чл. 13, ал. 1) не е включена — решение на собственика.
 */
export const SENDER = {
  name: 'Carbon Stealth VCC',
  nameBg: 'Карбон Стелт ЕДПК',
  eik: '208725180',
  address: {
    bg: 'ул. „Самуил“ № 3, 2670 Бобов дол, България',
    it: 'ul. Samuil 3, 2670 Bobov dol, Bulgaria',
  },
  email: 'info@carbonstealth.eu',
} as const;

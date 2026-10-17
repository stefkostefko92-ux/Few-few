import { TIPO_PORTE } from './field-options.js';
import type { Condition } from './field-types.js';

/** Условията на полетата и разделите на картата (fields.ts) — общите. */

export const yes = (field: string): Condition => ({ field, values: ['si'] });
export const no = (field: string): Condition => ({ field, values: ['no'] });
/** Отговорено — каквото и да е (общото за двата клона на въпрос). */
export const answered = (field: string): Condition => ({ field, values: ['si', 'no'] });
/** „Altro“ при марката → коя. */
export const ALTRA = (field: string): Condition => ({ field, values: ['ALTRO'] });
/** Окачванията и листът 2SG (с оператора на кабината) — при автоматични и полуавтоматични врати. */
export const PORTE_CON_OPERATORE: Condition = {
  field: 'tipoPorte',
  values: ['AUTOMATICHE', 'SEMIAUTOMATICHE'],
};
/** Двойният достъп — при всеки вид врати, и при ръчните (решение на собственика, октомври 2026). */
export const PORTE_SCELTE: Condition = { field: 'tipoPorte', values: TIPO_PORTE };
/** Бравите и прибиращата се шейна — при ръчни и при полуавтоматични врати. */
export const PORTE_CON_PATTINO: Condition = {
  field: 'tipoPorte',
  values: ['MANUALI', 'SEMIAUTOMATICHE'],
};
/**
 * Хидравличната уредба: вместо аргано, ограничител, обтегач и въже на ограничителя — централата
 * (собственикът, октомври 2026). Без отметнат вид са и аргано, и ограничителят.
 */
export const IDRAULICO: Condition = { field: 'tipoImpianto', values: ['IDRAULICO'] };
export const NON_IDRAULICO: Condition = { ...IDRAULICO, not: true };

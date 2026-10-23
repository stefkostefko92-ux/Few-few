// The conditions of the sheet's fields and sections (fields.ts) — the shared ones. Ported 1:1 from rilievi
// (src/schede/field-conditions.ts, commit 988f3cf37).
import { TIPO_PORTE } from './field-options';
import type { Condition } from './field-types';

export const yes = (field: string): Condition => ({ field, values: ['si'] });
export const no = (field: string): Condition => ({ field, values: ['no'] });
/** Answered — whatever the answer (what both branches of a question share). */
export const answered = (field: string): Condition => ({ field, values: ['si', 'no'] });
/** «Altro» as the make → which one. */
export const ALTRA = (field: string): Condition => ({ field, values: ['ALTRO'] });
/**
 * The suspensions and 2SG's sheet (with the car operator) — only with automatic doors: the semi-automatic ones have
 * locks only (the owner, October 2026).
 */
export const PORTE_AUTOMATICHE: Condition = { field: 'tipoPorte', values: ['AUTOMATICHE'] };
/** The double access — with every kind of doors, the manual ones too (the owner's decision, October 2026). */
export const PORTE_SCELTE: Condition = { field: 'tipoPorte', values: TIPO_PORTE };
/** The locks and the retiring cam — with manual and with semi-automatic doors. */
export const PORTE_CON_PATTINO: Condition = { field: 'tipoPorte', values: ['MANUALI', 'SEMIAUTOMATICHE'] };
/**
 * A hydraulic lift: the power unit instead of the argano, the governor, the tensioner and the governor rope (the owner,
 * October 2026). Without a kind ticked, both the argano and the governor are there.
 */
export const IDRAULICO: Condition = { field: 'tipoImpianto', values: ['IDRAULICO'] };
export const NON_IDRAULICO: Condition = { ...IDRAULICO, not: true };

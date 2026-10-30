import type { Role } from '@prisma/client';
import { ALL_ROLES, can, type Capability } from '../auth/roles.js';
import type { Translator } from '../i18n.js';
import { SECTIONS } from '../schede/fields.js';

/**
 * Съдържанието на публичната страница, което идва от самия код, не е написано на ръка: разделите на
 * картата с полетата им (fields.ts) и какво може всяка роля (roles.ts). Така витрината не може да
 * обещае поле или право, което порталът няма.
 */

/** Въпросите в „Domande frequenti“ — страницата и FAQPage в JSON-LD ги вземат оттук. */
export const FAQ_IDS = ['selfSignup', 'visibility', 'app', 'print', 'data'] as const;
export type FaqId = (typeof FAQ_IDS)[number];

/** Стъпките на „Come si ottiene l'accesso“ (`site.steps.s1…s4`) — за страницата и за HowTo. */
export const STEPS = [1, 2, 3, 4] as const;

/**
 * Възможностите в „Dal sopralluogo all'ufficio“ (`site.features.<id>`), до двете снимки: на обекта (при
 * бутониерата в кабината) и в офиса (таблетът с портала). Редът тук е редът на страницата и на
 * `featureList` в JSON-LD.
 */
export const SCENE = [
  { immagine: 'bottoniera', features: ['phone', 'misure', 'orders'] },
  { immagine: 'tablet', features: ['search', 'print', 'safe'] },
] as const;

export const FEATURES = SCENE.flatMap((scena) => scena.features);

export interface LegendSection {
  /** Поредният номер на раздела — същият е и маркерът на чертежа. */
  n: number;
  key: string;
  title: string;
  fields: string[];
}

/** Разделите на картата с полетата им — легендата на чертежа (раздел n = маркер n). */
export function sheetLegend(t: Translator): LegendSection[] {
  return SECTIONS.map((section, index) => ({
    n: index + 1,
    key: section.key,
    title: t(`scheda.section.${section.key}`),
    fields: section.fields.map((field) => t(`scheda.field.${field.key}`)),
  }));
}

export function sheetCounts(): { fields: number; sections: number } {
  return {
    fields: SECTIONS.reduce((sum, section) => sum + section.fields.length, 0),
    sections: SECTIONS.length,
  };
}

/** Колоните на таблицата с ролите — способностите от roles.ts, които фирмата има. */
export const MATRIX_CAPABILITIES = [
  'schede:read',
  'schede:write',
  'schede:delete',
  'schede:trash',
  'users:manage',
  'audit:view',
] as const satisfies readonly Capability[];

export interface RoleRow {
  role: Role;
  caps: boolean[];
}

/** Ролите във фирма (без MASTER — той е администрацията на портала) и какво може всяка. */
export function roleMatrix(): RoleRow[] {
  return ALL_ROLES.filter((role) => role !== 'MASTER').map((role) => ({
    role,
    caps: MATRIX_CAPABILITIES.map((capability) => can(role, capability)),
  }));
}

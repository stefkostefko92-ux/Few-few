import type { Role } from '@prisma/client';
import { z } from 'zod';
import { can, type Capability } from './roles.js';

/**
 * Имената и правата на ролите по фирма (собственикът, 30 октомври 2026: „ogni amministratore di Azienda
 * possa modificare i nomi dei ruoli e i permessi dei ruoli“). Администраторът на фирмата сменя за ролите
 * под своята само работата: картите (четене, писане, изтриване, кошче), листовете за интервенция и
 * табелите (четене, писане) и регистъра. Хората, настройките на фирмата, фирмите и заявките остават по
 * йерархията (roles.ts) — никой не си дава повече от администратора, а ADMIN не може да си вземе правата.
 * Записаното е в `Azienda.permessiRuoli` / `nomiRuoli` и се чете с недоверие: непознатата роля или
 * способност се маха, липсващата роля е по подразбиране.
 */

export const CAPACITA_CONFIGURABILI = [
  'schede:read',
  'schede:write',
  'schede:delete',
  'schede:trash',
  'interventi:read',
  'interventi:write',
  'audit:view',
] as const satisfies readonly Capability[];
export type CapacitaConfigurabile = (typeof CAPACITA_CONFIGURABILI)[number];

/** Ролите, чиито права сменя администраторът на фирмата — тези под неговата. */
export const RUOLI_CONFIGURABILI = [
  'DIREZIONE',
  'RESPONSABILE',
  'TECNICO',
  'OPERATORE',
  'CLIENTE',
] as const satisfies readonly Role[];
export type RuoloConfigurabile = (typeof RUOLI_CONFIGURABILI)[number];

/** Ролите на фирмата, чиито имена се сменят (MASTER е на портала, не на фирмата). */
export const RUOLI_AZIENDA = ['ADMIN', ...RUOLI_CONFIGURABILI] as const satisfies readonly Role[];
export type RuoloAzienda = (typeof RUOLI_AZIENDA)[number];

export type PermessiRuoli = Partial<Record<RuoloConfigurabile, readonly CapacitaConfigurabile[]>>;
export type NomiRuoli = Partial<Record<RuoloAzienda, string>>;

/** Без четенето писането, изтриването и кошчето са безсмислени — вървят с него. */
const IMPLICA: Readonly<Partial<Record<CapacitaConfigurabile, CapacitaConfigurabile>>> = {
  'schede:write': 'schede:read',
  'schede:delete': 'schede:read',
  'schede:trash': 'schede:read',
  'interventi:write': 'interventi:read',
};

const isConfigurabile = (value: unknown): value is CapacitaConfigurabile =>
  typeof value === 'string' && (CAPACITA_CONFIGURABILI as readonly string[]).includes(value);

/** Правата на ролята с това, което те водят със себе си, в реда на CAPACITA_CONFIGURABILI. */
export function chiudi(capacita: readonly CapacitaConfigurabile[]): CapacitaConfigurabile[] {
  const set = new Set(capacita);
  for (const c of capacita) {
    const implicata = IMPLICA[c];
    if (implicata) set.add(implicata);
  }
  return CAPACITA_CONFIGURABILI.filter((c) => set.has(c));
}

/** Правата по подразбиране на ролята (йерархията в roles.ts). */
export const predefiniti = (role: RuoloConfigurabile): CapacitaConfigurabile[] =>
  CAPACITA_CONFIGURABILI.filter((c) => can(role, c));

/** Записаното в базата: само познатите роли и способности; иначе — нищо (по подразбиране). */
export function permessiSalvati(value: unknown): PermessiRuoli {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: PermessiRuoli = {};
  for (const role of RUOLI_CONFIGURABILI) {
    const list = Object.hasOwn(raw, role) ? raw[role] : undefined;
    if (Array.isArray(list)) out[role] = chiudi(list.filter(isConfigurabile));
  }
  return out;
}

const nome = z
  .string()
  .transform((v) =>
    v
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(1).max(40));

/** Записаните имена: само на ролите на фирмата, непразни, до 40 знака; иначе — името по подразбиране. */
export function nomiSalvati(value: unknown): NomiRuoli {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: NomiRuoli = {};
  for (const role of RUOLI_AZIENDA) {
    const parsed = Object.hasOwn(raw, role) ? nome.safeParse(raw[role]) : null;
    if (parsed?.success) out[role] = parsed.data;
  }
  return out;
}

/**
 * Способността на ролята във фирмата: MASTER и ADMIN — винаги по йерархията; ролите под ADMIN — по
 * записаното във фирмата за способностите, които се сменят, иначе по йерархията.
 */
export function puo(role: Role, capability: Capability, permessi?: PermessiRuoli): boolean {
  if (!permessi || role === 'MASTER' || role === 'ADMIN' || !isConfigurabile(capability)) {
    return can(role, capability);
  }
  const list = permessi[role];
  return list ? list.includes(capability) : can(role, capability);
}

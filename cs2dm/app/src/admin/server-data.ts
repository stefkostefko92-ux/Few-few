import { z } from 'zod';

/**
 * Данните от агента (§9) и режимите на DM плъгина. Агентът редактира логовете сам; тук се
 * редактират ОТНОВО (защита в дълбочина) — ред с IP, GSLT или дълъг hex не стига до браузъра.
 */

/** Custom режимите от `server/mods/config/Deathmatch.json` („Custom Modes“) — тестът ги сверява. */
export const DM_MODES = [
  { id: 0, name: 'All Weapons' },
  { id: 1, name: 'Only Headshot' },
  { id: 2, name: 'Only Deagle' },
  { id: 3, name: 'Only Pistols' },
  { id: 4, name: 'Only SMG' },
] as const;

export const LOG_SOURCES = ['css', 'journal'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];
export const MAX_LOG_LINES = 200;

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g;
/** Кандидат за IPv6; редактира се само с „::“ или ≥ 5 двоеточия — часът „12:34:56“ остава. */
const IPV6 = /[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}/gi;
const GSLT = /sv_setsteamaccount\s+\S+/gi;
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;

export function redactLine(line: string): string {
  return line
    .replace(GSLT, 'sv_setsteamaccount <redacted>')
    .replace(LONG_HEX, '<redacted>')
    .replace(IPV4, 'x.x.x.x')
    .replace(IPV6, (match) =>
      /[0-9a-f]/i.test(match) && (match.includes('::') || match.split(':').length > 5)
        ? 'x.x.x.x'
        : match,
    )
    .slice(0, 2000);
}

const linesSchema = z.array(z.string().max(100_000)).max(MAX_LOG_LINES * 2);
/** Формата на `data` за `logs`: масив от редове или `{lines: […]}` — приемаме и двете. */
const logsSchema = z.union([linesSchema, z.object({ lines: linesSchema })]);

export function parseLogLines(data: unknown): string[] | null {
  const parsed = logsSchema.safeParse(data);
  if (!parsed.success) return null;
  const lines = Array.isArray(parsed.data) ? parsed.data : parsed.data.lines;
  return lines.slice(-MAX_LOG_LINES).map(redactLine);
}

/** `status` на агента (§9): `since` е в ms, `busy` — текущият рестарт/ъпдейт или null. */
const statusSchema = z.object({
  active: z.boolean(),
  state: z.string().max(32).nullish(),
  since: z.union([z.number(), z.string().max(64)]).nullish(),
  gameVersion: z.union([z.string().max(64), z.number()]).nullish(),
  modsLoaded: z.boolean().nullish(),
  broken: z.union([z.string().max(128), z.boolean()]).nullish(),
  busy: z.enum(['start', 'stop', 'restart', 'update', 'plugin']).nullish(),
});

export interface AgentStatus {
  active: boolean;
  /** ActiveState на cs2.service (active, activating, failed…). */
  state: string | null;
  since: Date | null;
  gameVersion: string | null;
  modsLoaded: boolean | null;
  /** Версията, при която модовете са счупени (ванилов резерв), или null. */
  broken: string | null;
  busy: 'start' | 'stop' | 'restart' | 'update' | 'plugin' | null;
}

export function parseAgentStatus(data: unknown): AgentStatus | null {
  const parsed = statusSchema.safeParse(data);
  if (!parsed.success) return null;
  const { active, state, since, gameVersion, modsLoaded, broken, busy } = parsed.data;
  const sinceDate = since === null || since === undefined ? null : new Date(since);
  return {
    active,
    state: state ?? null,
    since: sinceDate && Number.isFinite(sinceDate.getTime()) ? sinceDate : null,
    gameVersion: gameVersion === null || gameVersion === undefined ? null : String(gameVersion),
    modsLoaded: modsLoaded ?? null,
    broken: broken === true ? 'yes' : broken ? String(broken) : null,
    busy: busy ?? null,
  };
}

/** `data.detail` при отказ `failed` — кратко, вече редактирано от агента; тук се реже и пак редактира. */
export function failureDetail(data: unknown): string | null {
  const parsed = z.object({ detail: z.string().min(1) }).safeParse(data);
  return parsed.success ? redactLine(parsed.data.detail).slice(0, 300) : null;
}

import type { Market } from '../compliance/types.js';

/**
 * Трите часа за разговор в първото писмо — обикновен текст с часовата зона на пазара. Без Calendly и
 * без връзки за записване (EDPB 2/2023, т. 49–51: връзка с идентификатор е проследяване).
 */
const TZ: Record<Market, string> = { BG: 'Europe/Sofia', IT: 'Europe/Rome' };
const DAY_MS = 86_400_000;
const HOUR = 10;

function parts(d: Date, tz: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d)) {
    out[p.type] = p.value;
  }
  return out;
}

/** Моментът, в който часовникът в `tz` показва ден `ymd` и час `hour`:00. */
function zoned(ymd: string, hour: number, tz: string): Date {
  let t = Date.parse(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    const shown = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    t += Date.parse(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`) - shown;
  }
  return new Date(t);
}

/** Следващите 3 работни дни в 10:00 местно време, поне ден напред. */
export function suggestSlots(now: Date, market: Market): Date[] {
  const tz = TZ[market];
  const out: Date[] = [];
  for (let k = 1; out.length < 3 && k < 15; k++) {
    const p = parts(new Date(now.getTime() + k * DAY_MS), tz);
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    const slot = zoned(`${p.year}-${p.month}-${p.day}`, HOUR, tz);
    if (slot.getTime() - now.getTime() >= DAY_MS) out.push(slot);
  }
  return out;
}

function offset(d: Date, tz: string): string {
  const name =
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 'UTC';
  const h = String(Number(m[2]));
  return `UTC${m[1]}${m[3] === '00' ? h : `${h}:${m[3]}`}`;
}

/** „понеделник, 30 ноември, 10:00 ч. българско време (UTC+2)“ · „lunedì 30 novembre, ore 10:00, ora italiana (UTC+1)“. */
export function formatSlot(d: Date, market: Market): string {
  const tz = TZ[market];
  const locale = market === 'BG' ? 'bg-BG' : 'it-IT';
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  return market === 'BG'
    ? `${day}, ${time} ч. българско време (${offset(d, tz)})`
    : `${day}, ore ${time}, ora italiana (${offset(d, tz)})`;
}

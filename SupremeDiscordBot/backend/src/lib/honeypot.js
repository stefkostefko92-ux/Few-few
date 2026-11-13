// backend/src/lib/honeypot.js
// v52 — канал-стръв за спам ботове (/bait; вътрешното име honeypot е от
// миграция v52 и не се вижда): едно определение на настройките за двата пътя
// (таблото → routes/honeypot.js, ботът → routes/bot_honeypot.js).
//
// Идеята: канал, в който хора нямат работа, а спам ботовете (компрометирани
// акаунти, които пускат една и съща измама във всеки канал) пишат навсякъде.
// Който напише там, бива изваден от сървъра. Изпълнява ботът
// (bot/src/utils/bait.js); тук са само правилата за записа.
import { z } from "zod";
import { prisma } from "./prisma.js";

export const HONEYPOT_ACTIONS = ["softban", "ban", "timeout"];

const SNOWFLAKE = /^\d{17,20}$/;
const snowflakeOrNull = z.string().regex(SNOWFLAKE).nullable().optional();

export const honeypotSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: snowflakeOrNull,
  action: z.enum(HONEYPOT_ACTIONS).optional(),
  logChannelId: snowflakeOrNull,
  dmUser: z.boolean().optional(),
}).strict();

export const DEFAULT_HONEYPOT = Object.freeze({
  enabled: false, channelId: null, action: "softban", logChannelId: null, dmUser: true,
  warningMessageId: null, caughtCount: 0, lastCaughtAt: null,
});

/** Настройките на сървъра; без ред → подразбиращите се (капанът е изключен). */
export async function getHoneypot(serverId) {
  const row = await prisma.honeypotConfig.findUnique({ where: { serverId } });
  return row || { serverId, ...DEFAULT_HONEYPOT };
}

/**
 * Записва промяната. Връща { config, previous } — ботът има нужда от стария
 * канал и съобщение, за да махне предупреждението оттам.
 *
 * Включен капан без канал е безсмислен → отказ. Смяна на канала нулира
 * предупреждението (то живее в стария канал; ботът пуска ново).
 */
export async function saveHoneypot(serverId, data) {
  const previous = await getHoneypot(serverId);
  const next = { ...previous, ...data };
  if (next.enabled && !next.channelId) return { ok: false, code: "CHANNEL_REQUIRED" };
  if (next.logChannelId && next.logChannelId === next.channelId) return { ok: false, code: "LOG_IS_TRAP" };
  const patch = { ...data };
  if (data.channelId !== undefined && data.channelId !== previous.channelId) patch.warningMessageId = null;
  const config = await prisma.honeypotConfig.upsert({
    where: { serverId },
    create: { serverId, ...patch },
    update: patch,
  });
  return { ok: true, config, previous };
}

/** Публичният вид за таблото и бота (без вътрешните полета на Prisma). */
export function publicHoneypot(c) {
  return {
    enabled: !!c.enabled,
    channelId: c.channelId || null,
    action: HONEYPOT_ACTIONS.includes(c.action) ? c.action : "softban",
    logChannelId: c.logChannelId || null,
    dmUser: c.dmUser !== false,
    warningMessageId: c.warningMessageId || null,
    caughtCount: c.caughtCount || 0,
    lastCaughtAt: c.lastCaughtAt || null,
  };
}

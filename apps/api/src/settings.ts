import { prisma } from "@aso/db";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Admin-editable app settings, persisted in the Setting key/value table and
 * cached in-process. Currently: the Discord webhook config (URL, name, enabled,
 * per-event toggles), which the admin panel manages at runtime — overriding the
 * DISCORD_* env defaults without a redeploy.
 */

export type DiscordEventKey =
  | "registration"
  | "purchase"
  | "vip"
  | "flag"
  | "adminAction"
  | "broadcast";

export interface DiscordConfig {
  webhookUrl: string;
  webhookName: string;
  enabled: boolean;
  events: Record<DiscordEventKey, boolean>;
}

/** A partial update (events may be a subset). */
export type DiscordConfigPatch = {
  webhookUrl?: string;
  webhookName?: string;
  enabled?: boolean;
  events?: Partial<Record<DiscordEventKey, boolean>>;
};

const DISCORD_KEY = "discord";
const TTL_MS = 30_000;

let cache: DiscordConfig | null = null;
let cachedAt = 0;

function discordDefaults(): DiscordConfig {
  return {
    webhookUrl: env.DISCORD_WEBHOOK_URL || "",
    webhookName: env.DISCORD_WEBHOOK_NAME || "АСО",
    enabled: Boolean(env.DISCORD_WEBHOOK_URL),
    events: { registration: true, purchase: true, vip: true, flag: true, adminAction: true, broadcast: true },
  };
}

function merge(base: DiscordConfig, over: DiscordConfigPatch): DiscordConfig {
  return {
    webhookUrl: over.webhookUrl ?? base.webhookUrl,
    webhookName: over.webhookName ?? base.webhookName,
    enabled: over.enabled ?? base.enabled,
    events: { ...base.events, ...(over.events ?? {}) },
  };
}

/** Read the Discord config (DB over env defaults), cached for TTL_MS. */
export async function getDiscordConfig(force = false): Promise<DiscordConfig> {
  if (!force && cache && Date.now() - cachedAt < TTL_MS) return cache;
  let stored: DiscordConfigPatch = {};
  try {
    const row = await prisma.setting.findUnique({ where: { key: DISCORD_KEY } });
    if (row) stored = JSON.parse(row.value) as DiscordConfigPatch;
  } catch (err) {
    logger.warn({ err }, "settings: discord config load failed; using defaults");
  }
  cache = merge(discordDefaults(), stored);
  cachedAt = Date.now();
  return cache;
}

/** Synchronous best-effort accessor for fire-and-forget paths (last cache or
 *  env defaults). Prefer getDiscordConfig() where an await is possible. */
export function discordConfigSync(): DiscordConfig {
  return cache ?? discordDefaults();
}

/** Persist a partial Discord config update and refresh the cache. */
export async function setDiscordConfig(patch: DiscordConfigPatch): Promise<DiscordConfig> {
  const next = merge(await getDiscordConfig(true), patch);
  await prisma.setting.upsert({
    where: { key: DISCORD_KEY },
    create: { key: DISCORD_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  cache = next;
  cachedAt = Date.now();
  return next;
}

/** Warm the cache at boot so the first fire-and-forget notification is correct. */
export async function primeSettings(): Promise<void> {
  await getDiscordConfig(true).catch(() => undefined);
}

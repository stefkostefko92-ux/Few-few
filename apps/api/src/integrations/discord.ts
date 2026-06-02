import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Discord webhook notifier (§14). Env-gated: with no DISCORD_WEBHOOK_URL set,
 * every call is a logged no-op so the app runs without it. Rich embeds report
 * key lifecycle events (signups, purchases, VIP, flags) and admin actions.
 * Never throws — a webhook hiccup must not fail the originating request.
 */

const COLORS = {
  green: 0x3ba55d,
  gold: 0xd9b25f,
  purple: 0x9b59b6,
  red: 0xed4245,
  blue: 0x5865f2,
  grey: 0x95a5a6,
} as const;

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
}

export const discordEnabled = (): boolean => env.discordEnabled;

/** POST one or more embeds to the configured webhook. Best-effort. */
export async function sendDiscord(embeds: DiscordEmbed[]): Promise<boolean> {
  if (!env.discordEnabled) {
    logger.info({ embeds: embeds.map((e) => e.title) }, "discord (webhook disabled)");
    return false;
  }
  try {
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: env.DISCORD_WEBHOOK_NAME,
        embeds: embeds.map((e) => ({
          title: e.title.slice(0, 256),
          description: e.description?.slice(0, 2048),
          color: e.color ?? COLORS.grey,
          fields: e.fields?.slice(0, 25),
          timestamp: new Date().toISOString(),
        })),
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "discord webhook non-2xx");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "discord webhook failed");
    return false;
  }
}

const fire = (embed: DiscordEmbed) => void sendDiscord([embed]);

// ── Event helpers (fire-and-forget) ─────────────────────────────────────────

export function notifyRegistration(u: { email: string; displayName: string }): void {
  fire({
    title: "🆕 Нова регистрация",
    color: COLORS.green,
    fields: [
      { name: "Играч", value: u.displayName, inline: true },
      { name: "Имейл", value: maskEmail(u.email), inline: true },
    ],
  });
}

export function notifyPurchase(p: {
  displayName: string;
  sku: string;
  priceCents: number;
}): void {
  fire({
    title: "💸 Покупка",
    color: COLORS.gold,
    fields: [
      { name: "Играч", value: p.displayName, inline: true },
      { name: "Продукт", value: p.sku, inline: true },
      { name: "Сума", value: `€${(p.priceCents / 100).toFixed(2)}`, inline: true },
    ],
  });
}

export function notifyVip(p: { displayName: string; tier: string }): void {
  fire({
    title: "👑 VIP абонамент",
    color: COLORS.purple,
    fields: [
      { name: "Играч", value: p.displayName, inline: true },
      { name: "Ниво", value: p.tier, inline: true },
    ],
  });
}

export function notifyFlag(f: { reason: string; score: number; game: string }): void {
  fire({
    title: "🚩 Сигнал за колюзия",
    color: COLORS.red,
    fields: [
      { name: "Игра", value: f.game, inline: true },
      { name: "Причина", value: f.reason, inline: true },
      { name: "Тежест", value: f.score.toFixed(2), inline: true },
    ],
  });
}

export function notifyAdminAction(a: {
  actor: string;
  action: string;
  target?: string;
  detail?: string;
}): void {
  fire({
    title: "🛠️ Админ действие",
    color: COLORS.blue,
    fields: [
      { name: "Админ", value: a.actor, inline: true },
      { name: "Действие", value: a.action, inline: true },
      ...(a.target ? [{ name: "Цел", value: a.target, inline: true }] : []),
      ...(a.detail ? [{ name: "Детайли", value: a.detail.slice(0, 1024) }] : []),
    ],
  });
}

export function notifyBroadcast(actor: string, message: string): void {
  fire({ title: "📣 Съобщение", color: COLORS.gold, description: message, fields: [{ name: "От", value: actor }] });
}

/** Test embed for the admin "send test" button. */
export async function sendTest(actor: string): Promise<boolean> {
  return sendDiscord([
    {
      title: "✅ Тестово съобщение",
      description: "Discord webhook-ът работи.",
      color: COLORS.green,
      fields: [{ name: "Изпратено от", value: actor }],
    },
  ]);
}

/** a***@domain.com — keep the webhook readable without leaking the full local part. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "—";
  const head = local.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, local.length - 1))}@${domain}`;
}

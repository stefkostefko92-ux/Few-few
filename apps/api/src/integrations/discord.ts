import { logger } from "../logger.js";
import { getDiscordConfig, discordConfigSync, type DiscordEventKey } from "../settings.js";

/**
 * Discord webhook notifier (§14). The webhook URL/name, an on/off switch and
 * per-event toggles are configured from the admin panel (Setting table) and
 * fall back to the DISCORD_* env vars. Rich embeds report lifecycle events and
 * admin actions. Never throws — a webhook hiccup must not fail the request.
 *
 * Privacy (GDPR): notifications carry only the player's public display name —
 * never their email or other PII (the recipient may be a non-EU processor).
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

/** Cache-based (sync) enabled check for response bodies. */
export const discordEnabled = (): boolean => {
  const c = discordConfigSync();
  return c.enabled && c.webhookUrl.length > 0;
};

/** POST embeds to the configured webhook. `eventKey` gates on its admin toggle;
 *  omit it for manual sends (test). Best-effort, never throws. */
export async function sendDiscord(embeds: DiscordEmbed[], eventKey?: DiscordEventKey): Promise<boolean> {
  const cfg = await getDiscordConfig();
  if (!cfg.enabled || !cfg.webhookUrl) {
    logger.info({ embeds: embeds.map((e) => e.title) }, "discord (webhook disabled)");
    return false;
  }
  if (eventKey && !cfg.events[eventKey]) return false; // this event is muted in admin
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: cfg.webhookName,
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

const fire = (embed: DiscordEmbed, eventKey: DiscordEventKey) => void sendDiscord([embed], eventKey);

// ── Event helpers (fire-and-forget; display name only, never email/PII) ──────

export function notifyRegistration(u: { displayName: string }): void {
  fire(
    { title: "🆕 Нова регистрация", color: COLORS.green, fields: [{ name: "Играч", value: u.displayName }] },
    "registration",
  );
}

export function notifyPurchase(p: { displayName: string; sku: string; priceCents: number }): void {
  fire(
    {
      title: "💸 Покупка",
      color: COLORS.gold,
      fields: [
        { name: "Играч", value: p.displayName, inline: true },
        { name: "Продукт", value: p.sku, inline: true },
        { name: "Сума", value: `€${(p.priceCents / 100).toFixed(2)}`, inline: true },
      ],
    },
    "purchase",
  );
}

export function notifyVip(p: { displayName: string; tier: string }): void {
  fire(
    {
      title: "👑 VIP абонамент",
      color: COLORS.purple,
      fields: [
        { name: "Играч", value: p.displayName, inline: true },
        { name: "Ниво", value: p.tier, inline: true },
      ],
    },
    "vip",
  );
}

export function notifyFlag(f: { reason: string; score: number; game: string }): void {
  fire(
    {
      title: "🚩 Сигнал за колюзия",
      color: COLORS.red,
      fields: [
        { name: "Игра", value: f.game, inline: true },
        { name: "Причина", value: f.reason, inline: true },
        { name: "Тежест", value: f.score.toFixed(2), inline: true },
      ],
    },
    "flag",
  );
}

export function notifyAdminAction(a: {
  actor: string;
  action: string;
  target?: string;
  detail?: string;
}): void {
  fire(
    {
      title: "🛠️ Админ действие",
      color: COLORS.blue,
      fields: [
        { name: "Админ", value: a.actor, inline: true },
        { name: "Действие", value: a.action, inline: true },
        ...(a.target ? [{ name: "Цел", value: a.target, inline: true }] : []),
        ...(a.detail ? [{ name: "Детайли", value: a.detail.slice(0, 1024) }] : []),
      ],
    },
    "adminAction",
  );
}

export function notifyBroadcast(actor: string, message: string): void {
  fire(
    { title: "📣 Съобщение", color: COLORS.gold, description: message, fields: [{ name: "От", value: actor }] },
    "broadcast",
  );
}

/** Test embed for the admin "send test" button (bypasses event toggles). */
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

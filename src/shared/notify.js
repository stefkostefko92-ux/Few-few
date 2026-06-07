/**
 * External notification builders (shared ES module, unit-tested).
 *
 * Pure functions that turn a (title, message) into a fetch request descriptor
 * for Telegram or Discord. The service worker performs the actual fetch so this
 * stays side-effect-free and testable.
 */

export function telegramRequest(cfg, title, message) {
  if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.chatId) return null;
  // Plain text (no parse_mode) — avoids 400s from Markdown edge cases.
  const text = (title ? title + '\n' : '') + (message || '');
  return {
    url: `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text })
    }
  };
}

export function discordRequest(cfg, title, message) {
  if (!cfg || !cfg.enabled || !cfg.webhookUrl) return null;
  // Restricted to discord.com to match the extension's host_permissions.
  if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(cfg.webhookUrl)) return null;
  const content = (title ? `**${title}**\n` : '') + (message || '');
  return {
    url: cfg.webhookUrl,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 1900), username: 'Tanoth Bot' })
    }
  };
}

export function buildExternalNotifications(notifications, title, message) {
  const reqs = [];
  const tg = telegramRequest(notifications?.telegram, title, message);
  if (tg) reqs.push(tg);
  const dc = discordRequest(notifications?.discord, title, message);
  if (dc) reqs.push(dc);
  return reqs;
}

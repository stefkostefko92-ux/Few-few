/**
 * External notification builders (shared ES module, unit-tested).
 *
 * Pure functions that turn a (title, message) into a fetch request descriptor
 * for Telegram or Discord. The service worker performs the actual fetch so this
 * stays side-effect-free and testable.
 */

export function telegramRequest(cfg, title, message) {
  if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.chatId) return null;
  const text = (title ? `*${escapeMd(title)}*\n` : '') + escapeMd(message || '');
  return {
    url: `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'Markdown' })
    }
  };
}

export function discordRequest(cfg, title, message) {
  if (!cfg || !cfg.enabled || !cfg.webhookUrl) return null;
  if (!/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(cfg.webhookUrl)) return null;
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

function escapeMd(s) {
  return String(s).replace(/([_*`\[\]])/g, '\\$1');
}

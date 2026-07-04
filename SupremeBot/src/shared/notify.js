/**
 * External notification builders (shared ES module, unit-tested).
 *
 * Pure functions that turn a (title, message, level, fields) event into a fetch
 * request descriptor for Telegram or Discord. The service worker performs the
 * actual fetch, so this stays side-effect-free and testable.
 *
 * Discord uses rich embeds with every webhook feature: custom bot username +
 * avatar, level-based colour, structured fields, thumbnail, footer, ISO
 * timestamp, thread/forum posting (thread_id) and controlled mentions
 * (roles / users / @here / @everyone via allowed_mentions, so nothing pings
 * unless the user configures it).
 */

// Embed accent colour per event level (Discord wants a decimal int).
const LEVEL_COLORS = {
  success: 0x2ecc71,
  error: 0xe74c3c,
  warn: 0xe67e22,
  info: 0x3498db
};

const clamp = (s, n) => String(s == null ? '' : s).slice(0, n);

export function telegramRequest(cfg, title, message, level, fields) {
  if (!cfg || !cfg.enabled || !cfg.botToken || !cfg.chatId) return null;
  // Plain text (no parse_mode) - avoids 400s from Markdown edge cases.
  let text = (title ? title + '\n' : '') + (message || '');
  if (Array.isArray(fields) && fields.length) {
    text += '\n' + fields.map((f) => `${f.name}: ${f.value}`).join('\n');
  }
  return {
    url: `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text: clamp(text, 4096), disable_web_page_preview: true })
    }
  };
}

// Build a Discord allowed_mentions object from a mention string so the webhook
// only pings exactly what the user asked for (nothing by default).
function mentionAllow(m) {
  const allow = { parse: [], roles: [], users: [] };
  if (/@everyone|@here/.test(m)) allow.parse.push('everyone');
  const roles = [...m.matchAll(/<@&(\d+)>/g)].map((x) => x[1]);
  const users = [...m.matchAll(/<@!?(\d+)>/g)].map((x) => x[1]);
  if (roles.length) allow.roles = [...new Set(roles)];
  if (users.length) allow.users = [...new Set(users)];
  return allow;
}

function req(url, payload) {
  return {
    url,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  };
}

export function discordRequest(cfg, title, message, level, fields) {
  if (!cfg || !cfg.enabled || !cfg.webhookUrl) return null;
  // Restricted to a real discord.com webhook URL (matches host_permissions).
  if (!/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+/.test(cfg.webhookUrl)) return null;

  // Post into a specific thread / forum-channel thread when configured.
  let url = cfg.webhookUrl;
  const threadId = String(cfg.threadId || '').trim();
  if (/^\d+$/.test(threadId)) url += (url.includes('?') ? '&' : '?') + 'thread_id=' + threadId;

  const payload = { username: clamp(cfg.username || 'Tanoth Bot', 80) };
  if (cfg.avatarUrl && /^https:\/\//.test(cfg.avatarUrl)) payload.avatar_url = cfg.avatarUrl;

  // Mentions: suppress all pings by default; only allow what the user set.
  const mention = String(cfg.mention || '').trim();
  if (mention) {
    payload.content = clamp(mention, 2000);
    payload.allowed_mentions = mentionAllow(mention);
  } else {
    payload.allowed_mentions = { parse: [] };
  }

  // Plain-text fallback when embeds are switched off.
  if (cfg.useEmbeds === false) {
    const text = (title ? `**${title}**\n` : '') + (message || '');
    payload.content = clamp((payload.content ? payload.content + '\n' : '') + text, 2000);
    return req(url, payload);
  }

  const embed = {
    title: clamp(title || 'Tanoth Bot', 256),
    color: LEVEL_COLORS[level] != null ? LEVEL_COLORS[level] : LEVEL_COLORS.info,
    timestamp: new Date().toISOString(),
    author: { name: clamp(cfg.username || 'Tanoth Master Bot', 256) },
    footer: { text: clamp(cfg.footer || 'Tanoth Master Bot', 2048) }
  };
  const desc = clamp(message || '', 4096);
  if (desc) embed.description = desc;
  if (cfg.avatarUrl && /^https:\/\//.test(cfg.avatarUrl)) embed.thumbnail = { url: cfg.avatarUrl };
  if (Array.isArray(fields) && fields.length) {
    embed.fields = fields.slice(0, 25).map((f) => ({
      name: clamp(f.name, 256),
      value: clamp(f.value, 1024),
      inline: f.inline !== false
    }));
  }
  payload.embeds = [embed];
  return req(url, payload);
}

export function buildExternalNotifications(notifications, title, message, level, fields) {
  const reqs = [];
  const tg = telegramRequest(notifications?.telegram, title, message, level, fields);
  if (tg) reqs.push(tg);
  const dc = discordRequest(notifications?.discord, title, message, level, fields);
  if (dc) reqs.push(dc);
  return reqs;
}

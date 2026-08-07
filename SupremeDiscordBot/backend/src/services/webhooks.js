// backend/src/services/webhooks.js
// Deliver events to configured webhooks. Non-blocking: fires in background,
// logs failures to DB, tracks failCount.

import axios from "axios";
import crypto from "crypto";
import https from "https";
import { lookup as dnsLookup } from "dns/promises";
import { lookup as dnsLookupCb } from "dns";
import { isIP } from "net";
import { prisma } from "../lib/prisma.js";

const VALID_EVENTS = [
  "TICKET_OPEN", "TICKET_CLOSE", "TICKET_REOPEN", "TICKET_DELETE",
  "APPLICATION_SUBMITTED", "APPLICATION_APPROVED", "APPLICATION_DENIED",
  "GIVEAWAY_ENDED", "POLL_CLOSED",
  "VERIFICATION_SUCCESS", "VERIFICATION_FAILURE",
];

export { VALID_EVENTS };

// ─── SSRF protection ──────────────────────────────────────────────────────────
// Webhook URLs are user-supplied and delivery originates inside the Docker
// network, so internal/loopback/link-local/metadata targets must be rejected.

function ipIsPrivate(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||      // CGNAT
      (a === 169 && b === 254) ||                // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd") ||
    v6.startsWith("::ffff:")                     // v4-mapped — re-check would be needed; reject outright
  );
}

/**
 * Validate a user-supplied webhook URL. Returns an error string, or null if OK.
 * Used at create/update time (routes) and again at delivery time (DNS can change).
 */
export async function validateWebhookUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "Invalid URL";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use https://";
  if (url.username || url.password) return "Credentials in webhook URLs are not allowed";
  const host = url.hostname;
  if (isIP(host) && ipIsPrivate(host)) return "Webhook URLs must not target private or internal addresses";
  if (!isIP(host)) {
    try {
      const addrs = await dnsLookup(host, { all: true });
      if (addrs.some(({ address }) => ipIsPrivate(address))) {
        return "Webhook URLs must not resolve to private or internal addresses";
      }
    } catch {
      return "Webhook hostname could not be resolved";
    }
  }
  return null;
}

// SSRF-safe HTTPS agent. validateWebhookUrl() проверява DNS, но axios прави
// втори, независим resolve при свързване — между двата атакуващ с контрол над
// DNS може да върне публичен IP на проверката и частен на заявката (DNS
// rebinding / TOCTOU). Този custom lookup проверява РЕАЛНО свързвания IP в
// момента на connect, затваряйки прозореца. TLS SNI/cert валидацията си остава
// по hostname.
function ssrfSafeLookup(hostname, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : options;
  dnsLookupCb(hostname, opts, (err, address, family) => {
    if (err) return cb(err);
    if (ipIsPrivate(address)) {
      return cb(new Error("SSRF blocked: hostname resolved to a private address"));
    }
    cb(null, address, family);
  });
}
const ssrfSafeAgent = new https.Agent({ lookup: ssrfSafeLookup });

/**
 * Fire a webhook event to all enabled, subscribed webhooks for a server.
 * Non-blocking — returns immediately, delivery happens in background.
 */
export async function fireWebhooks(serverId, event, payload) {
  if (!VALID_EVENTS.includes(event)) return;
  try {
    const hooks = await prisma.webhook.findMany({
      where: { serverId, enabled: true, events: { has: event } },
    });
    if (!hooks.length) return;

    const body = {
      event,
      serverId,
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const bodyStr = JSON.stringify(body);

    // Fire in parallel, don't await — write results back to DB as they finish
    for (const hook of hooks) {
      deliverWebhook(hook, bodyStr).catch(() => {});
    }
  } catch (err) {
    console.error("[webhooks] fire failed:", err.message);
  }
}

async function deliverWebhook(hook, bodyStr) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "SupremeBot-Webhooks/1.0",
    "X-SupremeBot-Event": "true",
  };
  if (hook.secret) {
    const sig = crypto.createHmac("sha256", hook.secret).update(bodyStr).digest("hex");
    headers["X-SupremeBot-Signature"] = `sha256=${sig}`;
  }

  try {
    // Re-validate at delivery time — DNS may have been re-pointed at an
    // internal target since the webhook was created (DNS rebinding).
    const urlError = await validateWebhookUrl(hook.url);
    if (urlError) throw new Error(`blocked: ${urlError}`);

    const res = await axios.post(hook.url, bodyStr, {
      headers,
      timeout: 10000,
      maxRedirects: 0, // redirects could bounce the request to internal targets
      httpsAgent: ssrfSafeAgent, // re-checks the resolved IP at connect time (anti-rebinding)
      // Отговорът е ЧУЖД и НЕ ни трябва — ползваме само статуса. Без таван
      // враждебен (или просто счупен) приемник може да върне гигабайти и да
      // напълни паметта ни; таймаутът не помага, докато байтовете си текат.
      // 64 KiB стигат за всяко смислено потвърждение.
      maxContentLength: 64 * 1024,
      maxBodyLength: 1024 * 1024,
      // Не парсваме чуждото тяло — суров текст, който после изхвърляме.
      responseType: "text",
      // Всеки HTTP статус е „доставено“ за нашата сметка; 4xx/5xx се четат
      // по-долу. Без това axios хвърля и губим реалния статус в лога.
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const err = new Error(`webhook отговори ${res.status}`);
      err.response = { status: res.status };
      throw err;
    }
    await prisma.webhook.update({
      where: { id: hook.id },
      data: {
        lastDeliveryAt: new Date(),
        lastStatus: res.status,
        failCount: 0,
      },
    });
  } catch (err) {
    const status = err?.response?.status || 0;
    await prisma.webhook.update({
      where: { id: hook.id },
      data: {
        lastDeliveryAt: new Date(),
        lastStatus: status,
        failCount: { increment: 1 },
      },
    }).catch(() => {});

    // Auto-disable after 10 consecutive failures
    const refreshed = await prisma.webhook.findUnique({ where: { id: hook.id }, select: { failCount: true } }).catch(() => null);
    if (refreshed?.failCount >= 10) {
      await prisma.webhook.update({ where: { id: hook.id }, data: { enabled: false } }).catch(() => {});
    }
  }
}

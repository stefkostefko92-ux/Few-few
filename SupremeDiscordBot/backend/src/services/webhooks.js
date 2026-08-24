// backend/src/services/webhooks.js
// Deliver events to configured webhooks. Non-blocking: fires in background,
// logs failures to DB, tracks failCount.

import axios from "axios";
import crypto from "crypto";
import https from "https";
import { lookup as dnsLookup } from "dns/promises";
import { lookup as dnsLookupCb } from "dns";
import { isIP, BlockList } from "net";
import { prisma } from "../lib/prisma.js";
import { getServerTier, planHasFeature } from "../lib/premium.js";

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

// Списъците се сравняват ДВОИЧНО (`net.BlockList`), не по низ.
//
// ДЕФЕКТЪТ (одит сигурност, 12.08.2026): проверката беше низова —
// `v6 === "::1"`, `v6.startsWith("::ffff:")`. Един и същ адрес обаче има много
// правописа и `net.isIP` приема всичките. Измерено на живо:
//     ::1                       → разпознат
//     0:0:0:0:0:0:0:1           → *** НЕ *** (същият адрес)
//     0:0:0:0:0:ffff:7f00:1     → *** НЕ *** (същото като ::ffff:127.0.0.1)
//
// И ВТОРИЯТ слой не спасяваше: `ssrfSafeLookup` виси на `dns.lookup`, а Node
// НЕ вика lookup за литерален IP — свързва директно. Проверено на живо:
// заявка към `https://[0:0:0:0:0:0:0:1]/` изобщо не мина през гарда. Тоест
// webhook с разгънат IPv6 loopback стигаше до самия контейнер.
//
// `BlockList` смята адреса, не текста, значи новите правописа не отварят
// дупка. Добавени са и три диапазона, които липсваха и водят навътре:
// NAT64 (64:ff9b::/96 обвива IPv4 → `64:ff9b::7f00:1` Е 127.0.0.1),
// 6to4/Teredo и IPv4 multicast/broadcast.
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["127.0.0.0", 8],
  ["100.64.0.0", 10],                              // CGNAT
  ["169.254.0.0", 16],                             // link-local + облачни метаданни
  ["172.16.0.0", 12], ["192.168.0.0", 16],
  ["192.0.0.0", 24],                               // IETF protocol assignments
  ["198.18.0.0", 15],                              // бенчмарк
  ["224.0.0.0", 4],                                // multicast
  ["240.0.0.0", 4],                                // резервирани + 255.255.255.255
];
const V6_BLOCKED = [
  ["::", 128], ["::1", 128],
  ["fc00::", 7],                                   // ULA
  ["fe80::", 10],                                  // link-local
  // БЕЗ `::ffff:0:0/96` тук. Node сверява IPv4 адрес и срещу IPv4-mapped
  // правила, значи този запис блокира ВСЕКИ публичен IPv4 (проверено: 1.1.1.1
  // и 8.8.8.8 падаха). Вложеният IPv4 се проверява отделно, по-долу, срещу
  // IPv4 списъка — там `::ffff:127.0.0.1` пада, а `::ffff:1.1.1.1` минава.
  ["::", 96],                                      // IPv4-compatible (наследен)
  ["64:ff9b::", 96],                               // NAT64 — обвива ЦЯЛОТО IPv4
  ["2002::", 16],                                  // 6to4
  ["2001::", 32],                                  // Teredo
];

const blocklist = new BlockList();
for (const [addr, prefix] of V4_BLOCKED) blocklist.addSubnet(addr, prefix, "ipv4");
for (const [addr, prefix] of V6_BLOCKED) blocklist.addSubnet(addr, prefix, "ipv6");

function ipIsPrivate(ip) {
  const family = isIP(ip);
  if (!family) return true;            // не е адрес → не пускаме (fail closed)
  try {
    if (blocklist.check(ip, family === 4 ? "ipv4" : "ipv6")) return true;
    // IPv4-mapped/compatible вече е блокиран горе, но ако някога отпадне,
    // вложеният IPv4 трябва да мине и през IPv4 правилата, а не да се промъкне.
    const mapped = /^(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocklist.check(mapped[1], "ipv4");
    return false;
  } catch {
    return true;                       // непознат формат → fail closed
  }
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
  // `url.hostname` пази СКОБИТЕ при IPv6 (`"[::1]"`), а `isIP` не ги приема.
  //
  // ДОСЕГА (одит сигурност, 12.08.2026): затова всеки IPv6 литерал падаше в
  // DNS клона, `dnsLookup("[::1]")` се проваляше и отговорът беше „hostname
  // could not be resolved". Затворено — но затворено СЛУЧАЙНО и с лъжлива
  // причина: вътрешният адрес се отказваше уж защото не се резолвира, а
  // ПУБЛИЧЕН IPv6 webhook беше невъзможен да се запази изобщо. Махането на
  // скобите праща и двата случая при истинската проверка.
  const host = url.hostname.replace(/^\[|\]$/g, "");
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
  // Форсираме all:false: при all:true `address` е МАСИВ и ipIsPrivate(масив)
  // не хваща частния адрес (пада в IPv6 клона върху "[object Object]") →
  // байпас. Днешните Node defaults връщат единичен адрес, но нормализацията
  // прави гарда устойчив, ако бъдещ axios/agent поиска всички адреси.
  const opts = { ...(typeof options === "function" ? {} : options), all: false };
  dnsLookupCb(hostname, opts, (err, address, family) => {
    if (err) return cb(err);
    if (ipIsPrivate(address)) {
      return cb(new Error("SSRF blocked: hostname resolved to a private address"));
    }
    cb(null, address, family);
  });
}
// Изнесен: същият гард пази и свалянето на аватара за white-label бота
// (потребителски URL, свален от НАШИЯ сървър — точно SSRF повърхността).
export const ssrfSafeAgent = new https.Agent({ lookup: ssrfSafeLookup });

/**
 * Fire a webhook event to all enabled, subscribed webhooks for a server.
 * Non-blocking — returns immediately, delivery happens in background.
 */
export async function fireWebhooks(serverId, event, payload) {
  if (!VALID_EVENTS.includes(event)) return;
  try {
    // Webhook интеграциите са premium (BASE_LIMITS.webhooks = 0). Гейтваме на
    // ИЗПЪЛНЕНИЕ, не само при създаване: сървър, паднал на free (seat detach,
    // отмяна, дунинг), пазеше конфигурираните webhook-и в базата и продължаваше
    // да пуска POST-ове към чужд endpoint — и приход, и данни за тикети навън.
    // (Одит 07.08.2026)
    const tier = await getServerTier(serverId);
    if (!planHasFeature(tier.plan, "integrations.webhooks")) return;

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

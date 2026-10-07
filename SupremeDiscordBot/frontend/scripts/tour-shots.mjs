#!/usr/bin/env node
// frontend/scripts/tour-shots.mjs
// Снимките в „The dashboard, for real“ на лендинга (public/screens/*.webp) —
// направени от ТЕКУЩОТО табло, с демо данни. Визуалният одит от 07.10.2026
// намери, че лендингът показва стария дизайн (v2.3, синьо), а таблото вече е
// друго. След промяна по дизайна: `npm run build && node scripts/tour-shots.mjs`.
//
// Сървърът е нашият dist/ (като nginx try_files), API-то е мок с демо сървъра
// „Nebula Esports“ — без истински потребители и без мрежа навън. WebP се
// кодира от самия Chromium (canvas.toDataURL), без външни инструменти.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "dist");
const OUT = join(HERE, "..", "public", "screens");
if (!existsSync(join(DIST, "index.html"))) { console.error("✗ няма dist/ — пусни `npm run build`"); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright-core")); } catch { console.error("✗ няма playwright-core"); process.exit(2); }

const SID = "900000000000000001";
const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
const users = ["NovaAdmin", "kai.dev", "luna_mod", "orbit", "pixelwolf", "sable", "venus", "draco"];
const roles = [
  { id: "700000000000000001", name: "Owner", color: 16766720, position: 9, managed: false, assignable: false },
  { id: "700000000000000002", name: "Support", color: 9430528, position: 7, managed: false, assignable: true },
  { id: "700000000000000003", name: "Moderator", color: 3447003, position: 6, managed: false, assignable: true },
  { id: "700000000000000004", name: "Member", color: 10070709, position: 2, managed: false, assignable: true },
];
const STATUSES = ["OPEN", "CLAIMED", "OPEN", "CLOSED", "CLAIMED", "CLOSED", "OPEN", "CLOSED", "CLOSED", "CLAIMED"];
const PRIOS = ["HIGH", "NORMAL", "URGENT", "NORMAL", "LOW", "NORMAL", "NORMAL", "HIGH", "NORMAL", "NORMAL"];
const PANELS = ["Support", "Bug reports", "Partnerships", "Support", "Billing", "Support", "Bug reports", "Support", "Billing", "Support"];
const Q = (labels) => labels.map((label, i) => ({ id: `q${i}`, label, type: i === 1 ? "PARAGRAPH" : i === 2 ? "SELECT" : "SHORT_TEXT", required: true, order: i }));
const tickets = STATUSES.map((status, i) => ({
  id: `ckt${i}`, number: 1042 - i, status, priority: PRIOS[i], channelId: status === "CLOSED" ? null : `80000000000000000${i}`,
  creator: { id: `33333333333333333${i}`, username: users[(i + 3) % users.length], avatar: null },
  assignee: status === "OPEN" ? null : { id: "u2", username: users[1 + (i % 2)] },
  panel: { name: PANELS[i] }, createdAt: day(i * 0.7), closedAt: status === "CLOSED" ? day(i * 0.5) : null,
  feedbackRating: status === "CLOSED" ? 5 - (i % 2) : null, feedbackComment: null,
  hasArchive: status === "CLOSED", archiveUrl: status === "CLOSED" ? "#" : null,
}));

const FIX = {
  "GET /api/auth/me": { id: "u1", username: "NovaAdmin", globalRole: "USER", role: "USER", language: "en", mfa: { enabled: false, required: false, enrollmentRequired: false, verifiedInSession: false } },
  "GET /api/servers": [{ id: SID, name: "Nebula Esports", icon: null, botAdded: true, isPremium: true }],
  [`GET /api/servers/${SID}`]: {
    id: SID, name: "Nebula Esports", icon: null, plan: "premium", isPremium: true, hasWhiteLabel: false,
    welcomerEnabled: true, welcomerChannelId: "500000000000000001", welcomerMessage: "Welcome {user}!", welcomerEmbedColor: "#8fe600",
    autoroleIds: [], autoroleBotIds: [], language: "en", aiRepliesEnabled: true, roundRobinEnabled: true,
    _count: { tickets: 1042, panels: 4, forms: 3 },
  },
  [`GET /api/servers/${SID}/stats`]: { ticketCount: 1042, openTickets: 6, applications: 38, closedThisWeek: 71 },
  [`GET /api/servers/${SID}/directory`]: { ok: true, categories: [{ id: "331", name: "TICKETS", position: 0, canCreate: true }], text: [{ id: "500000000000000001", name: "welcome", position: 0, parentId: null, canSend: true }, { id: "500000000000000002", name: "support", position: 1, parentId: null, canSend: true }], roles },
  [`GET /api/analytics/${SID}/dashboard`]: {
    kpis: { ticketsOpened: { value: 184, deltaPct: 12 }, ticketsClosed: { value: 171, deltaPct: 9 }, avgFirstResponseMin: 4, applications: { value: 23, deltaPct: 15 } },
    days: 14, live: { pendingApplications: 3, openTickets: 6, claimedTickets: 4 },
    series: Array.from({ length: 14 }, (_, i) => ({ day: day(13 - i).slice(0, 10), opened: 9 + ((i * 7) % 8), closed: 8 + ((i * 5) % 7) })),
    distribution: [{ label: "Support", value: 112 }, { label: "Bug reports", value: 41 }, { label: "Billing", value: 19 }, { label: "Partnerships", value: 12 }],
    recentTickets: tickets.slice(0, 5), satisfaction: { avg: 4.8, count: 96 },
  },
  [`GET /api/analytics/${SID}/overview`]: {
    tickets: { total: 1042, open: 6, closed: 1036 }, applications: { total: 212, approved: 141, denied: 52, approvalRate: 67 },
    sparkline: Array.from({ length: 30 }, (_, i) => ({ date: day(29 - i), ticketsOpened: 8 + ((i * 7) % 9), ticketsClosed: 7 + ((i * 5) % 9), formsSubmitted: (i * 3) % 4 })),
  },
  [`GET /api/analytics/${SID}/heatmap`]: { grid: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => Math.max(0, Math.round(9 * Math.sin(((h - 6) / 24) * Math.PI) + (d === 5 || d === 6 ? 3 : 0) + ((d * h) % 3))))), total: 980, days: 90 },
  [`GET /api/analytics/${SID}/leaderboard`]: { period: "30d", leaderboard: [{ userId: "u2", username: "kai.dev", claimed: 64, closed: 61 }, { userId: "u3", username: "luna_mod", claimed: 51, closed: 49 }, { userId: "u4", username: "orbit", claimed: 33, closed: 30 }] },
  [`GET /api/analytics/${SID}/funnel`]: { period: "90d", stages: [{ label: "Submitted", count: 212, pct: 100 }, { label: "Reviewed", count: 193, pct: 91 }, { label: "Approved", count: 141, pct: 67 }, { label: "Denied", count: 52, pct: 25 }], pending: 19 },
  [`GET /api/tickets/${SID}`]: { tickets, total: 1042 },
  [`GET /api/panels/${SID}`]: [
    { id: "p1", name: "Support", title: "🎫 Need help? Open a ticket", description: "Our team usually answers within minutes.", color: "#8fe600", buttons: [{ label: "Support", emoji: "🎫", style: "SUCCESS" }, { label: "Bug report", emoji: "🐞", style: "SECONDARY" }], supportRoleIds: [roles[1].id], published: true, channelId: "500000000000000002", _count: { tickets: 812 } },
    { id: "p2", name: "Billing", title: "💳 Billing questions", description: "Payments, refunds and invoices.", color: "#fbbf24", buttons: [{ label: "Billing", emoji: "💳", style: "PRIMARY" }], supportRoleIds: [roles[1].id], published: true, channelId: "500000000000000002", _count: { tickets: 141 } },
    { id: "p3", name: "Partnerships", title: "🤝 Partner with Nebula", description: "Tell us about your community.", color: "#2588c5", buttons: [{ label: "Apply", emoji: "🤝", style: "PRIMARY" }], supportRoleIds: [roles[2].id], published: false, _count: { tickets: 89 } },
  ],
  [`GET /api/forms/${SID}`]: [
    { id: "f1", name: "Staff Application", isApplication: true, published: true, questions: Q(["How old are you?", "Why do you want to join the staff team?", "Which timezone are you in?", "How many hours a week can you help?", "Have you moderated a server before?", "How would you handle a heated argument?", "Link a past project", "Anything else we should know?"]), acceptRoleIds: [roles[1].id], denyRoleIds: [], removeRoleIds: [], managerRoleIds: [roles[0].id], pingRoleIds: [], _count: { applications: 128 } },
    { id: "f2", name: "Tournament Sign-up", isApplication: true, published: true, questions: Q(["Team name", "Captain's Discord tag", "Game", "Rank", "Substitute player"]), acceptRoleIds: [roles[3].id], denyRoleIds: [], removeRoleIds: [], managerRoleIds: [], pingRoleIds: [], _count: { applications: 61 } },
    { id: "f3", name: "Content Creator Program", isApplication: true, published: false, questions: Q(["Channel link", "What do you create?", "Audience size", "Upload schedule", "Why Nebula?", "Anything else?"]), acceptRoleIds: [], denyRoleIds: [], removeRoleIds: [], managerRoleIds: [], pingRoleIds: [], _count: { applications: 23 } },
  ],
  "GET /api/billing/config": { provider: "discord", discord: { enabled: true, configured: true, applicationId: "app", storeUrl: "#", plans: { premium: { label: "Premium", monthlyEur: "4.99", skuId: "s1", url: "#" }, whitelabel: { label: "White-label", monthlyEur: "9.99", skuId: "s2", url: "#" } } }, stripe: { purchasesEnabled: false, legacyManagement: false } },
  [`GET /api/billing/${SID}`]: { provider: "discord", isPremium: true, plan: "premium", source: "discord", discord: { status: "active", statusLabel: "active", currentPeriodEnd: day(-18) }, stripe: { legacy: false, portalAvailable: false } },
  "GET /api/status": { status: "operational", timestamp: new Date().toISOString(), services: { api: { status: "operational", uptime: 360000 }, database: { status: "operational", latencyMs: 2 }, bot: { status: "operational", latencyMs: 9 }, cache: { status: "operational", latencyMs: 1 } } },
};
function fixtureFor(method, path) {
  if (FIX[`${method} ${path}`]) return FIX[`${method} ${path}`];
  for (const [k, v] of Object.entries(FIX)) { const [m, p] = k.split(" "); if (m === method && path.startsWith(p + "/")) return v; }
  return method === "GET" ? [] : { ok: true };
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json" };
const srv = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  let f = join(DIST, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!existsSync(f)) f = join(DIST, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;

const SHOTS = [
  ["home", `/dashboard/${SID}`],
  ["tickets", `/dashboard/${SID}/tickets`],
  ["panels", `/dashboard/${SID}/panels`],
  ["forms", `/dashboard/${SID}/forms`],
  ["analytics", `/dashboard/${SID}/analytics`],
  ["premium", `/dashboard/${SID}/premium`],
];

const exe = [process.env.CHROMIUM_BIN, "/opt/pw-browsers/chromium"].find((x) => x && existsSync(x));
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(exe ? { executablePath: exe } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
await ctx.addInitScript(() => { try { localStorage.setItem("supreme-bot-cookie-consent", JSON.stringify({ version: 1, timestamp: new Date().toISOString(), analytics: false, marketing: false })); } catch {} });
await ctx.route((url) => !/^(127\.0\.0\.1|localhost)$/.test(url.hostname), (r) => r.abort());
await ctx.route("**/api/**", (r) => { const u = new URL(r.request().url()); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtureFor(r.request().method(), u.pathname)) }); });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
let failed = 0;
for (const [key, path] of SHOTS) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const crashed = await page.evaluate(() => /Something went wrong/i.test(document.body.innerText));
  if (crashed) { console.error(`✗ ${key}: екранът на ErrorBoundary`); failed++; continue; }
  const png = await page.screenshot({ type: "png" });
  const webp = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.82).split(",")[1];
  }, png.toString("base64"));
  const buf = Buffer.from(webp, "base64");
  if (buf.subarray(8, 12).toString() !== "WEBP") { console.error(`✗ ${key}: Chromium не върна WebP`); failed++; continue; }
  writeFileSync(join(OUT, `${key}.webp`), buf);
  console.log(`✓ ${key}.webp  ${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close(); srv.close();
if (errors.length) { console.error("✗ JS грешки:", errors); failed++; }
process.exit(failed ? 1 : 0);

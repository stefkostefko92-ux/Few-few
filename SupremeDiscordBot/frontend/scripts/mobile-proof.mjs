#!/usr/bin/env node
// frontend/scripts/mobile-proof.mjs — доказва мобилното с ИСТИНСКИ Chromium.
//
// ЗАЩО СЪЩЕСТВУВА (08.08.2026): мобилните правила бяха гейтнати само статично
// (mobileLayout.test.js чете изходния код). Статичният гейт пази шестте
// ИЗВЕСТНИ класа дефекти, но не вижда НОВ клас — а „не сме оптимизирани за
// телефон" беше открито от собственика на реален екран, не от гейт. Този
// инструмент затваря дупката: сервира билднатия dist (SPA fallback като nginx),
// мокира /api с фикстури и отваря страниците на 390×844 (iPhone 14) и на
// 1280×800 (регресия на десктопа от същите промени).
//
// Проверява две неща, които само браузър вижда:
//   1. ХОРИЗОНТАЛЕН ПРЕЛИВ: scrollWidth > clientWidth на <html> значи страница,
//      която мърда настрани под пръста — първокласен дефект, не козметика.
//   2. ПОРТАЛЪТ НА РОЛИТЕ: отваря се списъкът и се мери реалният му
//      правоъгълник — трябва да е ИЗЦЯЛО във viewport-а (точно това се чупеше:
//      списъкът се режеше от overflow контейнера на модала).
//
// Пуска се РЪЧНО или от квалити процедурата: node scripts/mobile-proof.mjs
// Изисква Chromium (PLAYWRIGHT_BROWSERS_PATH или /opt/pw-browsers/chromium).
// БЕЗ браузър умира с код 2 = „неизмерено" — никога не се преструва на зелен.
// Снимките отиват в scripts/mobile-proof-shots/ (в .gitignore).
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const SHOTS = join(ROOT, "scripts", "mobile-proof-shots");

// ─── Chromium ────────────────────────────────────────────────────────────────
async function launch() {
  let chromium;
  try { ({ chromium } = await import("playwright-core")); }
  catch { console.error("✗ няма playwright-core (npm i -D playwright-core)"); process.exit(2); }
  const candidates = [
    process.env.CHROMIUM_BIN,
    "/opt/pw-browsers/chromium",
  ].filter(Boolean);
  for (const exe of candidates) {
    if (!existsSync(exe)) continue;
    try {
      return await chromium.launch({ headless: true, executablePath: exe, args: ["--no-sandbox"] });
    } catch (e) { console.error(`  (${exe}: ${e.message.split("\n")[0]})`); }
  }
  // последен опит: нека playwright сам намери браузър (PLAYWRIGHT_BROWSERS_PATH)
  try { return await chromium.launch({ headless: true, args: ["--no-sandbox"] }); }
  catch (e) {
    console.error("✗ Chromium не тръгва — НЕИЗМЕРЕНО (не зелено):", e.message.split("\n")[0]);
    process.exit(2);
  }
}

// ─── Статичен сървър с SPA fallback (като nginx try_files) ──────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/json", ".txt": "text/plain", ".xml": "application/xml" };
function serveDist() {
  const srv = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = join(DIST, p);
    // пре-рендернатите маршрути са dist/<път>/index.html
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(DIST, "index.html"); // SPA fallback
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

// ─── Фикстури: достатъчно истина, за да рендерира РЕАЛНОТО оформление ───────
const SID = "111111111111111111";
const roles = Array.from({ length: 28 }, (_, i) => ({
  id: String(700000000000000000n + BigInt(i)),
  name: ["Admin","Moderator","Support","Helper","VIP","Member","Verified","Booster","Events","Giveaways",
    "Level 10","Level 20","Level 30","Artist","Streamer","Dev","QA","Design","Music","Movies",
    "Games","News","Polls","Announcements","Guest","Trial Staff","Retired","Bot Zone"][i],
  color: ["#e74c3c","#3498db","#2ecc71","#f1c40f",null][i % 5],
  position: 28 - i,
  assignable: i % 7 !== 3,
  reason: i % 7 === 3 ? "above_bot" : null,
}));
const FIX = {
  "GET /api/auth/me": { id: "u1", username: "stefan", role: "MAIN_OWNER", language: "en" },
  [`GET /api/servers/${SID}`]: {
    id: SID, name: "T19C", icon: null, plan: "agency10", isPremium: true, hasWhiteLabel: true,
    agencyCovered: true, agencySeatsUsed: 2, agencySeatLimit: 10,
    welcomerEnabled: true, welcomerChannelId: "222222222222222222", welcomerMessage: "Здравей {user}!",
    welcomerEmbedColor: "#8fe600", welcomerDmEnabled: false, welcomerDmMessage: "",
    autoroleIds: [roles[5].id], autoroleBotIds: [], language: "en",
    aiRepliesEnabled: false, roundRobinEnabled: false,
    _count: { tickets: 42, panels: 3, forms: 2 },
  },
  "GET /api/servers": [{ id: SID, name: "T19C", icon: null, botAdded: true, isPremium: true }],
  [`GET /api/servers/${SID}/stats`]: { ticketCount: 42, openTickets: 3, applications: 7, closedThisWeek: 5 },
  [`GET /api/servers/${SID}/directory`]: {
    ok: true,
    categories: [
      { id: "331", name: "TICKETS", position: 0, canCreate: true },
      { id: "332", name: "APPLICATIONS", position: 1, canCreate: true },
      { id: "333", name: "STAFF ONLY", position: 2, canCreate: false },
    ],
    text: [
      { id: "222222222222222222", name: "welcome", position: 0, parentId: null, canSend: true },
      { id: "223", name: "general", position: 1, parentId: null, canSend: true },
      { id: "224", name: "announcements", position: 2, parentId: null, canSend: false },
    ],
    roles,
  },
  "GET /api/status": {
    status: "operational", timestamp: new Date(0).toISOString(),
    services: { api: { status: "operational", uptime: 3600 }, database: { status: "operational", latencyMs: 2 },
      bot: { status: "operational", latencyMs: 8 }, cache: { status: "operational", latencyMs: 2 } },
    uptime: 3600, stats: { totalServers: 5, activeServers24h: 2 },
  },
  [`GET /api/analytics/${SID}/dashboard`]: {
    kpis: { ticketsOpened: { value: 12, deltaPct: 8 }, ticketsClosed: { value: 10, deltaPct: -3 },
      avgFirstResponseMin: 7, applications: { value: 4, deltaPct: 0 } },
    live: { pendingApplications: 1, openTickets: 3 },
    series: { tickets: Array.from({ length: 14 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, opened: (i * 7) % 5, closed: (i * 3) % 4 })) },
    topPanels: [{ name: "Support", count: 9 }, { name: "Reports", count: 3 }],
  },
  [`GET /api/panels/${SID}`]: [
    { id: "p1", name: "Support", title: "Отвори тикет", buttons: [], supportRoleIds: [roles[2].id], published: true },
  ],
  [`GET /api/forms/${SID}`]: [
    { id: "f1", name: "Staff Application", isApplication: true, questions: [], acceptRoleIds: [], denyRoleIds: [],
      removeRoleIds: [], managerRoleIds: [], pingRoleIds: [], published: true },
  ],
  [`GET /api/tickets/${SID}`]: { tickets: [], total: 0 },
  [`GET /api/reactionroles/${SID}`]: [],
  [`GET /api/stripe/status/${SID}`]: { plan: "agency10", stripeStatus: "active" },
};

function fixtureFor(method, path) {
  const key = `${method} ${path}`;
  if (FIX[key]) return FIX[key];
  for (const [k, v] of Object.entries(FIX)) {
    const [m, p] = k.split(" ");
    if (m === method && path.startsWith(p)) return v;
  }
  return method === "GET" ? [] : { ok: true };
}

// ─── Обхватът: какво се отваря и какво се прави там ─────────────────────────
const PAGES = [
  { path: "/", name: "login" },
  { path: "/bg", name: "landing-bg" },
  { path: "/status", name: "status" },
  { path: "/commands", name: "commands-public" },
  { path: `/dashboard/${SID}`, name: "overview" },
  { path: `/dashboard/${SID}/settings`, name: "settings" },
  { path: `/dashboard/${SID}/forms`, name: "forms" },
  { path: `/dashboard/${SID}/panels`, name: "panels" },
  { path: `/dashboard/${SID}/automation`, name: "automation" },
  { path: `/dashboard/${SID}/tickets`, name: "tickets" },
  { path: `/dashboard/${SID}/premium`, name: "premium" },
  { path: `/dashboard/${SID}/verification`, name: "verification" },
  { path: `/dashboard/${SID}/webhooks`, name: "webhooks" },
  { path: `/dashboard/${SID}/kb`, name: "kb" },
  { path: `/dashboard/${SID}/analytics`, name: "analytics" },
  { path: `/dashboard/${SID}/apikeys`, name: "apikeys" },
  { path: `/dashboard/${SID}/applications`, name: "applications" },
  { path: `/dashboard/${SID}/commands`, name: "commands" },
];

const failures = [];
const note = (ok, msg) => { console.log(`  ${ok ? "✓" : "✗"} ${msg}`); if (!ok) failures.push(msg); };

const browser = await launch();
const srv = await serveDist();
const base = `http://127.0.0.1:${srv.address().port}`;
mkdirSync(SHOTS, { recursive: true });

for (const view of [
  { tag: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { tag: "desktop", viewport: { width: 1280, height: 800 } },
]) {
  const ctx = await browser.newContext({ ...view, tag: undefined });
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(fixtureFor(req.method(), url.pathname)) });
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).split("\n")[0]));

  console.log(`\n── ${view.tag} ${view.viewport.width}×${view.viewport.height} ──`);
  for (const { path, name } of PAGES) {
    // НЕ networkidle: refetchInterval-ите на React Query държат мрежата будна
    // и „idle" никога не идва — таймаут, който изглежда като счупена страница.
    await page.goto(base + path, { waitUntil: "load" }).catch((e) => note(false, `${name}: не зареди (${e.message.split("\n")[0]})`));
    await page.waitForTimeout(900); // данните от мока + анимациите на влизане
    const over = await page.evaluate(() => {
      const el = document.documentElement;
      return { sw: el.scrollWidth, cw: el.clientWidth };
    });
    note(over.sw <= over.cw + 1, `${name}: без хоризонтален прелив (${over.sw}/${over.cw})`);

    // ХОРИЗОНТАЛЕН ПРЕЛИВ ВЪВ ВСЕКИ СКРОЛ КОНТЕЙНЕР, не само в страницата.
    // Проверката само на <html> е сляпа два пъти: `overflow-x: hidden` на body
    // крие прелива, а Layout-ът скролва <main> — прелив ВЪТРЕ в main изобщо не
    // стига до html. Точно така селектът за канал стърчеше от картата на
    // формата (собственикът, снимка 08.08.2026), докато „проверката" беше
    // зелена. Първата поправка тук прескачаше всичко под скролируем прародител
    // — тоест целият дашборд беше изключен от проверката.
    //
    // Правило: контейнер, който може да скролва/реже (auto·scroll·hidden) и
    // има scrollWidth > clientWidth, е дефект — ОСВЕН ако скролът е нарочен
    // (класът казва overflow-x-auto: таблиците в скрол обвивка).
    const sticking = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll("body, body *")) {
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const st = getComputedStyle(el);
        // Само реално СКРОЛИРУЕМИ (auto/scroll): при тях преливът се вижда
        // като паниране под пръста. hidden/clip е нарочно рязане — дизайнов
        // инструмент (sr-only, truncate, декоративни фонове), не дефект.
        if (!/(auto|scroll)/.test(st.overflowX)) continue;
        const cls = String(el.className);
        if (cls.includes("overflow-x-auto")) continue;      // нарочен скрол
        if (el.closest('[aria-hidden="true"]')) continue;    // декорация
        // Контейнерът казва „има прелив", но виновникът е ДЕТЕ. Намираме
        // най-широките потомци — иначе докладът сочи <main> и се гадае.
        // Мери се ДЕСНИЯТ РЪБ спрямо контейнера, не ширината: първата версия
        // питаше „кой е по-широк от 390" и върна „?" — виновникът беше тесен,
        // но ИЗМЕСТЕН надясно (right=684 при width<390).
        const base = el.getBoundingClientRect().left - el.scrollLeft;
        const culprits = [];
        for (const kid of el.querySelectorAll("*")) {
          const right = kid.getBoundingClientRect().right - base;
          if (right > el.clientWidth + 1 && !culprits.some((c) => c.el.contains(kid))) {
            culprits.push({ el: kid, right });
          }
        }
        culprits.sort((a, b) => b.right - a.right);
        const who = culprits.slice(0, 3)
          .map((c) => `<${c.el.tagName.toLowerCase()} class="${String(c.el.className).slice(0, 60)}" right=${Math.round(c.right)}>`)
          .join(" » ");
        bad.push(`<${el.tagName.toLowerCase()}> ${el.scrollWidth}>${el.clientWidth} виновници: ${who || "?"}`);
        if (bad.length >= 5) break;
      }
      return bad;
    });
    note(sticking.length === 0,
      `${name}: нула хоризонтални преливи в контейнерите${sticking.length ? " → " + sticking.join(" · ") : ""}`);
    await page.screenshot({ path: join(SHOTS, `${view.tag}-${name}.png`) });
  }

  // ─── Порталът на ролите: отвори и премери ────────────────────────────────
  await page.goto(`${base}/dashboard/${SID}/settings`, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(900);
  const addRole = page.locator('button:has-text("Add role…")').first();
  if (await addRole.count()) {
    // Скрол + клик в ЕДНО evaluate. Поотделно Playwright-кликът (actionability
    // проверките му) ВРЪЩАШЕ скрола на мобилния контекст между двете стъпки —
    // инструментирането показа btnBottom=443 при отваряне, при измерени 744
    // след скрола. `el.click()` от DOM не скролва нищо.
    // Скролва се най-близкият скролируем прародител: Layout-ът е `h-screen
    // overflow-hidden` и скролва <main>, а `window.scrollBy` там е безшумно нищо.
    await addRole.evaluate((el) => {
      let n = el.parentElement;
      while (n && n.scrollHeight <= n.clientHeight + 4) n = n.parentElement;
      (n || document.scrollingElement).scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - 100));
      el.click();
    });
    await page.waitForTimeout(250);
    // Позицията на бутона В МОМЕНТА на отваряне — доказателство, че тестът
    // изобщо тества ръба; в средата на екрана и счупен код минава.
    const btnBottom = await addRole.evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    note(btnBottom > view.viewport.height - 200, `${view.tag}: бутонът е НА ръба при отваряне (bottom=${btnBottom} от ${view.viewport.height})`);
    const box = await page.locator("[data-picker-portal]").first().boundingBox().catch(() => null);
    if (!box) note(false, `${view.tag}: списъкът с роли не се отвори`);
    else {
      const vp = view.viewport;
      const inside = box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
      note(inside, `${view.tag}: списъкът с роли е изцяло във viewport (${Math.round(box.y)}+${Math.round(box.height)} от ${vp.height})`);
      note(box.height >= 150, `${view.tag}: списъкът е използваем на височина (${Math.round(box.height)}px)`);
      await page.screenshot({ path: join(SHOTS, `${view.tag}-role-picker-open.png`) });
    }
  } else note(false, `${view.tag}: бутонът „Add role…" липсва на Settings`);

  if (consoleErrors.length) note(false, `${view.tag}: JS грешки: ${[...new Set(consoleErrors)].slice(0, 3).join(" · ")}`);
  await ctx.close();
}

await browser.close();
srv.close();

console.log(`\nСнимки: ${SHOTS}`);
if (failures.length) { console.error(`\n✗ ${failures.length} провала.`); process.exit(1); }
console.log("✓ mobile-proof: всичко във viewport, нула преливи, нула JS грешки.");

// backend/src/__tests__/discordCompliance.test.js
// Картата на съответствието (docs/DISCORD_COMPLIANCE.md) не е проза — всяка
// автоматизируема точка се проверява тук срещу КОДА и ДОКУМЕНТИТЕ. Пада ли
// нещо, картата лъже (или кодът е регресирал). Правният текст на Discord е
// сверен на 13.09.2026; при промяна на Terms/Policy се обновяват и двете.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf-8");

describe("Developer Terms §5(b) — лесно достъпен път за изтриване", () => {
  it("/privacy команда в бота с info + delete, обявена в каталога (и трите копия)", () => {
    const cmd = read("bot/src/commands/privacy.js");
    expect(cmd).toContain('.setName("privacy")');
    expect(cmd).toContain('.setName("delete")');
    expect(cmd).toContain("/bot/dsr/erase");
    for (const f of ["bot/src/utils/commandsCatalog.js", "backend/src/data/commandsCatalog.js", "frontend/src/data/commandsCatalog.js"]) {
      expect(read(f), f).toContain('"/privacy delete"');
    }
  });

  it("backend приема заявката от бота и от админ конзолата през ЕДНО определение (lib/dsr.js)", () => {
    expect(existsSync(join(ROOT, "backend/src/lib/dsr.js"))).toBe(true);
    expect(read("backend/src/routes/bot.js")).toMatch(/router\.post\("\/dsr\/erase"/);
    expect(read("backend/src/routes/adminOps.js")).toMatch(/router\.post\("\/dsr\/:discordId\/erase"/);
    const dsr = read("backend/src/lib/dsr.js");
    expect(dsr).toContain("DSR_ERASED");
    expect(dsr).toContain('scope === "full"');
  });

  it("таблото пази самообслужването по чл. 15/17 и пътя за сигнали (Policy: way to report issues)", () => {
    const gdpr = read("backend/src/routes/gdpr.js");
    expect(gdpr).toMatch(/router\.get\("\/export"/);
    expect(gdpr).toMatch(/router\.post\("\/delete-account"/);
    expect(gdpr).toMatch(/router\.post\("\/report-abuse"/);
  });
});

describe("Developer Terms §5(a) — политика за поверителност, публично достъпна", () => {
  it("има /privacy и /terms маршрути и footer линкове в index.html", () => {
    const app = read("frontend/src/App.jsx");
    expect(app).toContain('path="/privacy"');
    expect(app).toContain('path="/terms"');
    // Футърът на таблото (index.html е SPA обвивка).
    const layout = read("frontend/src/components/Layout.jsx");
    expect(layout).toMatch(/(href|to)="\/privacy"/);
    expect(layout).toMatch(/(href|to)="\/terms"/);
    // Футърът на публичния сайт (редизайн 25.09.2026): един SiteFooter за лендинга
    // и всички публични страници; връзките се строят от списък [href, етикет].
    const chrome = read("frontend/src/site/SiteChrome.jsx");
    expect(chrome).toMatch(/\["\/privacy",/);
    expect(chrome).toMatch(/\["\/terms",/);
    for (const f of ["frontend/src/site/Landing.jsx", "frontend/src/components/PublicPageLayout.jsx"]) {
      expect(read(f), f).toMatch(/<SiteFooter\b/);
    }
  });
});

describe("Developer Terms §5(c) — сигурност и уведомяване на Discord", () => {
  it("процедурата за пробив има стъпка за Discord (Developer Support)", () => {
    const proc = read("legal/breach-procedure.md");
    expect(proc).toMatch(/Discord notification/);
    expect(proc).toMatch(/Developer Terms §5\(c\)/);
    expect(proc).toMatch(/dis\.gd\/contact/);
  });

  it("шифриране при покой: TOTP тайна, OAuth токени и бранд токени минават през lib/crypto.js", () => {
    expect(read("backend/src/routes/mfa.js")).toMatch(/mfaSecret:\s*encrypt\(/);
    expect(read("backend/src/routes/auth.js")).toMatch(/encrypt\(/);
    expect(read("backend/src/routes/bot.js")).toMatch(/decrypt\(/);
  });

  it("staff достъпът до /api/admin минава през requireMfa; разрушителните — през step-up", () => {
    const admin = read("backend/src/routes/admin.js");
    expect(admin).toMatch(/router\.use\(requireAuth, loadUser, adminIpAllowlist, requireSuperUser, requireMfa\)/);
    for (const route of ['router.delete("/users/:userId"', 'router.delete("/servers/:serverId"', 'router.post("/audit-logs/purge"', 'router.patch("/users/:userId/role"', 'router.patch("/servers/:serverId"', 'router.post("/servers/:serverId/broadcast"']) {
      const i = admin.indexOf(route);
      expect(i, route).toBeGreaterThan(-1);
      expect(admin.slice(i, i + 160), `${route} без step-up`).toContain("stepUp");
    }
    const ops = read("backend/src/routes/adminOps.js");
    expect(ops).toMatch(/router\.use\(requireAuth, loadUser, adminIpAllowlist, requireSuperUser, requireMfa\)/);
    for (const route of ['"/security/unblock"', '"/security/apikeys/:id"', '"/billing/reconcile"', '"/fleet/reconcile"', '"/dsr/:discordId/erase"', '"/users/:userId/mfa/reset"']) {
      const i = ops.indexOf(route);
      expect(i, route).toBeGreaterThan(-1);
      expect(ops.slice(i, i + 80), `${route} без MAIN_OWNER+step-up`).toMatch(/requireMainOwner, stepUp/);
    }
  });

  it("платформеният bypass на per-server правата важи само с потвърден втори фактор", () => {
    const auth = read("backend/src/middleware/auth.js");
    const i = auth.indexOf("Platform-level admins bypass");
    expect(auth.slice(i, i + 700)).toContain("mfaSessionState(req.session).verified");
  });
});

describe("Developer Terms §3(b)/§12(a) — white-label токените", () => {
  it("EULA §8.6 обявява Service Provider отношението и изтриването при край", () => {
    const eula = read("frontend/src/pages/EulaPage.jsx");
    expect(eula).toContain("8.6 Service Provider relationship");
    expect(eula).toMatch(/Section 12\(a\)/);
    expect(eula).toMatch(/deletes it and any related API Data within 30 days/);
  });
});

describe("Developer Policy §21 — съдържание от Discord не храни обучение на модели", () => {
  it("AI отговорите са fail-closed зад AI_REPLY_TRAINING_ATTESTED", () => {
    const ai = read("backend/src/services/aiReply.js");
    expect(ai).toContain("AI_REPLY_TRAINING_ATTESTED");
    const fn = ai.slice(ai.indexOf("export async function generateAutoReply"));
    // гардът стои ПРЕДИ първото fetch
    expect(fn.indexOf("aiTrainingAttested()")).toBeLessThan(fn.indexOf("fetch("));
    expect(read("backend/.env.example")).toContain("AI_REPLY_TRAINING_ATTESTED");
  });
});

describe("Developer Policy §5–6 — без нежелани DM и маркетинг", () => {
  it("dmUser се ползва само за транзакционни известия (никакъв маркетинг модул)", () => {
    for (const f of ["backend/src/services/scheduler.js", "backend/src/jobs/dunning.js", "backend/src/routes/stripe.js", "backend/src/routes/discordEntitlements.js"]) {
      if (!existsSync(join(ROOT, f))) continue;
      expect(read(f), f).not.toMatch(/newsletter|promo(tion)?|marketing campaign/i);
    }
  });
});

// ─── docs/DISCORD_VERIFICATION.md — отговорите за портала срещу КОДА ──────────
// Ревюто на Discord сравнява декларираното с реалното поведение; документът е
// това, което собственикът копира във формуляра. Разминаване между него и
// intents/правата в кода е точно грешката, която води до отказ.
describe("docs/DISCORD_VERIFICATION.md е сверен с кода", () => {
  const PRIVILEGED = ["MessageContent", "GuildMembers", "GuildPresences"];
  const intentsInCode = () => {
    const src = read("bot/src/index.js");
    const block = src.slice(src.indexOf("intents: ["), src.indexOf("],", src.indexOf("intents: [")));
    return [...block.matchAll(/^\s*GatewayIntentBits\.(\w+)/gm)].map((m) => m[1]);
  };

  it("всеки привилегирован intent в кода има свой раздел с употреби; неползван — не се иска", () => {
    const doc = read("docs/DISCORD_VERIFICATION.md");
    const used = intentsInCode().filter((i) => PRIVILEGED.includes(i));
    expect(used.length, "поне един привилегирован intent (тикетите четат съдържание)").toBeGreaterThan(0);
    for (const i of used) {
      expect(doc, `${i} липсва като раздел в документа`).toContain(`(\`GatewayIntentBits.${i}\`, \`bot/src/index.js\`)`);
    }
    for (const i of PRIVILEGED.filter((p) => !used.includes(p))) {
      expect(doc, `${i} не е в кода, но документът не казва изрично, че не се иска`).toMatch(new RegExp(`${i === "GuildPresences" ? "Presence" : i}[^\\n]*not requested`, "i"));
      expect(doc).not.toContain(`(\`GatewayIntentBits.${i}\``);
    }
  });

  it("употребите на Message Content сочат файлове, които съществуват и правят това", () => {
    expect(read("bot/src/events/messageCreate.js")).toContain("ticketChannelCache");
    expect(read("backend/src/services/aiReply.js")).toContain("AI_REPLY_TRAINING_ATTESTED");
    // v50 Server Season: Counting чете съдържание САМО в обявения канал — проверката
    // на канала стои ПРЕДИ message.content; XP брои събития, не текст.
    const minigames = read("bot/src/utils/minigames.js");
    expect(minigames).toContain("parseCount(message.content)");
    expect(minigames.indexOf("countingChannelId !== message.channelId")).toBeLessThan(minigames.indexOf("parseCount(message.content)"));
    expect(read("docs/DISCORD_VERIFICATION.md")).toContain("bot/src/utils/minigames.js");
    expect(read("bot/src/utils/game.js")).not.toMatch(/message\.content/);
    for (const f of ["bot/src/events/messageUpdate.js", "bot/src/events/messageDelete.js", "bot/src/events/messageDeleteBulk.js"]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
    // „пълният списък с членове никога не се иска“ — members.fetch само с един id
    const bot = ["bot/src/index.js", "bot/src/utils/formSession.js", "bot/src/events/messageReactionAdd.js", "bot/src/events/messageReactionRemove.js"].map(read).join("\n");
    expect(bot).not.toMatch(/members\.fetch\(\s*\)/);
    expect(bot).not.toMatch(/members\.fetch\(\s*\{/);
  });

  it("числото на правата в поканата е ЕДНО — код, фронтенд и документ", () => {
    const m = read("bot/src/utils/permissionCheck.js").match(/INVITE_PERMISSIONS_INT = (\d+)/);
    expect(m, "INVITE_PERMISSIONS_INT липсва").toBeTruthy();
    const n = m[1];
    expect(read("frontend/src/site/SiteChrome.jsx")).toContain(`permissions=${n}&`);
    expect(read("docs/DISCORD_VERIFICATION.md")).toContain(`permissions=${n}`);
  });

  it("документът носи адресите, които портала иска, и пътя за изтриване", () => {
    const doc = read("docs/DISCORD_VERIFICATION.md");
    expect(doc).toContain("https://supremebot.carbonstealth.eu/privacy");
    expect(doc).toContain("https://supremebot.carbonstealth.eu/terms");
    expect(doc).toContain("/privacy delete");
    expect(doc).toContain("discordCompliance.test.js");
    expect(doc).toMatch(/10 000/);
  });
});

describe("документът е синхронизиран", () => {
  it("картата цитира датите на сверяване и двете статии на Discord", () => {
    const doc = read("docs/DISCORD_COMPLIANCE.md");
    expect(doc).toContain("8562894815383");
    expect(doc).toContain("8563934450327");
    expect(doc).toMatch(/13\.09\.2026/);
    expect(doc).toContain("discordCompliance.test.js");
  });
});

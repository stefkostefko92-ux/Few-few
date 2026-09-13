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
    // Футърите на публичната страница и на таблото (index.html е SPA обвивка).
    for (const f of ["frontend/src/pages/Login.jsx", "frontend/src/components/Layout.jsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/(href|to)="\/privacy"/);
      expect(src, f).toMatch(/(href|to)="\/terms"/);
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
    expect(admin).toMatch(/router\.use\(requireAuth, loadUser, requireSuperUser, requireMfa\)/);
    for (const route of ['router.delete("/users/:userId"', 'router.delete("/servers/:serverId"', 'router.post("/audit-logs/purge"', 'router.patch("/users/:userId/role"']) {
      const i = admin.indexOf(route);
      expect(i, route).toBeGreaterThan(-1);
      expect(admin.slice(i, i + 160), `${route} без step-up`).toContain("stepUp");
    }
    const ops = read("backend/src/routes/adminOps.js");
    expect(ops).toMatch(/router\.use\(requireAuth, loadUser, requireSuperUser, requireMfa\)/);
    for (const route of ['"/security/unblock"', '"/security/apikeys/:id"', '"/billing/reconcile"', '"/fleet/reconcile"', '"/dsr/:discordId/erase"']) {
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

describe("документът е синхронизиран", () => {
  it("картата цитира датите на сверяване и двете статии на Discord", () => {
    const doc = read("docs/DISCORD_COMPLIANCE.md");
    expect(doc).toContain("8562894815383");
    expect(doc).toContain("8563934450327");
    expect(doc).toMatch(/13\.09\.2026/);
    expect(doc).toContain("discordCompliance.test.js");
  });
});

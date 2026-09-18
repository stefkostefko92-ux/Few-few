// backend/src/__tests__/gdpr.test.js
// Чл. 15 (достъп) и чл. 17 (изтриване) — правата на субекта на данни.
//
// Тези тестове съществуват заради конкретен дефект: коментар в gdpr.js твърдеше
// „User model has no email“, докато schema.prisma го носи (идва от OAuth scope
// `email`). Заради коментара имейлът НЕ се зануляваше при изтриване на акаунт и
// липсваше от експорта. Поправено на 07.08.2026; тук пазим да не се върне.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Автентикацията не е предмет на тези тестове — вкарваме познат потребител.
const USER = {
  id: "u1",
  username: "stefan",
  discriminator: "0",
  avatar: "abc",
  email: "stefan@example.com",
  globalRole: "USER",
  isBlacklisted: true,
  language: "bg",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = { userId: USER.id }; next(); },
  // Уважава вече зададен req.user — тестът за лимитера вкарва ВТОРИ потребител.
  loadUser: (req, _res, next) => { req.user = req.user || { ...USER }; next(); },
}));

const { default: gdprRouter, subjectRightsLimiter } = await import("../routes/gdpr.js");

function app() {
  const a = express();
  a.use(express.json());
  a.use("/api/gdpr", gdprRouter);
  return a;
}

beforeEach(async () => {
  vi.clearAllMocks();
  // Лимитерът по потребител (5/час) е споделен между тестовете в този файл —
  // без нулиране шестият тест получава 429 и „не вика update" изглежда като
  // дефект в чл. 17, а не в тестовата изолация. Нулираме ключа, не мокаме
  // лимитера: така той остава истински и си има собствен тест по-долу.
  await subjectRightsLimiter.resetKey(USER.id);
  prismaMock.user.findUnique.mockResolvedValue({ ...USER });
  for (const m of ["server", "serverMember", "ticket", "ticketMessage", "application", "apiKey", "auditLog", "session"]) {
    prismaMock[m].findMany.mockResolvedValue([]);
    prismaMock[m].deleteMany.mockResolvedValue({ count: 0 });
    prismaMock[m].updateMany.mockResolvedValue({ count: 0 });
  }
  // Потвърждението иска СОБСТВЕНИЯ Discord ID, а изтриването се блокира при
  // активен платен абонамент — и двете са реални гардове, не тестова украса.
  prismaMock.server.count.mockResolvedValue(0);
  prismaMock.agency.count.mockResolvedValue(0);
  prismaMock.user.update.mockResolvedValue({ ...USER });
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("GET /api/gdpr/export — чл. 15", () => {
  it("включва имейла (беше пропуснат: чл. 15(1) иска ВСИЧКИ лични данни)", async () => {
    const res = await request(app()).get("/api/gdpr/export");
    expect(res.status).toBe(200);
    expect(res.body?.data?.profile?.email).toBe("stefan@example.com");
  });

  it("НЕ изнася OAuth токени", async () => {
    const res = await request(app()).get("/api/gdpr/export");
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("accessToken");
    expect(body).not.toContain("refreshToken");
  });

  it("носи идентификация на субекта и на платформата", async () => {
    const res = await request(app()).get("/api/gdpr/export");
    expect(res.body.subject).toMatchObject({ id: "u1", type: "user" });
    expect(res.body.platform).toBe("Supreme Bot");
  });

  it("включва статуса на блокиране (факт, обработван ЗА субекта — чл. 15(1))", async () => {
    const res = await request(app()).get("/api/gdpr/export");
    expect(res.body?.data?.profile?.isBlacklisted).toBe(true);
  });

  it("тегли одита и където субектът е ОБЕКТ (targetId), не само автор", async () => {
    await request(app()).get("/api/gdpr/export");
    const call = prismaMock.auditLog.findMany.mock.calls.at(-1);
    expect(call[0].where).toEqual({ OR: [{ actorId: "u1" }, { targetId: "u1" }] });
  });

  it("НЕ изнася чужди лични данни: тикет-транскрипта и таен архив-токен (чл. 15(4))", async () => {
    await request(app()).get("/api/gdpr/export");
    const call = prismaMock.ticket.findMany.mock.calls.at(-1);
    expect(call[0].select, "тикетите трябва да минат през allowlist select").toBeTruthy();
    expect(call[0].select.archiveHtml).toBeUndefined();
    expect(call[0].select.archiveToken).toBeUndefined();
    expect(call[0].select.closeReason).toBe(true); // собствените данни остават
  });
});

describe("POST /api/gdpr/delete-account — чл. 17", () => {
  it("занулява имейла (иначе преживява „изтриването“)", async () => {
    await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    const call = prismaMock.user.update.mock.calls.at(-1);
    expect(call, "user.update изобщо не е викан").toBeTruthy();
    expect(call[0].data).toHaveProperty("email", null);
  });

  it("анонимизира профила и маха аватара", async () => {
    await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    const data = prismaMock.user.update.mock.calls.at(-1)[0].data;
    expect(data.username).toMatch(/^\[deleted-user-/);
    expect(data.avatar).toBeNull();
  });

  it("трие сесиите — OAuth токените живеят там", async () => {
    await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }),
    );
  });

  it("псевдонимизира authorTag в тикет-съобщенията (пряко идентифициращ подпис)", async () => {
    await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    const call = prismaMock.ticketMessage.updateMany.mock.calls.at(-1);
    expect(call, "ticketMessage.updateMany не е викан").toBeTruthy();
    expect(call[0].where).toMatchObject({ authorId: "u1" });
    expect(call[0].data.authorTag).toMatch(/^\[deleted-user-/);
  });
});

describe("POST /api/gdpr/delete-account — гардове преди изтриването", () => {
  it("отказва при активен Premium абонамент (иначе клиентът плаща за изтрит акаунт)", async () => {
    prismaMock.server.count.mockResolvedValue(1);
    const res = await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ACTIVE_SUBSCRIPTIONS");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("отказва при активна Agency — тя не виси на сървър, затова е отделна проверка", async () => {
    prismaMock.agency.count.mockResolvedValue(1);
    const res = await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "u1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ACTIVE_SUBSCRIPTIONS");
  });

  it("отказва при грешно потвърждение (иска собствения Discord ID)", async () => {
    const res = await request(app()).post("/api/gdpr/delete-account").send({ confirmDiscordId: "чужд" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

// ─── Чл. 15 покрива и таблиците, които метлата познава (одит 09.08.2026) ─────
// Асиметрията беше доказателството за пропуска: dataRetention.js ТРИЕШЕ
// verification_attempts / poll_votes / giveaway_entries, а експортът ги
// премълчаваше. Гейтът е структурен: разделите присъстват в изхода.
describe("чл. 15 — новите раздели присъстват", () => {
  it("експортът декларира всичките пет добавени секции", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "gdpr.js"), "utf-8");
    for (const section of ["verification_attempts", "form_submission_counters", "poll_votes", "giveaway_entries", "server_memberships"]) {
      expect(src, `${section} липсва от чл. 15 изхода`).toContain(section);
    }
  });

  it("една счупена таблица НЕ събаря целия експорт (fail-open по раздел)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "gdpr.js"), "utf-8");
    const block = src.slice(src.indexOf("verificationAttempt.findMany"), src.indexOf("serverMember.findMany") + 200);
    expect(block).toContain("Promise.resolve().then");
  });
});

// Таван ПО ПОТРЕБИТЕЛ (одит по сигурност, 08.09.2026). Експортът прави 21
// заявки и пише одитен ред на всяко повикване; досега го пазеше само общият
// лимитер по адрес (200/мин), тоест един акаунт можеше да го удря 200 пъти в
// минута. Тестът е ПОВЕДЕНЧЕСКИ — праща истински заявки през истинския
// лимитер, не чете константата.
describe("права на субекта — таван по потребител, не по адрес", () => {
  it("шестият експорт за час получава 429, петият минава", async () => {
    const a = app();
    for (let i = 1; i <= 5; i++) {
      const r = await request(a).get("/api/gdpr/export");
      expect(r.status, `експорт №${i} трябва да мине`).toBe(200);
    }
    const sixth = await request(a).get("/api/gdpr/export");
    expect(sixth.status).toBe(429);
    expect(sixth.headers["ratelimit-limit"]).toBe("5");
  });

  it("ключът е потребителят: друг акаунт от СЪЩИЯ адрес има свой бюджет", async () => {
    const a = app();
    for (let i = 0; i < 5; i++) await request(a).get("/api/gdpr/export");
    expect((await request(a).get("/api/gdpr/export")).status).toBe(429);
    // Същият процес, същият (тестов) адрес — само потребителят е различен.
    await subjectRightsLimiter.resetKey("u2");
    const other = express();
    other.use(express.json());
    other.use((req, _res, next) => { req.user = { ...USER, id: "u2" }; next(); });
    other.use("/api/gdpr", gdprRouter);
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, id: "u2" });
    expect((await request(other).get("/api/gdpr/export")).status).toBe(200);
  });
});

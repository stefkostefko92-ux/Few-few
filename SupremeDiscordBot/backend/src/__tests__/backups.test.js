// backend/src/__tests__/backups.test.js
// Резервни копия на сървъра — спецификацията е в docs/BACKUP_SPEC.md; номерът Б… е в името на теста.
//
// Заявката (28.11.2026): копие на категориите, каналите, ролите и правата, за да може сървърът да се
// върне, ако бъде изтрит. Тук се пази какво влиза в копието, кой може да го види и върне, лимитите
// и прогресът. Самото създаване в Discord е в бота (bot/src/__tests__/backupRestore.test.js).
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = "ab".repeat(32);
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
const writeAudit = vi.fn(async () => true);
vi.mock("../lib/auditLog.js", () => ({ writeAudit: (...a) => writeAudit(...a) }));

const ME = "111111111111111111";
const SID = "333333333333333333"; // сървърът, от който е копието
const TID = "444444444444444444"; // друг сървър — целта при изтрит сървър
let USER, DG;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (_req, _res, next) => next(),
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  // DG = обектът от Discord /users/@me/guilds; null = staff заобикаляне (без собствени права).
  requireServerAdmin: (req, _res, next) => { if (DG) req.discordGuild = { id: req.params.serverId, ...DG }; next(); },
  requireBotSecret: (_req, _res, next) => next(),
}));
const captureFromBot = vi.fn(), preflightFromBot = vi.fn(), kickRestore = vi.fn();
vi.mock("../lib/backupBot.js", () => ({
  captureFromBot: (...a) => captureFromBot(...a),
  preflightFromBot: (...a) => preflightFromBot(...a),
  kickRestore: (...a) => kickRestore(...a),
}));
const getServerTier = vi.fn();
vi.mock("../lib/premium.js", async (orig) => ({ ...(await orig()), getServerTier: (...a) => getServerTier(...a) }));

const { BASE_LIMITS, PREMIUM_LIMITS } = await import("../lib/premium.js");
const { parseSnapshot, stripForStorage, planRestore, MAX_ROLES, MAX_CHANNELS } = await import("../lib/backupSnapshot.js");
const { decrypt } = await import("../lib/crypto.js");
const backupsRouter = (await import("../routes/backups.js")).default;
const botBackupsRouter = (await import("../routes/bot_backups.js")).default;

const app = () => {
  const a = express();
  a.use(express.json({ limit: "2mb" }));
  a.use("/api/backups", backupsRouter);
  a.use("/api/bot", botBackupsRouter);
  a.use((e, _q, r, _n) => r.status(500).json({ error: e.message }));
  return a;
};

const ID = (n) => String(500000000000000000n + BigInt(n));
function snap(o = {}) {
  const g = o.guildId || SID;
  return {
    v: 1,
    guild: { id: g, name: "Тестов сървър", ownerId: o.ownerId || ME },
    capturedAt: "2026-11-28T10:00:00.000Z",
    everyone: { permissions: "104324673" },
    roles: o.roles || [
      { id: ID(1), name: "Админ", color: 16711680, hoist: true, mentionable: false, permissions: "8", position: 3 },
      { id: ID(2), name: "Модератор", color: 0, hoist: true, mentionable: true, permissions: "8192", position: 2 },
      { id: ID(3), name: "Член", color: 0, hoist: false, mentionable: false, permissions: "0", position: 1 },
    ],
    categories: o.categories || [
      { id: ID(10), name: "Общи", position: 0, overwrites: [
        { id: g, kind: "everyone", allow: "0", deny: "1024" },
        { id: ID(3), kind: "role", allow: "1024", deny: "0" },
      ] },
    ],
    channels: o.channels || [
      { id: ID(20), type: 0, name: "общ-чат", parentId: ID(10), position: 0, topic: "Здрасти", nsfw: false, rateLimitPerUser: 0, overwrites: [] },
      { id: ID(21), type: 2, name: "Гласов", parentId: ID(10), position: 1, bitrate: 64000, userLimit: 0, overwrites: [] },
      { id: ID(22), type: 0, name: "тикет-0001", parentId: null, position: 5, overwrites: [] },
      { id: ID(23), type: 5, name: "новини", parentId: null, position: 6, overwrites: [] },
    ],
  };
}
const row = (o = {}) => ({
  id: "cbackup00000000000000000001", serverId: SID, guildName: "Тестов сървър", ownerId: ME, createdBy: ME,
  kind: "MANUAL", roleCount: 3, categoryCount: 1, channelCount: 4, sizeBytes: 1000, expiresAt: null,
  createdAt: new Date("2026-11-28T10:00:00Z"), data: null, ...o,
});
const free = () => ({ plan: "free", isPremium: false, limits: BASE_LIMITS });
const premium = () => ({ plan: "premium", isPremium: true, limits: PREMIUM_LIMITS });
const prefOk = (o = {}) => ({ ok: true, inGuild: true, admin: true, community: false, roleCount: 2, channelCount: 3, existingRoleIds: [], existingChannelIds: [], ...o });
const audited = (action) => writeAudit.mock.calls.map(([e]) => e).filter((e) => e.action === action);

let storedData = null;
beforeEach(async () => {
  vi.resetAllMocks();
  writeAudit.mockResolvedValue(true);
  USER = { id: ME, globalRole: "USER" };
  DG = { owner: true, permissions: "8" };
  getServerTier.mockResolvedValue(free());
  captureFromBot.mockResolvedValue({ ok: true, snapshot: snap() });
  preflightFromBot.mockResolvedValue(prefOk());
  kickRestore.mockResolvedValue({ ok: true });
  prismaMock.server.findUnique.mockResolvedValue({ id: SID, name: "Тестов сървър", ownerId: ME, botRemovedAt: null });
  prismaMock.ticket.findMany.mockResolvedValue([{ channelId: ID(22) }]);
  prismaMock.serverBackup.count.mockResolvedValue(0);
  prismaMock.serverBackup.findFirst.mockResolvedValue(null);
  prismaMock.serverBackup.findMany.mockResolvedValue([]);
  prismaMock.serverBackup.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.serverBackup.create.mockImplementation(async ({ data }) => { storedData = data.data; return row({ ...data, id: "cbackupnew0000000000000001", data: undefined }); });
  const { encrypt } = await import("../lib/crypto.js");
  prismaMock.serverBackup.findUnique.mockResolvedValue(row({ data: encrypt(JSON.stringify(snap())) }));
  prismaMock.backupRestore.create.mockImplementation(async ({ data }) => ({ id: "crestore000000000000000001", ...data, createdAt: new Date() }));
  prismaMock.backupRestore.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.backupRestore.findFirst.mockResolvedValue(null);
  prismaMock.backupRestore.findMany.mockResolvedValue([]);
});

describe("Б1 копието се проверява преди запис", () => {
  it("приема валидно копие", () => {
    expect(parseSnapshot(snap()).ok).toBe(true);
  });
  it("отказва повредено или над таваните на Discord", () => {
    expect(MAX_ROLES).toBe(250);
    expect(MAX_CHANNELS).toBe(500);
    const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    const bad = [
      { ...snap(), v: 2 },
      { ...snap(), roles: many(251, (i) => ({ id: ID(1000 + i), name: "r", color: 0, hoist: false, mentionable: false, permissions: "0", position: i + 1 })) },
      { ...snap(), channels: many(501, (i) => ({ id: ID(5000 + i), type: 0, name: "c", parentId: null, position: i, overwrites: [] })) },
      { ...snap(), roles: [{ id: "not-a-snowflake", name: "r", color: 0, hoist: false, mentionable: false, permissions: "0", position: 1 }] },
      { ...snap(), channels: [{ id: ID(30), type: 11, name: "нишка", parentId: null, position: 0, overwrites: [] }] },
      { ...snap(), channels: [{ id: ID(30), type: 0, name: "x".repeat(101), parentId: null, position: 0, overwrites: [] }] },
      { ...snap(), roles: [{ id: ID(1), name: "r", color: 0, hoist: false, mentionable: false, permissions: "abc", position: 1 }] },
      null, "текст", 42,
    ];
    for (const b of bad) expect(parseSnapshot(b).ok, JSON.stringify(b)?.slice(0, 80)).toBe(false);
  });
  it("Discord недостъпен при създаването → 503 и нищо не се записва", async () => {
    captureFromBot.mockResolvedValue({ ok: false, error: "bot unreachable" });
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(503);
    expect(prismaMock.serverBackup.create).not.toHaveBeenCalled();
  });
  it("ботът върне повредено копие → 502 и нищо не се записва", async () => {
    captureFromBot.mockResolvedValue({ ok: true, snapshot: { ...snap(), v: 99 } });
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(502);
    expect(prismaMock.serverBackup.create).not.toHaveBeenCalled();
  });
});

describe("Б2 съдържанието е шифровано и не излиза навън", () => {
  it("в базата е шифротекст; в отговора няма поле data", async () => {
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(201);
    expect(storedData).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(storedData).not.toContain("общ-чат");
    expect(JSON.parse(decrypt(storedData)).channels.map((c) => c.name)).toContain("общ-чат");
    expect(r.body.backup).toBeTruthy();
    expect(r.body.backup.data).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain(storedData.slice(0, 40));
  });
  it("списъкът не чете съдържанието от базата", async () => {
    prismaMock.serverBackup.findMany.mockResolvedValue([row()]);
    const r = await request(app()).get(`/api/backups/server/${SID}`);
    expect(r.status).toBe(200);
    const q = prismaMock.serverBackup.findMany.mock.calls[0][0];
    expect(q.select?.data).toBeFalsy();
    expect(r.body.backups[0].data).toBeUndefined();
  });
  it("детайлите са сводка (дърво и роли), не суровото копие", async () => {
    const r = await request(app()).get(`/api/backups/server/${SID}/cbackup00000000000000000001`);
    expect(r.status).toBe(200);
    expect(r.body.summary.tree[0]).toMatchObject({ name: "Общи" });
    expect(r.body.summary.tree[0].channels.map((c) => c.name)).toEqual(["общ-чат", "Гласов"]);
    expect(r.body.summary.roles.map((x) => x.name)).toEqual(["Админ", "Модератор", "Член"]);
    expect(r.body.backup.data).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/"permissions"|"overwrites"/);
  });
});

describe("Б3 без тикети и без лични права по канал", () => {
  it("каналите на тикетите не влизат в копието", async () => {
    await request(app()).post(`/api/backups/server/${SID}`).send({});
    const stored = JSON.parse(decrypt(storedData));
    expect(stored.channels.map((c) => c.id)).not.toContain(ID(22));
    expect(prismaMock.ticket.findMany.mock.calls[0][0].where.serverId).toBe(SID);
  });
  it("права за конкретен член (Discord ID) отпадат, остават ролите и @everyone", () => {
    const s = snap();
    s.channels[0].overwrites = [
      { id: ID(3), kind: "role", allow: "1024", deny: "0" },
      { id: "999999999999999999", kind: "member", allow: "1024", deny: "0" },
    ];
    const out = stripForStorage(s, { excludeChannelIds: [] });
    expect(out.channels[0].overwrites.map((o) => o.kind)).toEqual(["role"]);
  });
});

describe("Б4 лимитите са в premium.js; ръчните не се трият сами, автоматичните се въртят", () => {
  it("числата", () => {
    expect(BASE_LIMITS).toMatchObject({ manualBackups: 2, autoBackupsKept: 1, autoBackupEveryDays: 7 });
    expect(PREMIUM_LIMITS).toMatchObject({ manualBackups: 25, autoBackupsKept: 7, autoBackupEveryDays: 1 });
  });
  it("ръчно копие над лимита → 409, нищо не се трие и не се създава", async () => {
    prismaMock.serverBackup.count.mockResolvedValue(2);
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("BACKUP_LIMIT");
    expect(prismaMock.serverBackup.create).not.toHaveBeenCalled();
    expect(prismaMock.serverBackup.deleteMany).not.toHaveBeenCalled();
    expect(captureFromBot).not.toHaveBeenCalled();
  });
  it("Premium има 25 ръчни", async () => {
    getServerTier.mockResolvedValue(premium());
    prismaMock.serverBackup.count.mockResolvedValue(24);
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(201);
  });
  it("автоматично копие трие най-старите автоматични над лимита — никога ръчни", async () => {
    const { createBackup } = await import("../lib/backups.js");
    prismaMock.serverBackup.findMany.mockResolvedValue([{ id: "cnew" }, { id: "cold1" }, { id: "cold2" }]);
    const out = await createBackup(SID, { kind: "AUTO", tier: free(), snapshot: snap() });
    expect(out.ok).toBe(true);
    const listQ = prismaMock.serverBackup.findMany.mock.calls.at(-1)[0];
    expect(listQ.where).toMatchObject({ serverId: SID, kind: "AUTO" });
    const del = prismaMock.serverBackup.deleteMany.mock.calls.at(-1)[0];
    expect(del.where.id.in).toEqual(["cold1", "cold2"]);
    expect(del.where.kind).toBe("AUTO");
  });
});

describe("Б5 ръчно копие най-много веднъж на 10 минути", () => {
  it("скорошно ръчно копие → 429 с Retry-After", async () => {
    prismaMock.serverBackup.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 4 * 60 * 1000) });
    const r = await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(r.status).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(300);
    expect(captureFromBot).not.toHaveBeenCalled();
  });
});

describe("Б6 възстановяването не зависи от плана", () => {
  it("Free сървър връща копие", async () => {
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(202);
  });
});

describe("Б7 копие на друг сървър през чуждо serverId → 404", () => {
  beforeEach(async () => {
    const { encrypt } = await import("../lib/crypto.js");
    prismaMock.serverBackup.findUnique.mockResolvedValue(row({ serverId: TID, ownerId: "777777777777777777", data: encrypt(JSON.stringify(snap({ guildId: TID }))) }));
  });
  it("детайли", async () => {
    expect((await request(app()).get(`/api/backups/server/${SID}/cbackup00000000000000000001`)).status).toBe(404);
  });
  it("изтриване", async () => {
    const r = await request(app()).delete(`/api/backups/server/${SID}/cbackup00000000000000000001`);
    expect(r.status).toBe(404);
    expect(prismaMock.serverBackup.delete).not.toHaveBeenCalled();
    expect(prismaMock.serverBackup.deleteMany).not.toHaveBeenCalled();
  });
  it("възстановяване в мой сървър от чуждо копие, на което не съм собственик → 404, не 403", async () => {
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(404);
    expect(prismaMock.backupRestore.create).not.toHaveBeenCalled();
  });
  it("невалиден ID → 404 без заявка към базата", async () => {
    const r = await request(app()).get(`/api/backups/server/${SID}/..%2F..%2Fetc`);
    expect(r.status).toBe(404);
  });
});

describe("Б8 връща само собственикът или Administrator в целевия сървър", () => {
  const go = () => request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
  it("само Manage Server → 403", async () => {
    DG = { owner: false, permissions: String(0x20) };
    const r = await go();
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("ADMIN_REQUIRED");
    expect(prismaMock.backupRestore.create).not.toHaveBeenCalled();
  });
  it("Administrator → става", async () => {
    DG = { owner: false, permissions: String(0x8 | 0x20) };
    expect((await go()).status).toBe(202);
  });
  it("staff без собствени права в сървъра → 403 (заобикалянето не важи)", async () => {
    DG = null;
    USER = { id: ME, globalRole: "MAIN_OWNER" };
    const r = await go();
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("OWN_RIGHTS_REQUIRED");
  });
  it("без потвърждение → 400", async () => {
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001" });
    expect(r.status).toBe(400);
  });
});

describe("Б9 копие от един сървър в друг — само собственикът на копието", () => {
  it("собственикът (изтрит сървър → нов) → режим NEW", async () => {
    const r = await request(app()).post(`/api/backups/server/${TID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(202);
    const data = prismaMock.backupRestore.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ mode: "NEW", sourceServerId: SID, targetServerId: TID, activeServerId: TID, requestedBy: ME, status: "PENDING" });
  });
  it("някой друг → 404", async () => {
    USER = { id: "888888888888888888", globalRole: "USER" };
    const r = await request(app()).post(`/api/backups/server/${TID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(404);
  });
  it("в същия сървър → режим SAME (всеки с Administrator там)", async () => {
    USER = { id: "888888888888888888", globalRole: "USER" };
    DG = { owner: false, permissions: "8" };
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(202);
    expect(prismaMock.backupRestore.create.mock.calls[0][0].data.mode).toBe("SAME");
  });
});

describe("Б10 „Моите копия“ — само мои, само сводка", () => {
  it("търси по ownerId = аз и не чете съдържанието", async () => {
    prismaMock.serverBackup.findMany.mockResolvedValue([row()]);
    prismaMock.server.findMany.mockResolvedValue([{ id: SID, name: "Тестов сървър", botRemovedAt: new Date() }]);
    const r = await request(app()).get("/api/backups/mine");
    expect(r.status).toBe(200);
    const q = prismaMock.serverBackup.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ ownerId: ME });
    expect(q.select?.data).toBeFalsy();
    expect(r.body.servers[0]).toMatchObject({ serverId: SID, botPresent: false });
    expect(r.body.servers[0].backups[0].data).toBeUndefined();
  });
});

describe("Б11 проверка преди старта", () => {
  const pre = (sid = SID) => request(app()).post(`/api/backups/server/${sid}/restore/preflight`).send({ backupId: "cbackup00000000000000000001" });
  it("ботът няма Administrator → пречка; стартът е отказан", async () => {
    preflightFromBot.mockResolvedValue(prefOk({ admin: false }));
    const p = await pre();
    expect(p.status).toBe(200);
    expect(p.body.plan.blockers).toContain("BOT_NOT_ADMIN");
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(409);
    expect(r.body.plan.blockers).toContain("BOT_NOT_ADMIN");
    expect(prismaMock.backupRestore.create).not.toHaveBeenCalled();
  });
  it("ботът не е в сървъра → пречка", async () => {
    preflightFromBot.mockResolvedValue({ ok: true, inGuild: false });
    expect((await pre()).body.plan.blockers).toContain("BOT_NOT_IN_SERVER");
  });
  it("в същия сървър брои само липсващото", async () => {
    preflightFromBot.mockResolvedValue(prefOk({ existingRoleIds: [ID(1), ID(2)], existingChannelIds: [ID(10), ID(20), ID(21), ID(22)] }));
    const p = (await pre()).body.plan;
    expect(p.mode).toBe("SAME");
    expect(p.roles).toMatchObject({ total: 3, existing: 2, toCreate: 1 });
    // 1 категория + 4 канала в копието; липсва само „новини“
    expect(p.channels).toMatchObject({ total: 5, existing: 4, toCreate: 1 });
    // ботът получава само ID-тата, не цялото копие
    const sent = preflightFromBot.mock.calls[0][1];
    expect(Object.keys(sent).sort()).toEqual(["channelIds", "roleIds"]);
  });
  it("нищо не липсва → пречка NOTHING_MISSING", async () => {
    preflightFromBot.mockResolvedValue(prefOk({ existingRoleIds: [ID(1), ID(2), ID(3)], existingChannelIds: [ID(10), ID(20), ID(21), ID(22), ID(23)] }));
    expect((await pre()).body.plan.blockers).toContain("NOTHING_MISSING");
  });
  it("обявления без Community → предупреждение, не пречка", () => {
    const p = planRestore(snap(), { sameServer: false, ...prefOk() });
    expect(p.warnings.map((w) => w.code)).toContain("COMMUNITY_REQUIRED");
    expect(p.blockers).toEqual([]);
  });
  it("над тавана на Discord → предупреждение колко няма да влязат", () => {
    const p = planRestore(snap(), { sameServer: false, ...prefOk({ roleCount: 249 }) });
    const w = p.warnings.find((x) => x.code === "ROLE_LIMIT");
    expect(w).toBeTruthy();
    expect(w.count).toBe(2);
  });
});

describe("Б12 в друг сървър се създава всичко", () => {
  it("режим NEW брои всичко за създаване, независимо от ID-тата", () => {
    const p = planRestore(snap(), { sameServer: false, ...prefOk({ existingRoleIds: [ID(1)] }) });
    expect(p.mode).toBe("NEW");
    expect(p.roles.toCreate).toBe(3);
  });
});

describe("Б14 едно възстановяване наведнъж; прогрес; спиране", () => {
  it("второ → 409", async () => {
    prismaMock.backupRestore.create.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    const r = await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("RESTORE_RUNNING");
  });
  it("стартът буди бота и е в одита", async () => {
    await request(app()).post(`/api/backups/server/${SID}/restore`).send({ backupId: "cbackup00000000000000000001", confirm: true });
    expect(kickRestore).toHaveBeenCalledWith("crestore000000000000000001");
    expect(audited("BACKUP_RESTORE_STARTED")).toHaveLength(1);
  });
  it("прогресът се чете само за целевия сървър", async () => {
    prismaMock.backupRestore.findFirst.mockResolvedValue({ id: "crestore000000000000000001", targetServerId: SID, status: "RUNNING", mode: "SAME", counts: { rolesCreated: 1 }, warnings: [], idMap: { roles: {} } });
    const r = await request(app()).get(`/api/backups/server/${SID}/restore/crestore000000000000000001`);
    expect(r.status).toBe(200);
    expect(prismaMock.backupRestore.findFirst.mock.calls[0][0].where).toMatchObject({ id: "crestore000000000000000001", targetServerId: SID });
    expect(r.body.restore.idMap).toBeUndefined();
  });
  it("спиране — условно, само докато тече; освобождава сървъра", async () => {
    const r = await request(app()).post(`/api/backups/server/${SID}/restore/crestore000000000000000001/cancel`).send({});
    expect(r.status).toBe(200);
    const q = prismaMock.backupRestore.updateMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ id: "crestore000000000000000001", targetServerId: SID, status: { in: ["PENDING", "RUNNING"] } });
    expect(q.data).toMatchObject({ status: "CANCELLED", activeServerId: null });
    expect(audited("BACKUP_RESTORE_CANCELLED")).toHaveLength(1);
  });
});

describe("Б15 ботът продължава оттам, докъдето е стигнал", () => {
  const running = (o = {}) => ({ id: "crestore000000000000000001", backupId: "cbackup00000000000000000001", status: "RUNNING", mode: "NEW", sourceServerId: SID, targetServerId: TID, idMap: { roles: { [ID(1)]: "600000000000000001" }, channels: {} }, counts: {}, warnings: [], ...o });
  it("ботът взима задачата: PENDING → RUNNING, получава копието и картата", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running({ status: "PENDING" }));
    const r = await request(app()).get("/api/bot/backup-restores/crestore000000000000000001");
    expect(r.status).toBe(200);
    expect(r.body.snapshot.roles).toHaveLength(3);
    expect(r.body.restore.idMap.roles[ID(1)]).toBe("600000000000000001");
    const q = prismaMock.backupRestore.updateMany.mock.calls[0][0];
    expect(q.where.status).toEqual({ in: ["PENDING", "RUNNING"] });
    expect(q.data.status).toBe("RUNNING");
  });
  it("приключила задача не се дава пак", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running({ status: "DONE" }));
    expect((await request(app()).get("/api/bot/backup-restores/crestore000000000000000001")).status).toBe(409);
  });
  it("прогресът добавя към картата, не я заменя", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running());
    const r = await request(app()).post("/api/bot/backup-restores/crestore000000000000000001/progress")
      .send({ idMap: { roles: { [ID(2)]: "600000000000000002" }, channels: { [ID(10)]: "600000000000000010" } }, counts: { rolesCreated: 2 }, warnings: [] });
    expect(r.status).toBe(200);
    expect(r.body.stop).toBe(false);
    const q = prismaMock.backupRestore.updateMany.mock.calls.at(-1)[0];
    expect(q.where).toMatchObject({ id: "crestore000000000000000001", status: "RUNNING" });
    expect(q.data.idMap.roles).toEqual({ [ID(1)]: "600000000000000001", [ID(2)]: "600000000000000002" });
    expect(q.data.idMap.channels).toEqual({ [ID(10)]: "600000000000000010" });
    expect(q.data.heartbeatAt).toBeInstanceOf(Date);
  });
  it("карта с невалиден ID → 400", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running());
    const r = await request(app()).post("/api/bot/backup-restores/crestore000000000000000001/progress").send({ idMap: { roles: { [ID(2)]: "../x" } } });
    expect(r.status).toBe(400);
  });
  it("спряна от човека → ботът получава stop", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running({ status: "CANCELLED" }));
    const r = await request(app()).post("/api/bot/backup-restores/crestore000000000000000001/progress").send({ counts: {} });
    expect(r.body.stop).toBe(true);
  });
  it("краят освобождава сървъра и влиза в одита", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running());
    await request(app()).post("/api/bot/backup-restores/crestore000000000000000001/progress").send({ counts: { rolesCreated: 3 }, status: "DONE" });
    const q = prismaMock.backupRestore.updateMany.mock.calls.at(-1)[0];
    expect(q.data).toMatchObject({ status: "DONE", activeServerId: null });
    expect(q.data.finishedAt).toBeInstanceOf(Date);
    expect(audited("BACKUP_RESTORE_FINISHED")).toHaveLength(1);
  });
  it("бележките се трупат до 200", async () => {
    prismaMock.backupRestore.findUnique.mockResolvedValue(running({ warnings: Array.from({ length: 199 }, () => ({ code: "X" })) }));
    await request(app()).post("/api/bot/backup-restores/crestore000000000000000001/progress")
      .send({ warnings: [{ kind: "channel", name: "a", code: "50013" }, { kind: "channel", name: "b", code: "50013" }] });
    expect(prismaMock.backupRestore.updateMany.mock.calls.at(-1)[0].data.warnings).toHaveLength(200);
  });
});

describe("Б19 одит", () => {
  it("създаване и изтриване", async () => {
    await request(app()).post(`/api/backups/server/${SID}`).send({});
    expect(audited("BACKUP_CREATED")[0]).toMatchObject({ actorId: ME, serverId: SID });
    prismaMock.serverBackup.deleteMany.mockResolvedValue({ count: 1 });
    const r = await request(app()).delete(`/api/backups/server/${SID}/cbackup00000000000000000001`);
    expect(r.status).toBe(200);
    expect(prismaMock.serverBackup.deleteMany.mock.calls.at(-1)[0].where).toMatchObject({ id: "cbackup00000000000000000001", serverId: SID });
    expect(audited("BACKUP_DELETED")).toHaveLength(1);
  });
});

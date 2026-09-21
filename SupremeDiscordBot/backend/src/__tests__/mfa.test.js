// backend/src/__tests__/mfa.test.js
// Втори фактор (TOTP) — маршрути + middleware. Парично/входно критично:
//   • пълният цикъл setup → enable → verify → disable с ИСТИНСКИ TOTP кодове;
//   • replay: същият код втори път не минава;
//   • налучкване: стълбата от lib/bruteForce.js спира след 5 провала (429);
//   • requireMfa: staff без запис → MFA_ENROLL_REQUIRED; без потвърждение →
//     MFA_REQUIRED; изтекло/бездействие → MFA_REQUIRED; не-staff минава;
//   • requireFreshMfa: старо потвърждение → MFA_STEP_UP;
//   • тайната никога не се връща след записване; резервен код работи веднъж.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.API_SECRET = "bot-secret-test";

const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Фалшива express-session: обект в паметта с regenerate/save/destroy.
let SESSION;
function fakeSession() {
  const s = {
    regenerate(cb) { for (const k of Object.keys(s)) if (typeof s[k] !== "function") delete s[k]; cb(null); },
    save(cb) { cb && cb(null); },
    destroy(cb) { cb && cb(null); },
  };
  return s;
}
let USER;
vi.mock("../middleware/auth.js", () => ({
  requireAuth: (req, _res, next) => { req.session = SESSION; next(); },
  loadUser: (req, _res, next) => { req.user = USER; next(); },
  requireServerAdmin: (_req, _res, next) => next(),
  requireSuperUser: (req, res, next) => (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole) ? next() : res.status(403).json({ error: "no" })),
  requireMainOwner: (_req, _res, next) => next(),
  requireBotSecret: (_req, _res, next) => next(),
}));

const { totp, hashBackupCode } = await import("../lib/totp.js");
const { decrypt } = await import("../lib/crypto.js");
const { _resetBruteForceState } = await import("../lib/bruteForce.js");
const { requireMfa, requireFreshMfa, MFA_IDLE_MAX_MS, MFA_SESSION_MAX_MS } = await import("../middleware/mfa.js");
const mfaRouter = (await import("../routes/mfa.js")).default;

const app = express();
app.use(express.json());
app.use("/api/auth/mfa", mfaRouter);
// Пробен „админ“ маршрут зад гардовете
app.get("/api/admin/ping", (req, _res, next) => { req.session = SESSION; req.user = USER; next(); }, requireMfa, (_req, res) => res.json({ ok: true }));
app.delete("/api/admin/boom", (req, _res, next) => { req.session = SESSION; req.user = USER; next(); }, requireMfa, requireFreshMfa(), (_req, res) => res.json({ ok: true }));

// Прилага update-ите на prisma върху USER, за да е ДЪРЖАВНО реалистичен цикълът.
function applyUpdates() {
  prismaMock.user.update.mockImplementation(async ({ data }) => { Object.assign(USER, data); return USER; });
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.user.findUnique.mockImplementation(async () => USER);
}

beforeEach(() => {
  vi.resetAllMocks();
  _resetBruteForceState();
  SESSION = fakeSession();
  USER = { id: "u1", username: "stefan", discriminator: "0", globalRole: "MAIN_OWNER", mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: null, mfaLastUsedStep: null };
  delete process.env.MFA_ENFORCE_STAFF;
  applyUpdates();
});

async function enroll() {
  const setup = await request(app).post("/api/auth/mfa/setup");
  expect(setup.status).toBe(200);
  const { secret, otpauth } = setup.body;
  expect(otpauth).toContain(`secret=${secret}`);
  const code = totp(secret);
  const enable = await request(app).post("/api/auth/mfa/enable").send({ code });
  expect(enable.status).toBe(200);
  return { secret, backupCodes: enable.body.backupCodes };
}

describe("цикъл setup → enable → verify", () => {
  it("записва шифрирана тайна, връща 10 резервни кода веднъж, потвърждава сесията", async () => {
    const { secret, backupCodes } = await enroll();
    expect(backupCodes).toHaveLength(10);
    expect(USER.mfaEnabledAt).toBeInstanceOf(Date);
    expect(USER.mfaSecret).not.toBe(secret);            // не открит текст
    expect(decrypt(USER.mfaSecret)).toBe(secret);       // но нашият шифротекст
    expect(JSON.parse(USER.mfaBackupCodes)).toEqual(backupCodes.map(hashBackupCode));
    expect(SESSION.mfaVerifiedAt).toBeGreaterThan(0);
    expect(SESSION.mfaPending).toBeUndefined();

    const status = await request(app).get("/api/auth/mfa/status");
    expect(status.body).toMatchObject({ enabled: true, required: true, enrollmentRequired: false, verifiedInSession: true, backupCodesLeft: 10 });
    expect(JSON.stringify(status.body)).not.toContain(secret);
  });

  it("enable без setup или с грешен код → 400; повторен enable → 409", async () => {
    let r = await request(app).post("/api/auth/mfa/enable").send({ code: "123456" });
    expect(r.status).toBe(400); expect(r.body.code).toBe("MFA_NO_PENDING");
    await request(app).post("/api/auth/mfa/setup");
    r = await request(app).post("/api/auth/mfa/enable").send({ code: "000000" });
    expect(r.status).toBe(400); expect(r.body.code).toBe("MFA_INVALID_CODE");
    expect(USER.mfaEnabledAt).toBeNull();
    await enroll();
    r = await request(app).post("/api/auth/mfa/setup");
    expect(r.status).toBe(409);
  });

  it("verify с текущ код потвърждава; същият код втори път е replay → 400", async () => {
    const { secret } = await enroll();
    // Нова сесия (нов вход) → трябва пак потвърждение
    SESSION = fakeSession();
    let r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_REQUIRED");

    // enroll вече „изяде“ текущата стъпка; вземаме следващата
    const nextStep = USER.mfaLastUsedStep + 1;
    const code = totp(secret, { nowMs: nextStep * 30 * 1000 });
    vi.useFakeTimers({ now: nextStep * 30 * 1000 });
    r = await request(app).post("/api/auth/mfa/verify").send({ code });
    expect(r.status).toBe(200); expect(r.body.via).toBe("totp");
    r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(200);
    // replay
    r = await request(app).post("/api/auth/mfa/verify").send({ code });
    expect(r.status).toBe(400); expect(r.body.code).toBe("MFA_INVALID_CODE");
    vi.useRealTimers();
  });

  it("резервен код потвърждава и се консумира; втори път не важи", async () => {
    const { backupCodes } = await enroll();
    SESSION = fakeSession();
    let r = await request(app).post("/api/auth/mfa/verify").send({ code: backupCodes[0] });
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ via: "backup", backupCodesLeft: 9 });
    SESSION = fakeSession();
    r = await request(app).post("/api/auth/mfa/verify").send({ code: backupCodes[0] });
    expect(r.status).toBe(400);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "MFA_BACKUP_CODE_USED" }) }));
  });

  it("disable иска валиден код и чисти всичко; после staff е MFA_ENROLL_REQUIRED", async () => {
    const { secret } = await enroll();
    let r = await request(app).post("/api/auth/mfa/disable").send({ code: "000000" });
    expect(r.status).toBe(400);
    const nextStep = USER.mfaLastUsedStep + 1;
    vi.useFakeTimers({ now: nextStep * 30 * 1000 });
    r = await request(app).post("/api/auth/mfa/disable").send({ code: totp(secret, { nowMs: nextStep * 30 * 1000 }) });
    vi.useRealTimers();
    expect(r.status).toBe(200);
    expect(USER.mfaSecret).toBeNull(); expect(USER.mfaEnabledAt).toBeNull(); expect(USER.mfaBackupCodes).toBeNull();
    r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_ENROLL_REQUIRED");
  });
});

describe("налучкване", () => {
  it("5 грешни кода → 429 с Retry-After; одитът пази MFA_VERIFY_FAILED", async () => {
    await enroll();
    SESSION = fakeSession();
    let last;
    for (let i = 0; i < 5; i++) last = await request(app).post("/api/auth/mfa/verify").send({ code: "000000" });
    expect(last.status).toBe(400);
    const blocked = await request(app).post("/api/auth/mfa/verify").send({ code: "000000" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeTruthy();
    const failed = prismaMock.auditLog.create.mock.calls.filter((c) => c[0].data.action === "MFA_VERIFY_FAILED");
    expect(failed).toHaveLength(5);
  });
});

describe("requireMfa / requireFreshMfa", () => {
  it("не-staff минава без нищо", async () => {
    USER.globalRole = "USER";
    const r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(200);
  });

  it("staff без запис → MFA_ENROLL_REQUIRED (освен при MFA_ENFORCE_STAFF=false)", async () => {
    let r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_ENROLL_REQUIRED");
    process.env.MFA_ENFORCE_STAFF = "false";
    r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(200);
  });

  it("потвърждението изтича след 12 h и след 30 min бездействие", async () => {
    await enroll();
    SESSION.mfaVerifiedAt = Date.now() - MFA_SESSION_MAX_MS - 1000;
    SESSION.mfaLastActivity = Date.now();
    let r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(403); expect(r.body.reason).toBe("expired");
    SESSION.mfaVerifiedAt = Date.now() - 60_000;
    SESSION.mfaLastActivity = Date.now() - MFA_IDLE_MAX_MS - 1000;
    r = await request(app).get("/api/admin/ping");
    expect(r.status).toBe(403); expect(r.body.reason).toBe("idle");
  });

  it("step-up: потвърждение по-старо от 10 min → MFA_STEP_UP; свежо → минава", async () => {
    await enroll();
    SESSION.mfaVerifiedAt = Date.now() - 11 * 60 * 1000;
    SESSION.mfaLastActivity = Date.now();
    let r = await request(app).delete("/api/admin/boom");
    expect(r.status).toBe(403); expect(r.body.code).toBe("MFA_STEP_UP");
    SESSION.mfaVerifiedAt = Date.now() - 60_000;
    r = await request(app).delete("/api/admin/boom");
    expect(r.status).toBe(200);
  });
});

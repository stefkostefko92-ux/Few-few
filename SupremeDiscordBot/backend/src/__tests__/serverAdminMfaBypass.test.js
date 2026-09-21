// backend/src/__tests__/serverAdminMfaBypass.test.js
// Поведенчески гейт (не статичен): платформеният bypass на per-server правата в
// requireServerAdmin важи САМО за staff с потвърден втори фактор в сесията.
// Без него staff пада на обикновената Discord проверка — тук няма Discord
// сесия, значи 401, а не тих достъп до чужд сървър.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/discordRest.js", () => ({ fetchUserGuilds: vi.fn(async () => []) }));
vi.mock("axios", () => ({ default: vi.fn() }));

const { requireServerAdmin } = await import("../middleware/auth.js");

function run(user, session) {
  return new Promise((resolve) => {
    const req = { params: { serverId: "g1" }, user, session };
    const res = { status: (c) => ({ json: (b) => resolve({ status: c, body: b }) }) };
    requireServerAdmin(req, res, () => resolve({ status: 200, next: true }));
  });
}

beforeEach(() => { vi.resetAllMocks(); delete process.env.MFA_ENFORCE_STAFF; prismaMock.session.findFirst.mockResolvedValue(null); });

describe("requireServerAdmin — bypass само с MFA", () => {
  it("MAIN_OWNER с записан и потвърден фактор → минава без Discord проверка", async () => {
    const r = await run({ id: "o", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() }, { mfaVerifiedAt: Date.now() - 1000, mfaLastActivity: Date.now() });
    expect(r.next).toBe(true);
    expect(prismaMock.session.findFirst).not.toHaveBeenCalled();
  });
  it("MAIN_OWNER без потвърждение → обикновена проверка → 401 (няма Discord сесия)", async () => {
    const r = await run({ id: "o", globalRole: "MAIN_OWNER", mfaEnabledAt: new Date() }, {});
    expect(r.status).toBe(401);
  });
  it("MAIN_OWNER без записан фактор → същото (bypass затворен)", async () => {
    const r = await run({ id: "o", globalRole: "MAIN_OWNER", mfaEnabledAt: null }, {});
    expect(r.status).toBe(401);
  });
  it("обикновен потребител никога не получава bypass", async () => {
    const r = await run({ id: "u", globalRole: "USER", mfaEnabledAt: new Date() }, { mfaVerifiedAt: Date.now(), mfaLastActivity: Date.now() });
    expect(r.status).toBe(401);
  });
});

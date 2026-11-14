import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * „Имейл (Brevo)“ в админ панела (по модела на Rilievi): само OWNER, паролата на
 * акаунта при запис/изключване, ключът — шифрован и никога върнат, правилото за
 * нов сървър, пробното писмо и предимството пред .env. Prisma и nodemailer са
 * заменени с фалшификати.
 */

process.env.SETTINGS_SECRET_KEY = "a".repeat(64);
process.env.SMTP_HOST = ""; // без .env поща — източникът е само панелът

// ── Фалшиви таблици ─────────────────────────────────────────────────────────
interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  displayName: string;
  role: string;
  deletedAt: Date | null;
}
interface FakeMail {
  id: string;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
  fromName: string;
  fromEmail: string;
  active: boolean;
  updatedAt: Date;
  updatedById: string | null;
}
const users = new Map<string, FakeUser>();
let mailRow: FakeMail | null = null;
let auditRows: Array<{ action: string; detail: string }> = [];

const pick = <T extends object>(o: T, select?: Record<string, boolean>): Partial<T> => {
  if (!select) return { ...o };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) out[k] = (o as Record<string, unknown>)[k];
  return out as Partial<T>;
};

vi.mock("@aso/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const u = users.get(where.id);
        return u ? pick(u, select) : null;
      }),
    },
    mailSettings: {
      findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => (mailRow ? pick(mailRow, select) : null)),
      create: vi.fn(async ({ data }: { data: Omit<FakeMail, "updatedAt"> }) => {
        mailRow = { ...data, updatedAt: new Date() } as FakeMail;
        return mailRow;
      }),
      update: vi.fn(async ({ data }: { data: Partial<FakeMail> }) => {
        Object.assign(mailRow!, data, { updatedAt: new Date() });
        return mailRow;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { active?: boolean }; data: Partial<FakeMail> }) => {
        if (!mailRow || (where.active !== undefined && mailRow.active !== where.active)) return { count: 0 };
        Object.assign(mailRow, data);
        return { count: 1 };
      }),
    },
    adminAudit: {
      create: vi.fn(async ({ data }: { data: { action: string; detail: string } }) => {
        auditRows.push({ action: data.action, detail: data.detail });
        return data;
      }),
    },
  },
}));

vi.mock("../redis.js", () => ({
  redis: {
    get: vi.fn(async () => null),
    exists: vi.fn(async () => 0),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    call: vi.fn(async () => null),
  },
  pingRedis: vi.fn(async () => true),
}));
vi.mock("../integrations/discord.js", () => ({ notifyAdminAction: vi.fn() }));
// Паролата: фалшив argon2 — хешът е „h:<парола>“.
vi.mock("../auth/passwords.js", () => ({
  hashPassword: vi.fn(async (p: string) => `h:${p}`),
  verifyPassword: vi.fn(async (hash: string, p: string) => hash === `h:${p}`),
}));

// nodemailer: какво би тръгнало и с какви параметри.
const sent: Array<Record<string, unknown>> = [];
const transports: Array<Record<string, unknown>> = [];
let verifyError: { code?: string } | null = null;
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn((opts: Record<string, unknown>) => {
      transports.push(opts);
      return {
        verify: vi.fn(async () => {
          if (verifyError) throw Object.assign(new Error("fail"), verifyError);
          return true;
        }),
        sendMail: vi.fn(async (m: Record<string, unknown>) => {
          sent.push(m);
          return { messageId: "x" };
        }),
        close: vi.fn(),
      };
    }),
  },
}));

const { createApp } = await import("../app.js");
const { signAccessToken } = await import("../auth/tokens.js");
const { checkMailInput, resetMailCache } = await import("../email/settings.js");
const { sendEmail } = await import("../email/mailer.js");
const { openSmtpPassword, sealSmtpPassword } = await import("../email/secrets.js");
const app = createApp();

const ORIGIN = "http://localhost:4502";
const as = (id: string) => {
  const u = users.get(id)!;
  return [`aso_at=${signAccessToken({ sub: u.id, role: u.role, locale: "bg" })}`];
};
const call = (method: "get" | "put" | "post", path: string, who: string, body?: object) => {
  const r = request(app)[method](path).set("Origin", ORIGIN).set("Cookie", as(who));
  return body ? r.send(body) : r;
};

const BREVO = {
  host: "smtp-relay.brevo.com",
  port: 587,
  username: "8a1b2c001@smtp-brevo.com",
  password: "xsmtpsib-SEKRET-123",
  fromName: "АСО",
  fromEmail: "no-reply@gaming.carbonstealth.eu",
  accountPassword: "owner-pass",
};

beforeEach(() => {
  users.clear();
  users.set("owner", { id: "owner", email: "owner@example.com", passwordHash: "h:owner-pass", displayName: "Собственик", role: "OWNER", deletedAt: null });
  users.set("admin", { id: "admin", email: "admin@example.com", passwordHash: "h:x", displayName: "Админ", role: "ADMIN", deletedAt: null });
  mailRow = null;
  auditRows = [];
  sent.length = 0;
  transports.length = 0;
  verifyError = null;
  resetMailCache();
});
afterEach(() => vi.clearAllMocks());

describe("права и изглед", () => {
  it("само OWNER: ADMIN получава 403 за всички действия", async () => {
    expect((await call("get", "/api/admin/mail", "admin")).status).toBe(403);
    expect((await call("put", "/api/admin/mail", "admin", BREVO)).status).toBe(403);
    expect((await call("post", "/api/admin/mail/test", "admin")).status).toBe(403);
    expect(mailRow).toBeNull();
  });

  it("нищо записано: изгледът казва откъде тръгват писмата (никъде) и че ключът за шифроване го има", async () => {
    const res = await call("get", "/api/admin/mail", "owner");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settings: null, hasPassword: false, source: null, keyReady: true });
  });
});

describe("запис", () => {
  it("записва Brevo: ключът е шифрован, не се връща и не влиза в одита; писмата тръгват от панела", async () => {
    const res = await call("put", "/api/admin/mail", "owner", BREVO);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("console");
    expect(res.body.settings).toMatchObject({ host: "smtp-relay.brevo.com", port: 587, username: BREVO.username, active: true });
    expect(JSON.stringify(res.body)).not.toContain("SEKRET");
    expect(mailRow!.passwordEnc).not.toContain("SEKRET");
    expect(openSmtpPassword(mailRow!.passwordEnc)).toBe(BREVO.password);
    expect(auditRows.map((a) => a.action)).toEqual(["mail_settings_saved"]);
    expect(auditRows[0]!.detail).not.toContain("SEKRET");
    expect(auditRows[0]!.detail).not.toContain(BREVO.username);
  });

  it("грешна парола на акаунта → 403, нищо не се записва", async () => {
    const res = await call("put", "/api/admin/mail", "owner", { ...BREVO, accountPassword: "грешна" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("wrong_password");
    expect(mailRow).toBeNull();
  });

  it("първи запис без ключ → password_required; невалиден порт → 400", async () => {
    const noKey = await call("put", "/api/admin/mail", "owner", { ...BREVO, password: "" });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe("password_required");
    expect((await call("put", "/api/admin/mail", "owner", { ...BREVO, port: 25 })).status).toBe(400);
    expect(mailRow).toBeNull();
  });

  it("празен ключ пази записания; друг сървър или логин със записания ключ → ключът се пише наново", async () => {
    await call("put", "/api/admin/mail", "owner", BREVO);
    const enc = mailRow!.passwordEnc;
    const keep = await call("put", "/api/admin/mail", "owner", { ...BREVO, password: "", fromName: "АСО Игри" });
    expect(keep.status).toBe(200);
    expect(mailRow!.passwordEnc).toBe(enc);
    expect(mailRow!.fromName).toBe("АСО Игри");

    const moved = await call("put", "/api/admin/mail", "owner", { ...BREVO, password: "", host: "smtp.example.com" });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe("password_new_server");
    expect(mailRow!.host).toBe("smtp-relay.brevo.com");
  });

  it("в продукция сървърът е име на хост — не IP, не localhost", () => {
    const input = { ...BREVO };
    expect(() => checkMailInput({ ...input, host: "10.0.0.5" }, null, true)).toThrow(/Невалиден/);
    expect(() => checkMailInput({ ...input, host: "localhost" }, null, true)).toThrow(/Невалиден/);
    expect(() => checkMailInput(input, null, true)).not.toThrow();
  });
});

describe("пробно писмо, изключване и истинските писма", () => {
  it("пробното писмо тръгва до собственика с подателя от панела", async () => {
    await call("put", "/api/admin/mail", "owner", BREVO);
    const res = await call("post", "/api/admin/mail/test", "owner");
    expect(res.body).toEqual({ result: "sent", to: "owner@example.com" });
    expect(sent.at(-1)).toMatchObject({ to: "owner@example.com", from: { name: "АСО", address: BREVO.fromEmail } });
    expect(transports.at(-1)).toMatchObject({ host: "smtp-relay.brevo.com", port: 587, secure: false, requireTLS: true });
  });

  it("грешен ключ при Brevo → само кодът на грешката (EAUTH), без текста на сървъра", async () => {
    await call("put", "/api/admin/mail", "owner", BREVO);
    verifyError = { code: "EAUTH" };
    expect((await call("post", "/api/admin/mail/test", "owner")).body).toEqual({ result: "error", code: "EAUTH" });
    verifyError = { code: "нещо <с> адрес@x" };
    expect((await call("post", "/api/admin/mail/test", "owner")).body).toEqual({ result: "error", code: "EUNKNOWN" });
  });

  it("без поща пробното писмо казва „изключено“", async () => {
    expect((await call("post", "/api/admin/mail/test", "owner")).body).toEqual({ result: "disabled" });
  });

  it("писмата на портала (потвърждение, нова парола) тръгват през настройката от панела", async () => {
    await call("put", "/api/admin/mail", "owner", BREVO);
    await sendEmail({ to: "player@example.com", subject: "Потвърди", text: "t", html: "<p>t</p>" });
    expect(sent.at(-1)).toMatchObject({ to: "player@example.com", from: { name: "АСО", address: BREVO.fromEmail } });
  });

  it("изключване с паролата: настройката остава записана, писмата вече не тръгват от нея", async () => {
    await call("put", "/api/admin/mail", "owner", BREVO);
    expect((await call("post", "/api/admin/mail/disable", "owner", { accountPassword: "грешна" })).status).toBe(403);
    const res = await call("post", "/api/admin/mail/disable", "owner", { accountPassword: "owner-pass" });
    expect(res.status).toBe(200);
    expect(res.body.source).toBeNull();
    expect(res.body.settings.active).toBe(false);
    expect(mailRow).not.toBeNull();
  });
});

describe("шифроването", () => {
  it("всяко шифроване е различно, а подправен запис не се отваря", () => {
    const a = sealSmtpPassword("ключ");
    const b = sealSmtpPassword("ключ");
    expect(a).not.toBe(b);
    expect(openSmtpPassword(a)).toBe("ключ");
    const parts = a.split(".");
    parts[3] = Buffer.from("подправено").toString("base64url");
    expect(openSmtpPassword(parts.join("."))).toBeNull();
    expect(openSmtpPassword("боклук")).toBeNull();
  });
});

// backend/src/__tests__/formTierStrip.test.js
// Свалянето на плана сваля и ФУНКЦИИТЕ на формите.
//
// ДЕФЕКТЪТ (червен екип, 07.08.2026): premium полетата на формите се гейтваха
// САМО при запис (`routes/forms.js`). Клиент, конфигурирал cooldown, таван на
// подаванията, regex валидация и разклоняване, докато е плащал, продължаваше да
// ги ползва след свалянето: `routes/bot.js` връщаше формите сурови, а
// `applicationSubmit.js` изпълняваше правилата, без изобщо да пита за тарифа.
// Панелите вече бяха покрити (`sanitizePanelForTier`); формите — не.
//
// Дефектен клас Г: гейт на ЗАПИСА, не на ИЗПЪЛНЕНИЕТО. Записът е една врата;
// изпълнението е единственото място, което наистина решава.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrismaMock } from "./testUtils/prismaMock.js";

// `vi.mock` се вдига на върха на файла, затова моковете живеят ТУК, не в
// describe блока, който ги ползва.
const prismaMock = createPrismaMock();
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

// Частичен мок: `sanitizeFormForTier` остава НАСТОЯЩАТА реализация (тя е
// предметът на теста), подменяме само разрешаването на тарифата.
let tierPlan = "free";
vi.mock("../lib/premium.js", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    getServerTier: vi.fn(async () => ({ plan: tierPlan, isPremium: tierPlan !== "free" })),
  };
});

const { sanitizeFormForTier } = await import("../lib/premium.js");
const { submitApplication } = await import("../services/applicationSubmit.js");

const form = (over = {}) => ({
  id: "f1", serverId: "s1", closedAt: null,
  cooldownSeconds: 86400, maxSubmissions: 1,
  acceptRoleIds: ["r1"], denyRoleIds: ["r2"], removeRoleIds: ["r3"],
  acceptMessage: "приет", denyMessage: "отказан",
  pingRoleIds: ["p1"],
  questions: [{ id: "q1", validationRegex: "^\\d{4}$", validationMessage: "4 цифри", branches: { да: "q2" } }],
  ...over,
});

describe("безплатният план губи премиум полетата", () => {
  it("cooldown и таван падат", () => {
    const f = sanitizeFormForTier(form(), "free");
    expect(f.cooldownSeconds).toBe(0);
    expect(f.maxSubmissions).toBeNull();
  });

  it("автоматичните роли при преглед падат", () => {
    const f = sanitizeFormForTier(form(), "free");
    expect(f.acceptRoleIds).toEqual([]);
    expect(f.denyRoleIds).toEqual([]);
    expect(f.removeRoleIds).toEqual([]);
  });

  it("персонализираните DM съобщения падат", () => {
    const f = sanitizeFormForTier(form(), "free");
    expect(f.acceptMessage).toBeNull();
    expect(f.denyMessage).toBeNull();
  });

  it("regex валидацията и разклоняването падат на ниво ВЪПРОС", () => {
    const f = sanitizeFormForTier(form(), "free");
    expect(f.questions[0].validationRegex).toBeNull();
    expect(f.questions[0].validationMessage).toBeNull();
    expect(f.questions[0].branches).toBeNull();
  });

  it("базовите полета ОСТАВАТ — не режем повече от платеното", () => {
    const f = sanitizeFormForTier(form({ closedAt: new Date("2026-01-01") }), "free");
    expect(f.closedAt).toBeInstanceOf(Date);   // затварянето е базово
    expect(f.pingRoleIds).toEqual(["p1"]);     // не е премиум поле
    expect(f.questions).toHaveLength(1);       // въпросите не изчезват
  });
});

describe("платените планове запазват своето", () => {
  it("premium пази всичко от този набор", () => {
    const f = sanitizeFormForTier(form(), "premium");
    expect(f.cooldownSeconds).toBe(86400);
    expect(f.maxSubmissions).toBe(1);
    expect(f.acceptRoleIds).toEqual(["r1"]);
    expect(f.questions[0].validationRegex).toBe("^\\d{4}$");
    expect(f.questions[0].branches).toEqual({ да: "q2" });
  });

  it("whitelabel и agency също", () => {
    for (const plan of ["whitelabel", "agency5", "agency10"]) {
      const f = sanitizeFormForTier(form(), plan);
      expect(f.maxSubmissions, plan).toBe(1);
      expect(f.questions[0].branches, plan).toEqual({ да: "q2" });
    }
  });
});

describe("нула сривове по краищата", () => {
  it("null форма минава", () => {
    expect(sanitizeFormForTier(null, "free")).toBeNull();
  });

  it("форма без въпроси минава", () => {
    const f = sanitizeFormForTier({ cooldownSeconds: 60, maxSubmissions: 2 }, "free");
    expect(f.cooldownSeconds).toBe(0);
  });
});

// ─── Изпълнението, не само формата ──────────────────────────────────────────
// Горното доказва, че САНИТАЙЗЕРЪТ работи. Това доказва, че той е ВКЛЮЧЕН в
// пътя, който реално приема кандидатури — иначе поправката е мъртва функция.
describe("подаването УВАЖАВА тарифата, не само записаното в базата", () => {
  const BODY = { serverId: "s1", formId: "f1", userId: "u1", answers: { q1: "да" } };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.form.findUnique.mockResolvedValue(form());
    // Потребителят ВЕЧЕ е подал веднъж — при платен план това е стоп.
    prismaMock.formCooldown.findUnique.mockResolvedValue({
      submissionCount: 1, lastSubmittedAt: new Date(),
    });
    prismaMock.formCooldown.upsert.mockResolvedValue({});
    prismaMock.user.upsert.mockResolvedValue({});
    prismaMock.application.create.mockResolvedValue({ id: "a1" });
  });

  it("платен план: таванът СПИРА второто подаване", async () => {
    tierPlan = "premium";
    const r = await submitApplication(BODY);
    expect(r).toMatchObject({ ok: false, status: 429, code: "MAX_SUBMISSIONS" });
  });

  it("свален план: таванът вече не важи — платена функция без плащане не работи", async () => {
    tierPlan = "free";
    const r = await submitApplication(BODY);
    expect(r.ok).toBe(true);
  });
});

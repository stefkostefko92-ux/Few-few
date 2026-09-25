// bot/src/__tests__/formRejection.test.js
// Отказът на сървъра стига до КАНДИДАТА, не до лога.
//
// ДЕФЕКТЪТ (Кодаджията, одит кръг 2, 07.08.2026): сървърът получи нови гейтове
// (затворена форма → 403, изчерпан таван и активен cooldown → 429) — правила, за
// които клиентът ПЛАЩА. Само че ботът пращаше „Формулярът е изпратен“ ПРЕДИ
// самото подаване, а отказът излизаше като axios изключение, което общ catch
// гълташе. Кандидатът виждаше зелена отметка за кандидатура, която не
// съществува; екипът не получаваше нищо.
//
// Класът е познат: нов сървърен гейт без обновен клиент. Гейтът работи, а
// човекът срещу него е излъган — и нищо не гърми.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.API_SECRET = "test-secret"; // api.js спира старта без нея

// Тестваме РЕАЛНИЯ `submitApplication` срещу мокнат axios — той е мястото,
// където отказът или се превежда в отговор, или се губи като изключение.
const apiPost = vi.fn();
vi.mock("axios", () => ({
  default: {
    create: () => ({
      post: (...a) => apiPost(...a),
      get: vi.fn(), patch: vi.fn(), delete: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    }),
  },
}));

const { submitApplication } = await import("../utils/api.js");
const { rejectionText } = await import("../utils/formSession.js");

/** Отговор на axios при отказ (4xx хвърля). */
const reject = (status, data) =>
  Object.assign(new Error("Request failed"), { response: { status, data } });

beforeEach(() => vi.clearAllMocks());

describe("клиентът ПРЕВЕЖДА отказа, вместо да гърми", () => {
  it("затворена форма → ok:false с код, нула хвърляне", async () => {
    apiPost.mockRejectedValue(reject(403, { error: "closed", code: "FORM_CLOSED" }));
    const r = await submitApplication("s1", "f1", "u1", {});
    expect(r).toMatchObject({ ok: false, status: 403, code: "FORM_CLOSED" });
  });

  it("достигнат таван → ok:false MAX_SUBMISSIONS", async () => {
    apiPost.mockRejectedValue(reject(429, { error: "max", code: "MAX_SUBMISSIONS" }));
    const r = await submitApplication("s1", "f1", "u1", {});
    expect(r).toMatchObject({ ok: false, code: "MAX_SUBMISSIONS" });
  });

  it("cooldown → носи и оставащото време", async () => {
    apiPost.mockRejectedValue(reject(429, { error: "wait", code: "COOLDOWN", remainingSeconds: 3540 }));
    const r = await submitApplication("s1", "f1", "u1", {});
    expect(r).toMatchObject({ ok: false, code: "COOLDOWN", remainingSeconds: 3540 });
  });

  it("успех → ok:true с кандидатурата", async () => {
    apiPost.mockResolvedValue({ data: { id: "a1" } });
    const r = await submitApplication("s1", "f1", "u1", {});
    expect(r).toMatchObject({ ok: true, application: { id: "a1" } });
  });

  it("СЪРВЪРЕН срив (5xx) ОСТАВА изключение — авария не е „формата е затворена“", async () => {
    apiPost.mockRejectedValue(reject(500, { error: "boom" }));
    await expect(submitApplication("s1", "f1", "u1", {})).rejects.toThrow();
  });

  it("мрежова грешка също остава изключение", async () => {
    apiPost.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(submitApplication("s1", "f1", "u1", {})).rejects.toThrow("ECONNREFUSED");
  });
});

describe("съобщението към кандидата казва ПРИЧИНАТА", () => {
  it("всеки код дава РАЗЛИЧЕН текст — иначе отказът е безполезен", () => {
    const texts = ["FORM_CLOSED", "MAX_SUBMISSIONS", "COOLDOWN"].map((code) =>
      rejectionText({ ok: false, code, remainingSeconds: 120 }, "en"),
    );
    expect(new Set(texts).size, `съвпадащи текстове: ${texts.join(" | ")}`).toBe(3);
    for (const txt of texts) expect(txt).toBeTruthy();
  });

  it("cooldown показва оставащото време в текста", () => {
    expect(rejectionText({ ok: false, code: "COOLDOWN", remainingSeconds: 3540 }, "en")).toMatch(/59m/);
    expect(rejectionText({ ok: false, code: "COOLDOWN", remainingSeconds: 45 }, "en")).toMatch(/45s/);
    expect(rejectionText({ ok: false, code: "COOLDOWN", remainingSeconds: 7200 }, "en")).toMatch(/2h/);
    expect(rejectionText({ ok: false, code: "COOLDOWN", remainingSeconds: 200_000 }, "en")).toMatch(/3d/);
  });

  it("работи на български — отказът е част от продукта, не техническа грешка", () => {
    const bg = rejectionText({ ok: false, code: "FORM_CLOSED" }, "bg");
    const en = rejectionText({ ok: false, code: "FORM_CLOSED" }, "en");
    expect(bg).not.toBe(en);
    expect(bg).toMatch(/[а-яА-Я]/);
  });

  it("непозната причина НЕ се измисля — ползва се текстът на сървъра", () => {
    const txt = rejectionText({ ok: false, code: "НЕЩО_НОВО", error: "конкретна причина" }, "en");
    expect(txt).toBe("конкретна причина");
  });

  it("непозната причина без текст пада на общото съобщение, не на празно", () => {
    expect(rejectionText({ ok: false, code: "НЕЩО_НОВО" }, "en")).toBeTruthy();
  });
});

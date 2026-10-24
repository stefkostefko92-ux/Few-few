import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BUSINESS_CATEGORY_LABELS } from "@/lib/categories";
import { createRateLimiter } from "@/lib/ratelimit-core";
import { RESERVED_BUSINESS_SLUGS, businessSlug } from "@/lib/business-form";
import { screenBusinessSubmission } from "@/app/biznes/nova/schema";

// Формата „Добавете своя бизнес“ (/biznes/nova): адрес и ред на проверките.

test("businessSlug: „Нова“/„NOVA“ не получава адреса на формата /biznes/nova", () => {
  assert.equal(businessSlug("Нова", []), "nova-2");
  assert.equal(businessSlug("NOVA", []), "nova-2");
  assert.equal(businessSlug("Nova", ["nova-2"]), "nova-3");
  // Обикновените имена — както преди.
  assert.equal(businessSlug("Аптека Нова", []), "apteka-nova");
  assert.equal(businessSlug("Хлебарница", ["hlebarnitsa"]), "hlebarnitsa-2");
  assert.equal(businessSlug("Хлебарница", new Set<string>()), "hlebarnitsa");
});

test("всеки статичен път под /biznes/ е в RESERVED_BUSINESS_SLUGS", () => {
  const dir = join(process.cwd(), "src/app/biznes");
  const statics = readdirSync(dir).filter(
    (n) => statSync(join(dir, n)).isDirectory() && !n.startsWith("[") && !n.startsWith("("),
  );
  assert.ok(statics.includes("nova"));
  for (const s of statics) assert.ok(RESERVED_BUSINESS_SLUGS.includes(s), `/biznes/${s} липсва в запазените`);
});

const VALID: Record<string, string> = {
  za: "",
  name: "Хлебарница „Житен клас“",
  // Категорията трябва да е от позволените — взимаме първата.
  category: Object.keys(BUSINESS_CATEGORY_LABELS)[0],
  description: "",
  address: "ул. „Христо Ботев“ 5",
  phone: "0888 123 456",
  hours: "",
  websiteUrl: "",
  facebook: "",
  note: "",
  contactName: "Петър",
  contactPhone: "0888 123 456",
  contactEmail: "",
  consent: "on",
};

function limiter() {
  const rl = createRateLimiter();
  let calls = 0;
  const now = Date.UTC(2026, 9, 23, 12);
  return {
    // Същото като rateLimit() по подразбиране: 6 за 10 минути.
    allow: () => {
      calls++;
      return rl.hit("biznes:203.0.113.7", 6, 10 * 60 * 1000, now);
    },
    calls: () => calls,
  };
}

test("screenBusinessSubmission: невалидните не се броят в лимита", async () => {
  const ok = VALID;
  const l = limiter();
  for (let i = 0; i < 10; i++) {
    const r = await screenBusinessSubmission({ values: { ...ok, consent: "" }, homepage: "" }, l.allow);
    assert.equal(r.status, "invalid");
  }
  assert.equal(l.calls(), 0);
  const r = await screenBusinessSubmission({ values: ok, homepage: "" }, l.allow);
  assert.equal(r.status, "ok");
  if (r.status === "ok") assert.equal(r.data.name, "Хлебарница „Житен клас“");
});

test("screenBusinessSubmission: лимитът спира седмото валидно подаване", async () => {
  const ok = VALID;
  const l = limiter();
  for (let i = 0; i < 6; i++) {
    assert.equal((await screenBusinessSubmission({ values: ok, homepage: "" }, l.allow)).status, "ok");
  }
  assert.equal((await screenBusinessSubmission({ values: ok, homepage: "" }, l.allow)).status, "limited");
});

test("screenBusinessSubmission: honeypot е първата проверка", async () => {
  const ok = VALID;
  const l = limiter();
  assert.equal((await screenBusinessSubmission({ values: ok, homepage: "http://spam" }, l.allow)).status, "honeypot");
  assert.equal((await screenBusinessSubmission({ values: {}, homepage: "x" }, l.allow)).status, "honeypot");
  assert.equal(l.calls(), 0);
});

test("screenBusinessSubmission: съобщението за грешка е от схемата", async () => {
  const ok = VALID;
  const r = await screenBusinessSubmission({ values: { ...ok, contactPhone: "", contactEmail: "" }, homepage: "" }, () => true);
  assert.equal(r.status, "invalid");
  if (r.status === "invalid") assert.match(r.error, /телефон или имейл/);
});

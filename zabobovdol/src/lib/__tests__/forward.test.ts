import test from "node:test";
import assert from "node:assert/strict";
import { complaintMail, dumpMail, forwardNote, parseRecipient } from "@/lib/forward-core";

const complaint = {
  refCode: "BD-7K2Q",
  category: "Пътища",
  subject: "Дупка на ул. „Христо Ботев“",
  location: "ул. „Христо Ботев“ 12",
  message: "Голяма дупка пред входа.",
  name: "Иван Иванов",
  email: "ivan@example.com",
  phone: "0888 123 456",
};

test("препращане: писмото за сигнал съдържа кода, текста и данните на подателя", () => {
  const m = complaintMail(complaint, "zabobovdol.carbonstealth.eu");
  assert.equal(m.subject, "Сигнал BD-7K2Q: Дупка на ул. „Христо Ботев“");
  for (const part of ["BD-7K2Q", "Пътища", "ул. „Христо Ботев“ 12", "Голяма дупка", "Иван Иванов", "ivan@example.com", "0888 123 456"])
    assert.ok(m.text.includes(part), part);
  assert.ok(!m.text.includes("Бележка от екипа"));
});

test("препращане: бележката на екипа влиза в писмото, само ако има такава", () => {
  const m = complaintMail(complaint, "x.bg", "Моля за спешен отговор.");
  assert.match(m.text, /Бележка от екипа на „За Бобов дол“:\nМоля за спешен отговор\./);
});

test("препращане: празни полета на подателя са „—“, без празно местоположение", () => {
  const m = complaintMail({ ...complaint, name: "", email: "", phone: "", location: "" }, "x.bg");
  assert.match(m.text, /Име: —\nИмейл: —\nТелефон: —/);
  assert.ok(!m.text.includes("Местоположение"));
});

test("препращане: сметище — БЕЗ личните данни на подателя (те са само вътрешни)", () => {
  const m = dumpMail(
    {
      location: "до моста на р. Елешница",
      description: "Строителни отпадъци и гуми.",
      photoUrl: "https://example.com/snimka.jpg",
      createdAt: new Date("2026-11-10T09:00:00Z"),
      reporterName: "Мария Петрова",
      reporterPhone: "0899 111 222",
      reporterEmail: "maria@example.com",
    },
    "zabobovdol.carbonstealth.eu",
    "zabobovdol@carbonstealth.eu",
  );
  assert.equal(m.subject, "Сигнал за нерегламентирано сметище: до моста на р. Елешница");
  assert.ok(m.text.includes("Строителни отпадъци"));
  assert.ok(m.text.includes("https://example.com/snimka.jpg"));
  assert.ok(m.text.includes("10.11.2026"));
  for (const pii of ["Мария", "0899", "maria@"]) assert.ok(!m.text.includes(pii), pii);
  assert.ok(m.text.includes("zabobovdol@carbonstealth.eu"), "как да се свържат с нас за подателя");
});

test("препращане: получателят — точно един адрес; без списъци и нови редове", () => {
  assert.deepEqual(parseRecipient("  Obshtina@BobovDol.egov.bg "), { ok: true, email: "obshtina@bobovdol.egov.bg" });
  for (const bad of ["", "a@b", "a@b.bg, c@d.bg", "a@b.bg;c@d.bg", "a@b.bg\r\nBcc: x@y.z", "Иван <a@b.bg>", "a b@c.bg", "x".repeat(250) + "@b.bg"])
    assert.equal(parseRecipient(bad).ok, false, JSON.stringify(bad));
});

test("препращане: бележка в историята на сметището — дата и получател, добавя се отдолу", () => {
  const d = new Date("2026-11-16T10:30:00Z");
  assert.equal(forwardNote("", "a@b.bg", d), "16.11.2026 — препратен до a@b.bg");
  assert.equal(forwardNote("Стара бележка", "a@b.bg", d), "Стара бележка\n16.11.2026 — препратен до a@b.bg");
});

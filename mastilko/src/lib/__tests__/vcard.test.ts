import test from "node:test";
import assert from "node:assert/strict";
import { vCard } from "../vcard";

test("vCard: пълен контакт с екраниране и https по подразбиране", () => {
  const v = vCard({
    name: "Мария Иванова",
    role: "Сладкар",
    company: "Сладкарница; Мечта",
    phone: "+359 88 123 4567",
    email: "maria@mechta.bg",
    website: "mechta.bg",
  });
  assert.ok(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0"));
  assert.ok(v.includes("FN:Мария Иванова"));
  assert.ok(v.includes("ORG:Сладкарница\\; Мечта"), "; трябва да е екранирано");
  assert.ok(v.includes("URL:https://mechta.bg"), "URL получава https://");
  assert.ok(v.endsWith("END:VCARD"));
});

test("vCard: празните полета не създават редове", () => {
  const v = vCard({ name: "Иван" });
  assert.ok(!v.includes("TEL"));
  assert.ok(!v.includes("EMAIL"));
  assert.ok(!v.includes("URL"));
  assert.ok(!v.includes("ORG"));
});

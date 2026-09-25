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

test("vCard: самостоятелен CR се екранира — не вкарва ново свойство", () => {
  // Скенерите цепят по /\r\n|\r|\n/; неекраниран \r вкарваше чужд TEL в QR-а.
  const out = vCard({ name: "Мария\rTEL:+359888000000" });
  assert.ok(!/\r(?!\n)/.test(out), "не трябва да остава самостоятелен CR");
  assert.ok(out.includes("FN:Мария\\nTEL:+359888000000"), "CR-ът е екраниран в полето");
  // Единственият TEL ред трябва да липсва (не сме подавали телефон).
  const telLines = out.split("\r\n").filter((l) => l.startsWith("TEL"));
  assert.equal(telLines.length, 0);
});

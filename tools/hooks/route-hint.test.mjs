// route-hint.test.mjs — подсказката за наш агент: хваща ясните задачи, мълчи на празното.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hintFor } from "../../.claude/hooks/route-hint.mjs";

test("ясна задача → нашият агент по име и id, с потока на екипа и правилото", () => {
  const h = hintFor("прегледай PR-а за сигурност на medqr — proxy-addr и nodemailer");
  assert.match(h, /subagent_type: kodadjiyata/);
  assert.match(h, /Кодаджията/);
  assert.match(h, /поток:/);
  assert.match(h, /пускай нашия/);
});

test("парите отиват при Продавача, касата при Касаджията", () => {
  assert.match(hintFor("добави Stripe checkout за месечен абонамент в linketto"), /subagent_type: prodavacha/);
  assert.match(hintFor("фискален бон и сторно в CSPos касата"), /subagent_type: kasadjiyata/);
});

test("кратко „ок“/„продължи“ и нищо неразпознато → без подсказка (без шум)", () => {
  assert.equal(hintFor("ок"), "");
  assert.equal(hintFor("продължи"), "");
  assert.equal(hintFor("какво е времето утре в София следобед"), "");
});

// Демо стенд: включва се само изрично, замразява само демо акаунтите.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_DEMO,
  PASSWORD_DEMO,
  MESSAGGIO_DEMO,
  demoAttiva,
  eAccountDemo,
  accountBloccatoDemo,
} from "../demo";
import { mfaImposta } from "../password-policy";

test("демо режимът е само изричното DEMO=1", () => {
  assert.equal(demoAttiva({}), false);
  assert.equal(demoAttiva({ DEMO: "" }), false);
  assert.equal(demoAttiva({ DEMO: "true" }), false);
  assert.equal(demoAttiva({ DEMO: "1" }), true);
});

test("демо акаунтите са седемте от сийда, по едно на ниво", () => {
  assert.equal(ACCOUNT_DEMO.length, 7);
  assert.equal(new Set(ACCOUNT_DEMO.map((a) => a.livello)).size, 7);
  assert.ok(
    ACCOUNT_DEMO.every((a) => a.email.endsWith("@erp-ascensori.local")),
  );
  assert.equal(PASSWORD_DEMO, "Ascensori!2026");
  assert.ok(eAccountDemo("  Direzione@ERP-ascensori.local "));
  assert.equal(eAccountDemo("titolare@azienda.it"), false);
  assert.equal(eAccountDemo(null), false);
});

test("замразени са само демо акаунтите и само в демо режим", () => {
  const demo = { DEMO: "1" };
  assert.equal(accountBloccatoDemo("master@erp-ascensori.local", demo), true);
  assert.equal(accountBloccatoDemo("vero@azienda.it", demo), false);
  assert.equal(accountBloccatoDemo("master@erp-ascensori.local", {}), false);
  assert.match(MESSAGGIO_DEMO, /demo/);
});

test("в демо режим вторият фактор не се налага, дори в продукция", () => {
  assert.equal(mfaImposta({ NODE_ENV: "production" }), true);
  assert.equal(mfaImposta({ NODE_ENV: "production", DEMO: "1" }), false);
});

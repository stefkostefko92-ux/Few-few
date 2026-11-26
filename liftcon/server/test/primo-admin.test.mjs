// Първият MASTER при деплоя (спецификация т. 18): имейл и парола от stdin, само ако няма потребители.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../dist/store/memory.js";
import { creaPrimoMaster, leggiCredenziali } from "../dist/primo-admin.js";
import { verificaPassword } from "../dist/auth/password.js";

const PW = "tramonto sul naviglio 2026";

test("създава MASTER без задължителна смяна на паролата; имейлът се нормализира", async () => {
  const store = memoryStore();
  const r = await creaPrimoMaster(store, { email: "  Info@LiftCon.it ", password: PW });
  assert.deepEqual(r, { ok: true });
  const u = await store.utenti.perEmail("info@liftcon.it");
  assert.ok(u);
  assert.equal(u.ruolo, "MASTER");
  assert.equal(u.cambiarePassword, false);
  assert.equal(u.totpAttivaDal, null, "2FA се настройва при първия вход");
  assert.equal(await verificaPassword(u.passwordHash, PW), true);
});

test("отказва, ако вече има потребители (не е задна врата за втори акаунт)", async () => {
  const store = memoryStore();
  await creaPrimoMaster(store, { email: "info@liftcon.it", password: PW });
  assert.deepEqual(await creaPrimoMaster(store, { email: "altro@liftcon.it", password: PW }), { ok: false, errore: "esiste" });
  assert.equal(await store.utenti.conta(), 1);
});

test("грешен имейл и слаба парола се отказват с причина; нищо не се създава", async () => {
  const store = memoryStore();
  assert.deepEqual(await creaPrimoMaster(store, { email: 'x"><b>@a.it', password: PW }), { ok: false, errore: "email" });
  assert.deepEqual(await creaPrimoMaster(store, { email: "info@liftcon.it", password: "corta" }), { ok: false, errore: "corta" });
  assert.deepEqual(await creaPrimoMaster(store, { email: "info@liftcon.it", password: "password12345" }), { ok: false, errore: "comune" });
  assert.deepEqual(await creaPrimoMaster(store, { email: "mario.rossi@liftcon.it", password: "rossi tutti i giorni 2026" }), { ok: false, errore: "personale" });
  assert.equal(await store.utenti.conta(), 0);
});

test("регистърът пази събитието без паролата", async () => {
  const store = memoryStore();
  await creaPrimoMaster(store, { email: "info@liftcon.it", password: PW });
  const eventi = await store.eventi.ultimi(10, 0);
  const e = eventi.find((x) => x.azione === "utente.creato");
  assert.ok(e, "има събитие utente.creato");
  assert.deepEqual(e.dettagli, { ruolo: "MASTER", origine: "deploy" });
  assert.doesNotMatch(JSON.stringify(eventi), /tramonto/);
});

test("stdin: ред 1 имейл, ред 2 парола (интервалите в паролата се пазят, само краят на реда се маха)", () => {
  assert.deepEqual(leggiCredenziali(`info@liftcon.it\r\n  ${PW} \n`), { email: "info@liftcon.it", password: `  ${PW} ` });
  assert.deepEqual(leggiCredenziali("info@liftcon.it\n"), { email: "info@liftcon.it", password: "" });
  assert.deepEqual(leggiCredenziali(""), { email: "", password: "" });
});

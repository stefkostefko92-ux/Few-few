// Единични тестове на сигурността (спецификация т. 1–3, 8 и матрицата на ролите).
import { test } from "node:test";
import assert from "node:assert/strict";
import { totpCodeAt, verifyTotp, base32Encode, otpauthUrl } from "../dist/auth/totp.js";
import { problemaPassword, hashPassword, verificaPassword } from "../dist/auth/password.js";
import { sigillo } from "../dist/auth/seal.js";
import { nuoviCodici, trovaCodice, normalizzaCodice, NUMERO_CODICI } from "../dist/auth/recupero.js";
import { puo, puoGestire, accessoAdmin } from "../dist/auth/ruoli.js";

const RFC = base32Encode(Buffer.from("12345678901234567890"));

test("TOTP: примерите на RFC 6238 (SHA1), последните 6 цифри", () => {
  for (const [t, kod] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]]) {
    assert.equal(totpCodeAt(RFC, Math.floor(t / 30)), kod, `t=${t}`);
  }
});

test("TOTP: ±1 стъпка се приема, повторен код в същия прозорец — не", () => {
  const t = 1_800_000_000;
  const step = Math.floor(t / 30);
  assert.equal(verifyTotp(RFC, totpCodeAt(RFC, step - 1), null, t), step - 1);
  assert.equal(verifyTotp(RFC, totpCodeAt(RFC, step + 2), null, t), null);
  const used = verifyTotp(RFC, totpCodeAt(RFC, step), null, t);
  assert.equal(verifyTotp(RFC, totpCodeAt(RFC, step), used, t), null);
  assert.equal(verifyTotp(RFC, "12345", null, t), null);
  assert.match(otpauthUrl("LiftCon", "a@b.it", RFC), /^otpauth:\/\/totp\/LiftCon%3Aa%40b\.it\?secret=/);
});

test("пароли: NIST правила (дължина, чести, лични) и argon2id", async () => {
  assert.equal(problemaPassword("corta"), "corta");
  assert.equal(problemaPassword("aaaaaaaaaaaaaaa"), "ripetitiva");
  assert.equal(problemaPassword("password123456"), "comune");
  assert.equal(problemaPassword("mario.bianchi.2026!", ["mario.bianchi@liftcon.it"]), "personale");
  assert.equal(problemaPassword("cavallo batteria graffetta"), null);
  const h = await hashPassword("cavallo batteria graffetta");
  assert.match(h, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.equal(await verificaPassword(h, "cavallo batteria graffetta"), true);
  assert.equal(await verificaPassword(h, "sbagliata sbagliata"), false);
});

test("шифроване на 2FA тайната: AES-GCM, подправен текст се отхвърля, ключът трябва да е 32 байта", () => {
  const s = sigillo("b".repeat(64));
  const c = s.cifra("totp-v1", "SEGRETO");
  assert.equal(s.decifra("totp-v1", c), "SEGRETO");
  assert.notEqual(s.cifra("totp-v1", "SEGRETO"), c, "различен IV всеки път");
  const rotto = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
  assert.throws(() => s.decifra("totp-v1", rotto));
  assert.throws(() => s.decifra("altro-uso", c), "друг етикет → друг ключ");
  assert.throws(() => sigillo("corta"));
});

test("резервни кодове: 10, еднократни, в базата само HMAC", () => {
  const s = sigillo("c".repeat(64));
  const { codici, hmac } = nuoviCodici(s);
  assert.equal(codici.length, NUMERO_CODICI);
  assert.ok(hmac.every((h) => /^[0-9a-f]{64}$/.test(h)) && !hmac.includes(codici[0]));
  assert.equal(trovaCodice(s, hmac, codici[3].toUpperCase().replace("-", " ")), 3);
  assert.equal(trovaCodice(s, hmac, "abcde-fghij"), -1);
  assert.equal(normalizzaCodice("0000000000"), "", "двусмислени знаци не са в азбуката");
});

test("роли: матрицата от спецификацията", () => {
  assert.equal(accessoAdmin("OPERATORE"), true);
  assert.equal(accessoAdmin("CLIENTE"), false);
  assert.equal(puo("OPERATORE", "richieste.modifica"), true);
  assert.equal(puo("OPERATORE", "richieste.elimina"), false);
  assert.equal(puo("RESPONSABILE", "contenuti.modifica"), true);
  assert.equal(puo("RESPONSABILE", "contenuti.pubblica"), false);
  assert.equal(puo("DIREZIONE", "contenuti.pubblica"), true);
  assert.equal(puo("DIREZIONE", "utenti.gestisci"), false);
  assert.equal(puo("ADMIN", "utenti.gestisci"), true);
});

test("роли: ADMIN не управлява MASTER/ADMIN и не дава роля ≥ своята; никой не сваля себе си", () => {
  const admin = { id: "a", ruolo: "ADMIN" };
  const master = { id: "m", ruolo: "MASTER" };
  assert.equal(puoGestire(admin, { id: "x", ruolo: "MASTER" }), false);
  assert.equal(puoGestire(admin, { id: "x", ruolo: "ADMIN" }), false);
  assert.equal(puoGestire(admin, { id: "x", ruolo: "OPERATORE" }, "DIREZIONE"), true);
  assert.equal(puoGestire(admin, { id: "x", ruolo: "OPERATORE" }, "ADMIN"), false);
  assert.equal(puoGestire(admin, null, "MASTER"), false);
  assert.equal(puoGestire(master, { id: "x", ruolo: "ADMIN" }, "MASTER"), true);
  assert.equal(puoGestire(master, master, "OPERATORE"), false);
  assert.equal(puoGestire({ id: "d", ruolo: "DIREZIONE" }, { id: "x", ruolo: "OPERATORE" }), false);
});

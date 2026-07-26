import test from "node:test";
import assert from "node:assert/strict";
import {
  validaPassword,
  passwordScaduta,
  mfaObbligatorio,
  LUNGHEZZA_MINIMA,
  LUNGHEZZA_MINIMA_PRIVILEGIATA,
  GIORNI_SCADENZA,
  RUOLI_MFA_OBBLIGATORIO,
} from "../password-policy";

test("дължината е основното изискване", () => {
  assert.equal(validaPassword("Corta1!").valida, false);
  assert.equal(validaPassword("a".repeat(LUNGHEZZA_MINIMA - 1)).valida, false);
  // Дълга фраза без специални знаци е ВАЛИДНА — това е смисълът на NIST 800-63B.
  assert.equal(validaPassword("cavallo batteria graffetta").valida, true);
});

test("привилегированите роли искат повече", () => {
  const p = "x".repeat(LUNGHEZZA_MINIMA) + "aBcD";
  const corta = "abcdefghijklm"; // 13 знака
  assert.equal(validaPassword(corta + "XY").valida, true);
  assert.equal(
    validaPassword("abcdefghijklm", { privilegiata: true }).valida,
    false,
  );
  assert.equal(validaPassword(p, { privilegiata: true }).valida, true);
  assert.equal(LUNGHEZZA_MINIMA_PRIVILEGIATA > LUNGHEZZA_MINIMA, true);
});

test("често срещаните пароли се отказват", () => {
  assert.equal(validaPassword("manutenzione").valida, false);
  assert.equal(validaPassword("AMMINISTRATORE").valida, false);
});

test("повтарящ се знак не носи ентропия", () => {
  const r = validaPassword("aaaaaaaaaaaaaaaa");
  assert.equal(r.valida, false);
  assert.match(r.errore ?? "", /ripetitiva/);
});

test("собствените данни в паролата се отказват", () => {
  const r = validaPassword("mariorossi2026!", {
    nome: "Mario",
    cognome: "Rossi",
  });
  assert.equal(r.valida, false);
  assert.match(r.errore ?? "", /nome/);
  assert.equal(
    validaPassword("amministrazione2026", {
      email: "amministrazione@azienda.it",
    }).valida,
    false,
  );
  // Къса част (под 4 знака) не блокира: иначе име „Li" забранява всяка парола с „li".
  assert.equal(
    validaPassword("collina tranquilla", { nome: "Li" }).valida,
    true,
  );
});

test("прекалено дълга парола се отказва", () => {
  assert.equal(validaPassword("x".repeat(201)).valida, false);
});

test("срокът на паролата", () => {
  const oggi = new Date("2026-07-25T00:00:00Z");
  const vecchia = new Date(oggi.getTime() - (GIORNI_SCADENZA + 1) * 86_400_000);
  const recente = new Date(oggi.getTime() - 10 * 86_400_000);
  assert.equal(passwordScaduta(vecchia, oggi), true);
  assert.equal(passwordScaduta(recente, oggi), false);
  // Никога несменяна: не блокираме първия вход на сийднат акаунт.
  assert.equal(passwordScaduta(null, oggi), false);
});

test("вторият фактор е задължителен за привилегированите роли", () => {
  assert.equal(mfaObbligatorio("MASTER"), true);
  assert.equal(mfaObbligatorio("ADMIN"), true);
  assert.equal(mfaObbligatorio("DIREZIONE"), false);
  assert.equal(mfaObbligatorio("TECNICO"), false);
});

test("вторият фактор е ЗАДЪЛЖИТЕЛЕН за нивата с ключове от системата", () => {
  // MASTER вижда всички фирми, ADMIN държи потребителите и настройките. Кражба
  // на такава парола е кражба на цялата инсталация; за останалите нива вторият
  // фактор е избор.
  assert.deepEqual([...RUOLI_MFA_OBBLIGATORIO], ["MASTER", "ADMIN"]);
  for (const r of ["MASTER", "ADMIN"]) assert.equal(mfaObbligatorio(r), true, r);
  for (const r of ["DIREZIONE", "RESPONSABILE", "TECNICO", "OPERATORE", "CLIENTE"])
    assert.equal(mfaObbligatorio(r), false, r);
});

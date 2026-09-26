// Политиката за ИИ: пет ключа, първият затворен печели — и казва най-общата причина.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidiAi,
  statoHttpAi,
  IMPOSTAZIONI_AI_PREDEFINITE as PRED,
} from "@/lib/ai/politica";

const base = {
  providerAttivo: true,
  cfg: PRED,
  ruolo: "TECNICO" as const,
  utenteConsentito: true,
  funzione: "testo" as const,
};

test("по подразбиране: вътрешните роли могат, CLIENTE — не", () => {
  assert.equal(decidiAi(base).consentita, true);
  assert.equal(decidiAi({ ...base, ruolo: "CLIENTE" }).motivo, "ruolo");
});

test("всеки ключ затваря сам", () => {
  assert.equal(decidiAi({ ...base, providerAttivo: false }).motivo, "provider");
  assert.equal(
    decidiAi({ ...base, cfg: { ...PRED, attiva: false } }).motivo,
    "globale",
  );
  assert.equal(
    decidiAi({ ...base, cfg: { ...PRED, testoAttiva: false } }).motivo,
    "funzione",
  );
  assert.equal(
    decidiAi({
      ...base,
      funzione: "estrai",
      cfg: { ...PRED, estraiAttiva: false },
    }).motivo,
    "funzione",
  );
  // Изключеното писане не спира четенето на документи — и обратно.
  assert.equal(
    decidiAi({
      ...base,
      funzione: "estrai",
      cfg: { ...PRED, testoAttiva: false },
    }).consentita,
    true,
  );
  assert.equal(
    decidiAi({ ...base, cfg: { ...PRED, ruoliAmmessi: ["ADMIN"] } }).motivo,
    "ruolo",
  );
  assert.equal(decidiAi({ ...base, utenteConsentito: false }).motivo, "utente");
});

test("най-общата причина печели: глобалното изключване, не акаунтът", () => {
  const e = decidiAi({
    ...base,
    cfg: { ...PRED, attiva: false },
    utenteConsentito: false,
  });
  assert.equal(e.motivo, "globale");
  assert.match(e.messaggio ?? "", /tutta l'installazione/);
});

test("решението на администратора стои пред липсващия доставчик", () => {
  assert.equal(
    decidiAi({ ...base, providerAttivo: false, utenteConsentito: false })
      .motivo,
    "utente",
  );
  assert.equal(
    decidiAi({
      ...base,
      providerAttivo: false,
      cfg: { ...PRED, attiva: false },
    }).motivo,
    "globale",
  );
});

test("липсващ доставчик е 503, решението на администратора — 403", () => {
  assert.equal(statoHttpAi(decidiAi({ ...base, providerAttivo: false })), 503);
  assert.equal(
    statoHttpAi(decidiAi({ ...base, utenteConsentito: false })),
    403,
  );
  assert.equal(decidiAi(base).messaggio, undefined);
});

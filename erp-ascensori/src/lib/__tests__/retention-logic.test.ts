import test from "node:test";
import assert from "node:assert/strict";
import {
  soglie,
  daEliminare,
  MESI_ACCESSO,
  ANNI_CONTABILE,
  MESI_ORDINARIO,
  GIORNI_TELEMETRIA,
  AZIONI_ACCESSO,
  ENTITA_CONTABILI,
  sogliaPerRiga,
} from "../retention-logic";

const OGGI = new Date("2026-07-25T00:00:00.000Z");

test("праговете следват законовите срокове", () => {
  const s = soglie(OGGI);
  assert.equal(s.accesso.toISOString(), "2026-01-25T00:00:00.000Z"); // -6 месеца
  assert.equal(s.contabile.toISOString(), "2016-07-25T00:00:00.000Z"); // -10 години
  assert.equal(s.ordinario.toISOString(), "2024-07-25T00:00:00.000Z"); // -24 месеца
  assert.equal(s.telemetria.toISOString(), "2026-04-26T00:00:00.000Z"); // -90 дни
  assert.equal(MESI_ACCESSO, 6);
  assert.equal(ANNI_CONTABILE, 10);
  assert.equal(MESI_ORDINARIO, 24);
  assert.equal(GIORNI_TELEMETRIA, 90);
});

test("вход отпреди 7 месеца се трие, отпреди 5 — не", () => {
  assert.equal(
    daEliminare(
      { azione: "LOGIN", createdAt: new Date("2025-12-25T00:00:00Z") },
      OGGI,
    ),
    true,
  );
  assert.equal(
    daEliminare(
      { azione: "LOGIN", createdAt: new Date("2026-02-25T00:00:00Z") },
      OGGI,
    ),
    false,
  );
});

test("фискалната следа надживява 7 месеца и пада чак след 10 години", () => {
  const fattura = { azione: "CREATE", entita: "fatture" };
  assert.equal(
    daEliminare(
      { ...fattura, createdAt: new Date("2025-12-25T00:00:00Z") },
      OGGI,
    ),
    false,
  );
  assert.equal(
    daEliminare(
      { ...fattura, createdAt: new Date("2015-01-01T00:00:00Z") },
      OGGI,
    ),
    true,
  );
});

test("НЕфискалната следа за служител пада след 24 месеца, не след 10 години", () => {
  // „UPDATE dipendente" не е счетоводен запис: чл. 2220 c.c. не го покрива,
  // а чл. 5(1)(в)+(д) GDPR не позволява да се пази десет години.
  const riga = { azione: "UPDATE", entita: "dipendenti" };
  assert.equal(
    daEliminare({ ...riga, createdAt: new Date("2025-12-25T00:00:00Z") }, OGGI),
    false,
  );
  assert.equal(
    daEliminare({ ...riga, createdAt: new Date("2023-01-01T00:00:00Z") }, OGGI),
    true,
  );
});

test("непознато ентитет получава КРАТКИЯ срок (безопасната посока за данните)", () => {
  // Ново ентитет, добавено утре, не бива да наследи десетгодишния фискален срок.
  const riga = { azione: "CREATE", entita: "firme_digitali" };
  assert.equal(
    daEliminare({ ...riga, createdAt: new Date("2023-01-01T00:00:00Z") }, OGGI),
    true,
  );
  assert.equal(
    daEliminare({ ...riga, createdAt: new Date("2025-12-25T00:00:00Z") }, OGGI),
    false,
  );
});

test("точно на прага редът остава (строго по-малко)", () => {
  const s = soglie(OGGI);
  assert.equal(
    daEliminare({ azione: "LOGIN", createdAt: s.accesso }, OGGI),
    false,
  );
  assert.equal(
    daEliminare(
      { azione: "LOGIN", createdAt: new Date(s.accesso.getTime() - 1) },
      OGGI,
    ),
    true,
  );
});

test("списъците, които решават срока, са затворени и непразни", () => {
  // Непознат ентитет получава КРАТКИЯ срок: за личните данни безопасната посока
  // е обратната на фискалната. Затова списъкът на фискалните е бял, не черен.
  assert.deepEqual([...AZIONI_ACCESSO], ["LOGIN", "LOGOUT"]);
  assert.ok(ENTITA_CONTABILI.length > 0);
  assert.equal(new Set(ENTITA_CONTABILI).size, ENTITA_CONTABILI.length);
});

test("прагът се смята за реда, не се предполага", () => {
  const oggi = new Date("2026-07-26T00:00:00Z");
  const per = (azione: string, entita: string) =>
    sogliaPerRiga({ azione, entita }, oggi).getTime();

  // Вход/изход: шест месеца (Provv. Garante 27.11.2008).
  const accesso = per("LOGIN", "users");
  // Фискална следа: десет години (чл. 2220 c.c.).
  const contabile = per("UPDATE", ENTITA_CONTABILI[0]);
  // Непознато: двайсет и четири месеца (чл. 5(1)(д) GDPR).
  const altro = per("UPDATE", "entita_mai_vista");

  assert.ok(accesso > altro, "входът се пази НАЙ-КРАТКО");
  assert.ok(altro > contabile, "фискалното се пази НАЙ-ДЪЛГО");
});

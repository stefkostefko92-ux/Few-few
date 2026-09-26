// Регистърът на операциите показва италиански етикети, не имената на
// таблиците. Тестът обхожда кода: нов `scriviAudit({ entita: "x" })` или нова
// CRUD конфигурация без етикет пада тук, а не пред клиента.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as etichette from "../enum-labels";

const { AZIONE_AUDIT, ENTITA_AUDIT, STATO_LABEL, etichetta } = etichette;

function fileTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" ? [] : fileTs(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("всяка засегната таблица в одита има италиански етикет", () => {
  const usate = new Set<string>();
  for (const f of fileTs(join(__dirname, "..", "..")))
    for (const m of readFileSync(f, "utf8").matchAll(/entita: "([a-z_]+)"/g))
      usate.add(m[1]);
  assert.ok(usate.size > 20, "обхождането намира записите");
  const mancanti = [...usate].filter((e) => !(e in ENTITA_AUDIT));
  assert.deepEqual(mancanti, []);
});

test("етикетът пада обратно на суровата стойност, ако я няма", () => {
  assert.equal(etichetta(ENTITA_AUDIT, "users"), "Utente");
  assert.equal(etichetta(ENTITA_AUDIT, "sconosciuta"), "sconosciuta");
  assert.equal(etichetta(AZIONE_AUDIT, "LOGIN"), "Accesso");
  assert.equal(etichetta(STATO_LABEL, "RIFIUTATA"), "Rifiutata dalla PA");
});

test("никоя таблица с етикети не е празна и никой етикет не е празен", () => {
  for (const [nome, v] of Object.entries(etichette)) {
    if (typeof v === "function") continue;
    const voci = Object.entries(v);
    assert.ok(voci.length > 0, `${nome} е празна`);
    for (const [k, t] of voci) assert.ok(t.trim(), `${nome}.${k} без текст`);
  }
});

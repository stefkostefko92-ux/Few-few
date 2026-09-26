// Прагове 90/60/30: еднократни известия; цветен статус на автопарка.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sogliePendenti,
  giorniRimanenti,
  statoAutomezzo,
} from "../scadenze-logic";

const OGGI = new Date("2026-07-25T00:00:00Z");
function fra(n: number): Date {
  return new Date(OGGI.getTime() + n * 86_400_000);
}
const base = {
  notificato90: false,
  notificato60: false,
  notificato30: false,
  completata: false,
};

test("на 100 дни — нищо; на 80 — само 90", () => {
  assert.deepEqual(
    sogliePendenti({ ...base, dataScadenza: fra(100) }, OGGI),
    [],
  );
  assert.deepEqual(
    sogliePendenti({ ...base, dataScadenza: fra(80) }, OGGI),
    [90],
  );
});

test("на 25 дни без изпратени — и трите наведнъж", () => {
  assert.deepEqual(
    sogliePendenti({ ...base, dataScadenza: fra(25) }, OGGI),
    [90, 60, 30],
  );
});

test("вече вдигнат флаг не се повтаря", () => {
  assert.deepEqual(
    sogliePendenti(
      {
        ...base,
        notificato90: true,
        notificato60: true,
        dataScadenza: fra(25),
      },
      OGGI,
    ),
    [30],
  );
});

test("completata изключва известията", () => {
  assert.deepEqual(
    sogliePendenti({ ...base, completata: true, dataScadenza: fra(10) }, OGGI),
    [],
  );
});

test("giorniRimanenti: просрочието е отрицателно", () => {
  assert.equal(giorniRimanenti(fra(10), OGGI), 10);
  assert.equal(giorniRimanenti(fra(-3), OGGI), -3);
});

test("statoAutomezzo: най-близката дата определя цвета", () => {
  assert.equal(statoAutomezzo([fra(100), fra(200), null], OGGI), "verde");
  assert.equal(statoAutomezzo([fra(30), fra(200), null], OGGI), "giallo");
  assert.equal(statoAutomezzo([fra(5), fra(200), fra(100)], OGGI), "rosso");
  assert.equal(statoAutomezzo([null, null, null], OGGI), "verde");
});

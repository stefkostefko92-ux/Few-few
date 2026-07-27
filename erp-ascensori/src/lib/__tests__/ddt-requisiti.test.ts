// Реквизитите на товарителницата — чл. 1, ал. 3 D.P.R. 472/1996.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  controllaDdt,
  validaDdt,
  type DdtDaControllare,
} from "@/lib/fiscale/ddt";
import { perInputDataOra } from "@/lib/format";

function completo(): DdtDaControllare {
  return {
    numero: "DDT-2026-0001",
    data: new Date("2026-03-10T08:00:00+01:00"),
    causale: "vendita",
    destinatario: "Condominio Via Roma 12",
    indirizzoConsegna: "Via Roma 12, 20100 Milano",
    vettore: null,
    inizioTrasporto: new Date("2026-03-10T14:30:00+01:00"),
    righe: [{ descrizione: "Fune di trazione 8 mm", quantita: 12, um: "m" }],
  };
}

test("документ с всички реквизити няма нито проблем, нито предупреждение", () => {
  const e = controllaDdt(completo());
  assert.deepEqual(e.problemi, []);
  assert.deepEqual(e.avvisi, []);
});

test("липсващият получател и липсващото основание са БЛОКИРАЩИ", () => {
  const p = validaDdt({ ...completo(), destinatario: "  ", causale: null });
  assert.equal(p.length, 2);
  assert.ok(p.some((x) => x.includes("destinatario")));
  assert.ok(p.some((x) => x.includes("causale")));
});

test("документ без редове не описва стока — блокиращо", () => {
  const p = validaDdt({ ...completo(), righe: [] });
  assert.ok(p.some((x) => x.includes("non ha righe")));
});

test("ред без описание е блокиращ, ред без мерна единица е само предупреждение", () => {
  const e = controllaDdt({
    ...completo(),
    righe: [
      { descrizione: "", quantita: 1, um: "pz" },
      { descrizione: "Pulsantiera", quantita: 1, um: null },
    ],
  });
  assert.equal(e.problemi.length, 1);
  assert.ok(e.problemi[0].includes("1 riga/e senza descrizione"));
  assert.equal(e.avvisi.length, 1);
  assert.ok(e.avvisi[0].includes("unità di misura"));
});

test("липсващият час на превоза предупреждава, но НЕ спира документа", () => {
  const e = controllaDdt({ ...completo(), inizioTrasporto: null });
  assert.deepEqual(e.problemi, []);
  assert.ok(e.avvisi.some((a) => a.includes("inizio del trasporto")));
});

test("невалидна дата се брои като липсваща, не като запълнена", () => {
  const e = controllaDdt({
    ...completo(),
    data: "non è una data",
    inizioTrasporto: "nemmeno questa",
  });
  assert.ok(e.problemi.some((x) => x.includes("data del documento")));
  assert.ok(e.avvisi.some((a) => a.includes("inizio del trasporto")));
});

test("превоз от трето лице без адрес на доставка се отбелязва", () => {
  const e = controllaDdt({
    ...completo(),
    vettore: "Trasporti Bianchi S.r.l.",
    indirizzoConsegna: null,
  });
  assert.deepEqual(e.problemi, []);
  assert.ok(e.avvisi.some((a) => a.includes("vettore")));
});

test("превоз от подателя без адрес НЕ вдига предупреждението за превозвач", () => {
  const e = controllaDdt({
    ...completo(),
    vettore: null,
    indirizzoConsegna: null,
  });
  assert.ok(!e.avvisi.some((a) => a.includes("vettore")));
});

test("липсващият номер е блокиращ — регистърът е по номер", () => {
  const p = validaDdt({ ...completo(), numero: null });
  assert.ok(p.some((x) => x.includes("numero progressivo")));
});

// ── Форматът за <input type="datetime-local"> ───────────────────────────────
//
// Тестът пинова часовата зона: без нея той минава на моята машина и пада на
// сървъра — точно провалът, който полето трябва да предотврати.

test("perInputDataOra дава МЕСТЕН стенен час, не UTC", () => {
  const originale = process.env.TZ;
  process.env.TZ = "Europe/Rome";
  try {
    // 14:30 в Рим през юли (UTC+2) е 12:30Z. През toISOString() полето би
    // показало 12:30 — час, в който камионът още не е тръгнал.
    assert.equal(
      perInputDataOra(new Date("2026-07-27T12:30:00Z")),
      "2026-07-27T14:30",
    );
    // Зимно време (UTC+1) — същият низ, различно отместване.
    assert.equal(
      perInputDataOra(new Date("2026-01-15T13:30:00Z")),
      "2026-01-15T14:30",
    );
  } finally {
    process.env.TZ = originale;
  }
});

test("perInputDataOra връща празно за липсваща и за невалидна стойност", () => {
  assert.equal(perInputDataOra(null), "");
  assert.equal(perInputDataOra(undefined), "");
  assert.equal(perInputDataOra(""), "");
  assert.equal(perInputDataOra("non è una data"), "");
});

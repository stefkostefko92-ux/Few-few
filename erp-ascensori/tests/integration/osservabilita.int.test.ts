// Метриките през реалния маршрут.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, BASE } from "./_client";

const TOKEN = process.env.HEALTH_TOKEN ?? "";

describe("метрики", () => {
  test("без токен маршрутът НЕ съществува", async () => {
    const res = await fetch(`${BASE}/api/metrics`);
    // 404, не 401: списъкът маршрути е карта на приложението за нападателя, а
    // 401 му потвърждава, че има какво да се търси.
    assert.equal(res.status, 404);
  });

  test("сгрешен токен също дава 404", async () => {
    const res = await fetch(`${BASE}/api/metrics`, { headers: { "x-health-token": "sbagliato" } });
    assert.equal(res.status, 404);
  });

  test("с валиден токен излиза формат за Prometheus", async (t) => {
    if (!TOKEN) return t.skip("HEALTH_TOKEN не е зададен в тестовата среда");
    // Една заявка, за да има какво да се брои.
    const s = await comeRuolo("ADMIN");
    assert.equal((await s.get("/api/impianti?size=1")).status, 200);

    const res = await fetch(`${BASE}/api/metrics`, { headers: { "x-health-token": TOKEN } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
    const corpo = await res.text();

    assert.match(corpo, /# TYPE erp_richieste_totale counter/);
    assert.match(corpo, /erp_richieste_totale\{.*rotta="\/api\/impianti".*\}/);
    // Шаблонът, не конкретният път: иначе всеки UUID става отделна серия и
    // Prometheus се задавя (а в етикета влизат данни на клиента).
    assert.equal(/rotta="\/api\/impianti\/[0-9a-f-]{36}"/.test(corpo), false);

    for (const nome of [
      "erp_ordini_aperti",
      "erp_fatture_scadute",
      "erp_scadenze_entro_30_giorni",
      "erp_automatismi_eta_secondi",
      "erp_rls_attiva",
    ])
      assert.match(corpo, new RegExp(`^${nome} `, "m"), `липсва ${nome}`);

    // Изолацията е включена в тестовата база — иначе алармата е безсмислена.
    assert.match(
      corpo,
      /^erp_rls_attiva 1$/m,
      "RLS не е в сила: пакетът върви с bootstrap роля (виж rls-catena.int.test.ts)",
    );
  });
});

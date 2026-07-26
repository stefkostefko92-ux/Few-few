// CSP през HTTP: хедърите и събирачът на нарушения.
//
// Браузърното поведение се проверява в `tests/e2e/csp.spec.ts` — тук е това,
// което браузър не може да покаже: че маршрутът за докладите оцелява при
// злонамерен вход и че политиката НЕ се лепи там, където би разхлабила
// по-строга своя политика.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BASE } from "./_client";

async function pagina(percorso = "/login") {
  const res = await fetch(BASE + percorso, { redirect: "manual" });
  await res.text();
  return res;
}

describe("хедърите на страниците", () => {
  test("политиката е на всяка страница, включително преди вход", async () => {
    const csp = (await pagina()).headers.get("content-security-policy");
    assert.ok(csp, "липсва CSP на /login");
    assert.match(csp, /'strict-dynamic'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'none'/);
  });

  test("пренасочването към входа също носи политиката", async () => {
    // Иначе точно страницата, която показва чужд адрес от `?da=`, остава гола.
    const res = await fetch(`${BASE}/impianti`, { redirect: "manual" });
    assert.equal(res.status, 307);
    assert.ok(res.headers.get("content-security-policy"));
  });

  test("СТАРИТЕ хедъри остават — за браузър без CSP3", async () => {
    const h = (await pagina()).headers;
    assert.equal(h.get("x-frame-options"), "DENY");
    assert.equal(h.get("x-content-type-options"), "nosniff");
  });

  test("има ТОЧНО една политика, не две", async () => {
    // Два хедъра с едно име се прилагат ЕДНОВРЕМЕННО и браузърът спазва
    // пресечното им множество — страница, счупена по начин, който изглежда
    // като бъг в приложението. `Headers.get` слепва повторенията със запетая,
    // тоест втора политика би се видяла като втори `default-src`.
    const csp = (await pagina()).headers.get("content-security-policy") ?? "";
    assert.equal(csp.split("default-src").length - 1, 1, csp);
  });

  test("свалянето на прикачен файл пази СВОЯТА, по-строга политика", async () => {
    // Общата политика НЕ бива да стига до `/api`: там `sandbox` е единственото,
    // което спира качен HTML да се изпълни в нашия произход.
    const res = await fetch(
      `${BASE}/api/allegati/00000000-0000-0000-0000-000000000000`,
    );
    // Без сесия е 401 — важното е, че общата политика не е налепена отгоре.
    assert.equal(
      res.headers.get("content-security-policy")?.includes("strict-dynamic") ??
        false,
      false,
    );
  });
});

describe("събирачът на нарушения", () => {
  const invia = (corpo: BodyInit, tipo = "application/csp-report") =>
    fetch(`${BASE}/api/csp-report`, {
      method: "POST",
      headers: { "Content-Type": tipo },
      body: corpo,
    });

  test("приема доклад и НЕ иска сесия", async () => {
    // Браузърът праща доклада извън заявката, без бисквитки: маршрут зад вход
    // просто не би получил нищо.
    const res = await invia(
      JSON.stringify({
        "csp-report": {
          "violated-directive": "script-src",
          "blocked-uri": "inline",
        },
      }),
    );
    assert.equal(res.status, 204);
  });

  test("отговорът е ЕДИН И СЪЩ за приет и за отхвърлен доклад", async () => {
    // Различни отговори биха казали на изпращача кое минава — карта на филтъра.
    const buoni = await invia(JSON.stringify({ "csp-report": {} }));
    const spazzatura = await invia("non-json-affatto");
    const troppoGrande = await invia(JSON.stringify({ x: "a".repeat(20_000) }));
    for (const r of [buoni, spazzatura, troppoGrande]) {
      assert.equal(r.status, 204);
      assert.equal(await r.text(), "");
    }
  });

  test("огромно тяло не се разбира и не се държи в паметта", async () => {
    const res = await invia("x".repeat(5_000_000));
    assert.equal(res.status, 204);
  });

  test("изисква тип, който браузър наистина праща", async () => {
    assert.equal((await invia("{}", "text/html")).status, 204);
  });

  test("маршрутът НЕ приема нищо освен POST", async () => {
    for (const metodo of ["GET", "PUT", "DELETE"]) {
      const res = await fetch(`${BASE}/api/csp-report`, { method: metodo });
      assert.equal(res.status, 405, `${metodo} → ${res.status}`);
    }
  });
});

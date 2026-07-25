// Публичното API и webhook-ите през реалните маршрути.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, PASSWORD, unico } from "./_client";

let admin: Sessione;
let master: Sessione;
let chiave: string;

before(async () => {
  admin = await comeRuolo("ADMIN");
  master = await comeRuolo("MASTER");
  const r = await admin.post<{ chiave: string }>("/api/chiavi", {
    etichetta: unico("Contabilità"),
    ambiti: ["impianti:read", "fatture:read"],
  });
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  chiave = r.dati.chiave;
});

async function conChiave(percorso: string, k = chiave) {
  const res = await fetch(BASE + percorso, { headers: { Authorization: `Bearer ${k}` } });
  return { status: res.status, dati: await res.json().catch(() => ({})) };
}

describe("ключове за публичното API", () => {
  test("ключът се показва ВЕДНЪЖ и после само с префикс", async () => {
    assert.match(chiave, /^ea_live_/);
    const lista = await admin.get<{ righe: Record<string, unknown>[] }>("/api/chiavi");
    assert.equal(lista.status, 200);
    for (const r of lista.dati.righe) {
      assert.equal("chiaveHash" in r, false, "отпечатъкът излиза навън");
      assert.equal(JSON.stringify(r).includes(chiave), false, "ключът се вижда втори път");
    }
  });

  test("ключ без права не се създава", async () => {
    const r = await admin.post("/api/chiavi", { etichetta: "Vuota", ambiti: [] });
    assert.equal(r.status, 400);
  });

  test("непознато право се отказва, вместо да стане тих отказ", async () => {
    const r = await admin.post("/api/chiavi", { etichetta: "X", ambiti: ["impianti:reed"] });
    assert.equal(r.status, 400);
  });

  test("под нивото на ADMIN ключове не се раздават", async () => {
    const oper = await comeRuolo("OPERATORE");
    assert.equal((await oper.get("/api/chiavi")).status, 403);
    assert.equal(
      (await oper.post("/api/chiavi", { etichetta: "X", ambiti: ["impianti:read"] })).status,
      403,
    );
  });
});

describe("достъп с ключ", () => {
  test("валиден ключ чете разрешеното", async () => {
    const r = await conChiave("/api/pubblica/v1/impianti?size=5");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray((r.dati as { righe: unknown[] }).righe));
  });

  test("без ключ и с непознат ключ — 401", async () => {
    const senza = await fetch(`${BASE}/api/pubblica/v1/impianti`);
    assert.equal(senza.status, 401);
    assert.equal((await conChiave("/api/pubblica/v1/impianti", "ea_live_inesistente")).status, 401);
    // Чужд формат не бива да стига до заявка към базата.
    const altro = await fetch(`${BASE}/api/pubblica/v1/impianti`, {
      headers: { Authorization: "Bearer sk_live_qualcosa" },
    });
    assert.equal(altro.status, 401);
  });

  test("липсващото ПРАВО е 403, не 401", async () => {
    // Ключът е истински; просто не може ордини.
    const r = await conChiave("/api/pubblica/v1/ordini");
    assert.equal(r.status, 403);
  });

  test("отмененият ключ спира да работи веднага", async () => {
    const creata = await admin.post<{ id: string; chiave: string }>("/api/chiavi", {
      etichetta: unico("Temp"),
      ambiti: ["impianti:read"],
    });
    assert.equal(creata.status, 201);
    assert.equal((await conChiave("/api/pubblica/v1/impianti", creata.dati.chiave)).status, 200);

    assert.equal(
      (await admin.richiesta("DELETE", `/api/chiavi/${creata.dati.id}`)).status,
      200,
    );
    assert.equal((await conChiave("/api/pubblica/v1/impianti", creata.dati.chiave)).status, 401);
  });

  test("публичното API НЕ издава вътрешни бележки", async () => {
    const k = await admin.post<{ chiave: string }>("/api/chiavi", {
      etichetta: unico("Ordini"),
      ambiti: ["ordini:read"],
    });
    const r = await conChiave("/api/pubblica/v1/ordini?size=5", k.dati.chiave);
    assert.equal(r.status, 200);
    const testo = JSON.stringify(r.dati);
    // Полето се казва точно така, защото не се показва на клиента.
    assert.equal(testo.includes("noteInterne"), false);
  });

  test("ключът вижда САМО своята фирма", async () => {
    const slug = unico("api-t").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra API",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-admin@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: PASSWORD,
          nome: "Admin",
          cognome: "Api",
          ruolo: "ADMIN",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email), 200);
    const kAltra = await altra.post<{ chiave: string }>("/api/chiavi", {
      etichetta: "Altra",
      ambiti: ["impianti:read"],
    });
    assert.equal(kAltra.status, 201);

    // Новата фирма няма импианти — ключът ѝ не бива да вижда чуждите.
    const r = await conChiave("/api/pubblica/v1/impianti", kAltra.dati.chiave);
    assert.equal(r.status, 200);
    assert.equal((r.dati as { totale: number }).totale, 0, "ключът вижда чужди импианти");
  });
});

describe("webhooks", () => {
  test("тайната се показва веднъж и не излиза в списъка", async () => {
    const r = await admin.post<{ id: string; segreto: string }>("/api/webhooks", {
      url: "https://esempio.test/hook",
      eventi: ["fattura.emessa"],
    });
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    assert.ok(r.dati.segreto.length > 20);

    const lista = await admin.get<{ righe: Record<string, unknown>[] }>("/api/webhooks");
    for (const w of lista.dati.righe)
      assert.equal("segreto" in w, false, "тайната за подписа излиза навън");
  });

  test("адрес към вътрешна мрежа се отказва (SSRF)", async () => {
    for (const url of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/hook",
      "https://192.168.1.10/hook",
      "https://172.16.0.1/hook",
    ]) {
      const r = await admin.post("/api/webhooks", { url, eventi: ["fattura.emessa"] });
      assert.equal(r.status, 400, `${url} трябва да се откаже`);
    }
  });

  test("HTTP без TLS не се приема", async () => {
    const r = await admin.post("/api/webhooks", {
      url: "http://esempio.test/hook",
      eventi: ["fattura.emessa"],
    });
    assert.equal(r.status, 400);
  });

  test("абонамент без събития не се създава", async () => {
    const r = await admin.post("/api/webhooks", { url: "https://esempio.test/x", eventi: [] });
    assert.equal(r.status, 400);
  });

  test("смяната на статус поражда доставка", async () => {
    const w = await admin.post<{ id: string }>("/api/webhooks", {
      url: "https://esempio.test/consegne",
      eventi: ["fattura.emessa"],
    });
    assert.equal(w.status, 201);

    const direzione = await comeRuolo("DIREZIONE");
    const f = await direzione.post<{ id: string }>("/api/fatture", {
      oggetto: unico("Hook"),
      tipo: "EMESSA",
    });
    assert.equal(f.status, 201);
    assert.equal(
      (await direzione.richiesta("PATCH", `/api/fatture/${f.dati.id}/stato`, { stato: "EMESSA" }))
        .status,
      200,
    );

    const lista = await admin.get<{ righe: { id: string; _count: { consegne: number } }[] }>(
      "/api/webhooks",
    );
    const mio = lista.dati.righe.find((r) => r.id === w.dati.id);
    assert.ok(mio, "абонаментът трябва да е в списъка");
    assert.ok(mio._count.consegne >= 1, "събитието не е записало доставка");
  });

  test("под нивото на ADMIN webhook не се създава", async () => {
    const oper = await comeRuolo("OPERATORE");
    assert.equal((await oper.get("/api/webhooks")).status, 403);
  });
});

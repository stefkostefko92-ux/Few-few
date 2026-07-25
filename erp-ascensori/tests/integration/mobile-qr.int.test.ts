// Мобилният достъп: QR стикер, дълбоката връзка и PWA обвивката.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, PASSWORD, unico } from "./_client";

let tecnico: Sessione;
let master: Sessione;
let impiantoId: string;
let matricola: string;

before(async () => {
  tecnico = await comeRuolo("TECNICO");
  master = await comeRuolo("MASTER");
  const lista = await tecnico.get<{ righe: { id: string; matricola: string }[] }>(
    "/api/impianti?size=1",
  );
  assert.equal(lista.status, 200);
  assert.ok(lista.dati.righe.length, "сийдът трябва да е създал импианти");
  impiantoId = lista.dati.righe[0].id;
  matricola = lista.dati.righe[0].matricola;
});

async function grezza(percorso: string, s?: Sessione) {
  const res = await fetch(BASE + percorso, {
    headers: s ? { Cookie: s.cookieHeader() } : {},
    redirect: "manual",
  });
  return { status: res.status, testo: await res.text(), headers: res.headers };
}

describe("QR етикет", () => {
  test("кодът излиза като SVG и сочи МАТРИКОЛАТА", async () => {
    const r = await grezza(`/api/impianti/${impiantoId}/qr`, tecnico);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /image\/svg\+xml/);
    assert.match(r.testo, /^<svg /);
    assert.match(r.headers.get("content-disposition") ?? "", /qr-.*\.svg/);
    // Кешът е ЧАСТЕН: адресът издава наличието на импианта.
    assert.match(r.headers.get("cache-control") ?? "", /private/);
  });

  test("под нивото на техника кодът не се дава", async () => {
    const cliente = await comeRuolo("CLIENTE");
    assert.equal((await grezza(`/api/impianti/${impiantoId}/qr`, cliente)).status, 403);
  });

  test("чужд импиант не дава код с познат идентификатор", async () => {
    const slug = unico("qr-t").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra QR",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-tec@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: PASSWORD,
          nome: "Tec",
          cognome: "Altra",
          ruolo: "TECNICO",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email), 200);
    assert.equal((await grezza(`/api/impianti/${impiantoId}/qr`, altra)).status, 404);
  });
});

describe("дълбока връзка от стикера", () => {
  test("без сесия стикерът НЕ издава нищо и пази целта", async () => {
    const r = await grezza(`/i/${encodeURIComponent(matricola)}`);
    assert.equal(r.status, 307, "трябва да пренасочи към вход");
    const posizione = r.headers.get("location") ?? "";
    assert.match(posizione, /\/login/);
    // Целта се пази: иначе техникът, чиято сесия е изтекла, трябва да сканира
    // повторно с телефон в ръка и отворен капак на шахтата.
    assert.match(posizione, /da=/);
    assert.match(decodeURIComponent(posizione), new RegExp(`/i/${matricola}`));
    // И нищо от съдържанието не изтича с пренасочването.
    assert.equal(r.testo.includes("Dati tecnici"), false);
  });

  test("със сесия отваря точно този импиант", async () => {
    const r = await grezza(`/i/${encodeURIComponent(matricola)}`, tecnico);
    assert.equal(r.status, 307);
    assert.match(r.headers.get("location") ?? "", new RegExp(`/impianti/${impiantoId}$`));
  });

  test("непозната матрикола дава 404, не изтичане", async () => {
    const r = await grezza("/i/NON-ESISTE-9999", tecnico);
    assert.equal(r.status, 404);
  });
});

describe("PWA обвивка", () => {
  test("манифестът е валиден и инсталируем", async () => {
    const r = await grezza("/manifest.webmanifest");
    assert.equal(r.status, 200);
    const m = JSON.parse(r.testo) as {
      name: string;
      start_url: string;
      display: string;
      icons: { src: string; purpose?: string }[];
    };
    assert.equal(m.display, "standalone");
    assert.ok(m.start_url.startsWith("/"));
    // Без maskable вариант Android изрязва иконата в кръг и отхапва краищата.
    assert.ok(m.icons.some((i) => i.purpose === "maskable"), "липсва maskable икона");
  });

  test("service worker-ът НЕ кешира API", async () => {
    const r = await grezza("/sw.js");
    assert.equal(r.status, 200);
    // Кеширана giacenza или стар статус изглеждат като истина — по-опасни са от
    // съобщение „няма връзка".
    assert.match(r.testo, /\/api\//);
    assert.match(r.testo, /req\.method !== "GET"/);
  });

  test("офлайн страницата е налична и не обещава данни", async () => {
    const r = await grezza("/offline.html");
    assert.equal(r.status, 200);
    assert.match(r.testo, /lang="it"/);
  });

  test("иконите се сервират", async () => {
    for (const p of ["/icon.svg", "/icon-maskable.svg"]) {
      const r = await grezza(p);
      assert.equal(r.status, 200, p);
      assert.match(r.testo, /^<svg /, p);
    }
  });
});

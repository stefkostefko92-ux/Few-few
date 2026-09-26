// Шаблонът на документите през реалните маршрути: данни, лого, шаблон, преглед.
//
// Всичко е в СОБСТВЕНА фирма: данните на фирмата са един ред на фирма, а
// другите файлове печатат документи на общата — смяна на шаблона там би
// променила чужди PDF-и по средата на пакета.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { comeRuolo, Sessione, BASE, PASSWORD, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";
import { MODELLO_PREDEFINITO } from "../../src/lib/pdf/modello";

let admin: Sessione;
let operatore: Sessione;
let tenantId: string;

after(() => prisma.$disconnect());

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function blocco(tipo: string, dati: Buffer): Buffer {
  const t = Buffer.from(tipo, "latin1");
  const l = Buffer.alloc(4);
  l.writeUInt32BE(dati.length);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, dati])));
  return Buffer.concat([l, t, dati, c]);
}
function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const riga = Buffer.concat([Buffer.from([0]), Buffer.alloc(12, 0x55)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco("IHDR", ihdr),
    blocco("tEXt", Buffer.from("Author\0Segreto Personale", "latin1")),
    blocco("IDAT", deflateSync(Buffer.concat([riga, riga]))),
    blocco("IEND", Buffer.alloc(0)),
  ]);
}

async function carica(s: Sessione, dati: Buffer, nome = "logo.png") {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(dati)]), nome);
  const res = await fetch(`${BASE}/api/dati-azienda/logo`, {
    method: "PUT",
    headers: { Cookie: s.cookieHeader() },
    body: form,
  });
  return { status: res.status, dati: await res.json().catch(() => ({})) };
}

async function pdf(s: Sessione, percorso: string, corpo?: unknown) {
  const res = await fetch(BASE + percorso, {
    method: corpo ? "POST" : "GET",
    headers: {
      Cookie: s.cookieHeader(),
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return {
    status: res.status,
    tipo: res.headers.get("content-type"),
    corpo: Buffer.from(await res.arrayBuffer()),
  };
}

before(async () => {
  const master = await comeRuolo("MASTER");
  const slug = unico("modello")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const t = await master.post<{ id: string }>("/api/tenants", {
    slug,
    ragioneSociale: `Azienda ${slug}`,
    email: `${slug}@test.local`,
  });
  assert.equal(t.status, 201);
  tenantId = t.dati.id;
  for (const ruolo of ["ADMIN", "OPERATORE"] as const) {
    const email = `${slug}-${ruolo.toLowerCase()}@test.local`;
    const u = await master.post("/api/utenti", {
      email,
      password: PASSWORD,
      nome: "Utente",
      cognome: ruolo,
      ruolo,
      tenantId,
    });
    assert.equal(u.status, 201, JSON.stringify(u.dati));
    const s = new Sessione();
    assert.equal(await s.entra(email), 200);
    if (ruolo === "ADMIN") admin = s;
    else operatore = s;
  }
});

describe("шаблон на документите", () => {
  test("без данни на фирмата шаблонът и логото чакат (409)", async () => {
    const r = await admin.put("/api/dati-azienda/modello", MODELLO_PREDEFINITO);
    assert.equal(r.status, 409);
    assert.equal((await carica(admin, png())).status, 409);
    const g = await admin.get<{ datiPresenti: boolean }>(
      "/api/dati-azienda/modello",
    );
    assert.equal(g.dati.datiPresenti, false);
  });

  test("данните се записват и без „Regime fiscale“ (празно поле = null)", async () => {
    const r = await admin.put("/api/dati-azienda", {
      ragioneSociale: "Ascensori Modello S.r.l.",
      partitaIva: "12345678903",
      indirizzo: "Via Modello 1",
      cap: "20100",
      citta: "Milano",
      regimeFiscale: null,
      sitoWeb: "www.modello.it",
      iban: "IT60X0542811101000000123456",
    });
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    const riga = await prisma.datiAzienda.findFirst({ where: { tenantId } });
    assert.equal(riga?.regimeFiscale, "RF01", "по подразбиране");
    assert.equal(riga?.sitoWeb, "www.modello.it");
  });

  test("логото: PNG влиза без метаданни, SVG и чужда роля — не", async () => {
    const ok = await carica(admin, png());
    assert.equal(ok.status, 200, JSON.stringify(ok.dati));
    assert.equal(ok.dati.tipo, "image/png");

    const letto = await pdf(operatore, "/api/dati-azienda/logo");
    assert.equal(letto.status, 200, "всеки влязъл чете логото");
    assert.equal(letto.tipo, "image/png");
    assert.equal(letto.corpo.includes("Segreto Personale"), false);

    const svg = await carica(
      admin,
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      ),
      "logo.svg",
    );
    assert.equal(svg.status, 422);
    assert.equal((await carica(operatore, png())).status, 403);

    const dati = await admin.get<Record<string, unknown>>("/api/dati-azienda");
    assert.equal(dati.dati.haLogo, true);
    assert.equal("logo" in dati.dati, false, "байтовете не пътуват в JSON");
    assert.equal("modelloDocumenti" in dati.dati, false);
  });

  test("шаблонът се записва; заглавието на фактурата остава фиксирано", async () => {
    const modello = structuredClone(MODELLO_PREDEFINITO);
    modello.colore = "#7a1f5c";
    modello.carattere = "Times";
    modello.documenti.preventivo.titolo = "Offerta";
    modello.documenti.preventivo.testoFinale = "Condizioni riservate {azienda}";
    modello.documenti.fattura.titolo = "FATTURA";
    const r = await admin.put<{ modello: typeof modello }>(
      "/api/dati-azienda/modello",
      modello,
    );
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(r.dati.modello.documenti.preventivo.titolo, "Offerta");
    assert.equal(
      r.dati.modello.documenti.fattura.titolo,
      "Documento contabile",
    );

    // Одитът знае КОЙ раздел е сменен, не текста.
    const traccia = await prisma.auditLog.findFirst({
      where: { tenantId, entita: "dati_azienda" },
      orderBy: { seq: "desc" },
    });
    const dettagli = JSON.stringify(traccia?.dettagli);
    assert.match(dettagli, /modello\.documenti/);
    assert.equal(dettagli.includes("Condizioni riservate"), false);
  });

  test("грешен цвят е 400; OPERATORE не пипа шаблона", async () => {
    const r = await admin.put("/api/dati-azienda/modello", {
      ...MODELLO_PREDEFINITO,
      colore: "rosso",
    });
    assert.equal(r.status, 400);
    assert.equal(
      (await operatore.put("/api/dati-azienda/modello", MODELLO_PREDEFINITO))
        .status,
      403,
    );
  });

  test("прегледът: всеки вид, без номериране, само ADMIN", async () => {
    for (const tipo of [
      "preventivo",
      "fattura",
      "ddt",
      "rapportino",
      "libretto",
    ]) {
      const r = await pdf(admin, "/api/dati-azienda/modello/anteprima", {
        tipo,
        modello: MODELLO_PREDEFINITO,
      });
      assert.equal(r.status, 200, tipo);
      assert.equal(r.tipo, "application/pdf");
      assert.equal(r.corpo.subarray(0, 5).toString(), "%PDF-");
    }
    const vietato = await pdf(
      operatore,
      "/api/dati-azienda/modello/anteprima",
      {
        tipo: "ddt",
        modello: MODELLO_PREDEFINITO,
      },
    );
    assert.equal(vietato.status, 403);
  });

  test("истинският документ носи шаблона на фирмата", async () => {
    const creato = await admin.post<{ id: string }>("/api/ddt", {
      causale: "vendita",
      destinatario: "Condominio Modello",
      indirizzoConsegna: "Via Prova 1, Milano",
      inizioTrasporto: "2026-05-12T14:30",
    });
    assert.equal(creato.status, 201, JSON.stringify(creato.dati));
    const r = await pdf(admin, `/api/ddt/${creato.dati.id}/pdf`);
    assert.equal(r.status, 200);
    // Шрифтът Times от шаблона — само в PDF-а на ТАЗИ фирма.
    assert.ok(r.corpo.includes("/Times-Roman"), "шрифтът от шаблона");
    assert.equal(r.corpo.includes("/Helvetica"), false);
    await admin.del(`/api/ddt/${creato.dati.id}`);
  });

  test("логото се маха", async () => {
    assert.equal((await admin.del("/api/dati-azienda/logo")).status, 200);
    assert.equal((await pdf(admin, "/api/dati-azienda/logo")).status, 404);
  });
});

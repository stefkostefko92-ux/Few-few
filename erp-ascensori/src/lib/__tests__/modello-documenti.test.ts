// Шаблонът на документите: какво се сменя, какво НЕ, логото и генераторът.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  CARATTERI,
  MARGINI,
  MODELLO_PREDEFINITO,
  SEGNAPOSTI,
  TIPI_DOCUMENTO,
  TITOLI_PREDEFINITI,
  TITOLO_FISSO,
  compila,
  contrastoSuBianco,
  leggiModello,
  schemaModello,
  schemaModelloIngresso,
} from "@/lib/pdf/modello";
import {
  LOGO_MAX_BYTE,
  LOGO_MAX_LATO,
  erroreLogo,
  pulisciLogo,
  riconosciLogo,
} from "@/lib/pdf/logo";
import { generaPdf, type DocumentoPdf } from "@/lib/pdf/documento";
import { documentoEsempio, librettoEsempio } from "@/lib/pdf/esempio";

// ── Помощни: истински PNG и синтетичен JPEG ────────────────────────────────

const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function blocco(tipo: string, dati: Uint8Array): Buffer {
  const t = Buffer.from(tipo, "latin1");
  const lung = Buffer.alloc(4);
  lung.writeUInt32BE(dati.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([t, dati])));
  return Buffer.concat([lung, t, dati, crc]);
}

/** PNG 2×2, RGB, с текстов блок и EXIF — точно това, което трябва да падне. */
function png(l = 2, h = 2): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // дълбочина
  ihdr[9] = 2; // RGB
  const riga = Buffer.concat([Buffer.from([0]), Buffer.alloc(l * 3, 0x33)]);
  const dati = deflateSync(
    Buffer.concat(Array.from({ length: h }, () => riga)),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco("IHDR", ihdr),
    blocco("tEXt", Buffer.from("Author\0Mario Rossi", "latin1")),
    blocco("eXIf", Buffer.from("GPS 45.46,9.19", "latin1")),
    blocco("IDAT", dati),
    blocco("IEND", new Uint8Array(0)),
  ]);
}

function segmento(marker: number, dati: Uint8Array): Buffer {
  const l = Buffer.alloc(2);
  l.writeUInt16BE(dati.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), l, dati]);
}

/** JPEG със SOF0 20×10, APP1 (EXIF) и коментар. Не се декодира — само се чете. */
function jpeg(): Buffer {
  const sof = Buffer.from([8, 0, 10, 0, 20, 1, 1, 0x11, 0]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmento(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    segmento(0xe1, Buffer.from("Exif\0\0GPS-45.46", "latin1")),
    segmento(0xfe, Buffer.from("commento privato", "latin1")),
    segmento(0xc0, sof),
    Buffer.from([0xff, 0xda, 0, 2, 0x12, 0x34, 0xff, 0xd9]),
  ]);
}

const contiene = (b: Uint8Array, s: string) =>
  Buffer.from(b).includes(Buffer.from(s, "latin1"));

// ── Шаблонът ───────────────────────────────────────────────────────────────

describe("шаблонът", () => {
  test("по подразбиране = видът, който документите имаха досега", () => {
    const m = MODELLO_PREDEFINITO;
    assert.equal(m.colore, "#116bb5");
    assert.equal(m.carattere, "Helvetica");
    assert.equal(MARGINI[m.margine], 40);
    assert.equal(m.documenti.fattura.titolo, "Documento contabile");
    assert.equal(m.documenti.fattura.mostraIban, true);
    assert.equal(m.documenti.ddt.mostraIban, false);
    assert.deepEqual(Object.keys(m.documenti), [...TIPI_DOCUMENTO]);
    assert.equal(CARATTERI.Times.corsivo, "Times-Italic");
    assert.ok(SEGNAPOSTI.numero);
  });

  test("повреден запис пада на стойностите по подразбиране ПОЛЕ ПО ПОЛЕ", () => {
    const m = leggiModello({
      colore: "rosso",
      carattere: "Comic Sans",
      logo: { posizione: "sinistra", larghezza: 9999 },
      documenti: { preventivo: { titolo: "Offerta", mostraIban: "sì" } },
    });
    assert.equal(m.colore, "#116bb5");
    assert.equal(m.carattere, "Helvetica");
    assert.equal(m.logo.larghezza, 110, "извън границите → по подразбиране");
    assert.equal(m.documenti.preventivo.titolo, "Offerta", "здравото остава");
    assert.equal(m.documenti.preventivo.mostraIban, false);
    assert.equal(m.documenti.ddt.titolo, TITOLI_PREDEFINITI.ddt);
    assert.deepEqual(leggiModello("боклук"), MODELLO_PREDEFINITO);
    assert.deepEqual(
      leggiModello({ documenti: "x", intestazione: 3, logo: [] }).documenti,
      MODELLO_PREDEFINITO.documenti,
    );
    assert.deepEqual(leggiModello(null), MODELLO_PREDEFINITO);
    // четящата схема сама по себе си никога не гърми
    assert.equal(schemaModello.safeParse({ colore: 42 }).success, true);
  });

  test("заглавието на фактурата НЕ се сменя, празното заглавие се връща", () => {
    const m = leggiModello({
      documenti: {
        fattura: { titolo: "FATTURA" },
        preventivo: { titolo: "   " },
      },
    });
    assert.ok(TITOLO_FISSO.has("fattura"));
    assert.equal(m.documenti.fattura.titolo, "Documento contabile");
    assert.equal(m.documenti.preventivo.titolo, "Preventivo");
  });

  test("входът е строг: грешна стойност е грешка, не тихо заменена", () => {
    const ok = schemaModelloIngresso.safeParse(MODELLO_PREDEFINITO);
    assert.equal(ok.success, true);
    const male = schemaModelloIngresso.safeParse({
      ...MODELLO_PREDEFINITO,
      colore: "blu",
    });
    assert.equal(male.success, false);
  });

  test("полетата в текста: познатите се попълват, непознатите остават видими", () => {
    assert.equal(
      compila("Offerta {numero} del {data} — {sconto}", {
        numero: "P-7",
        data: "01/02/2026",
      }),
      "Offerta P-7 del 01/02/2026 — {sconto}",
    );
    assert.equal(compila("IBAN {iban}", {}), "IBAN ");
  });

  test("контрастът на цвета спрямо бялото", () => {
    assert.ok(contrastoSuBianco("#000000") > 20);
    assert.ok(contrastoSuBianco("#ffff00") < 2);
    assert.ok(contrastoSuBianco("#116bb5") >= 4.5);
    assert.equal(contrastoSuBianco("xyz"), contrastoSuBianco("#000000"));
  });
});

// ── Логото ─────────────────────────────────────────────────────────────────

describe("логото", () => {
  test("PNG и JPEG се разпознават по съдържанието, с размерите", () => {
    assert.deepEqual(riconosciLogo(png(3, 2)), {
      tipo: "image/png",
      larghezza: 3,
      altezza: 2,
    });
    assert.deepEqual(riconosciLogo(jpeg()), {
      tipo: "image/jpeg",
      larghezza: 20,
      altezza: 10,
    });
  });

  test("SVG, GIF и боклук — не", () => {
    assert.equal(riconosciLogo(Buffer.from("<svg onload=alert(1)>")), null);
    assert.equal(riconosciLogo(Buffer.from("GIF89a......")), null);
    assert.equal(
      riconosciLogo(Buffer.from([0xff, 0xd8, 0xff, 0x00, 1, 2, 3, 4, 5, 6, 7])),
      null,
      "JPEG без маркер на мястото на маркер",
    );
    assert.equal(riconosciLogo(new Uint8Array(0)), null);
  });

  test("съобщенията за качване", () => {
    assert.equal(erroreLogo(png()), null);
    assert.match(erroreLogo(new Uint8Array(0)) ?? "", /vuoto/);
    assert.match(erroreLogo(new Uint8Array(LOGO_MAX_BYTE + 1)) ?? "", /512 KB/);
    assert.match(erroreLogo(Buffer.from("<svg/>")) ?? "", /PNG o JPEG/);
    assert.match(erroreLogo(png(LOGO_MAX_LATO + 1, 1)) ?? "", /lato massimo/);
    assert.match(erroreLogo(png(0, 1)) ?? "", /Dimensioni/);
  });

  test("метаданните падат, образът остава", () => {
    const p = pulisciLogo(png());
    assert.equal(contiene(p, "Mario Rossi"), false, "tEXt");
    assert.equal(contiene(p, "GPS"), false, "eXIf");
    assert.ok(contiene(p, "IDAT") && contiene(p, "IEND"));
    assert.deepEqual(riconosciLogo(p)?.larghezza, 2);

    const j = pulisciLogo(jpeg());
    assert.equal(contiene(j, "GPS"), false, "APP1/EXIF");
    assert.equal(contiene(j, "commento"), false, "COM");
    assert.ok(contiene(j, "JFIF"), "APP0 остава");
    assert.deepEqual(riconosciLogo(j)?.larghezza, 20);

    const altro = Buffer.from("non un'immagine");
    assert.equal(pulisciLogo(altro), altro, "непознатото — непроменено");
    // отрязан PNG: блокът обявява повече, отколкото има — спира, не гърми
    const tronco = png().subarray(0, 40);
    assert.ok(pulisciLogo(tronco).length <= tronco.length);
  });
});

// ── Генераторът ────────────────────────────────────────────────────────────

const AZIENDA = {
  ragioneSociale: "Ascensori Prova S.r.l.",
  partitaIva: "12345678903",
  codiceFiscale: "12345678903",
  indirizzo: "Via dell'Industria 7",
  cap: "20090",
  citta: "Segrate",
  provincia: "MI",
  telefono: "+39 02 1234567",
  email: "info@prova.it",
  pec: "prova@pec.it",
  sitoWeb: "www.prova.it",
  iban: "IT60X0542811101000000123456",
  rea: "MI-1234567",
  capitaleSociale: "50.000,00 €",
  notePiePagina: "Pagamento a 30 giorni.",
};

const pagine = (b: Buffer) =>
  (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("генераторът с шаблон", () => {
  test("всеки вид документ, по подразбиране и с всички настройки", async () => {
    const pieno = leggiModello({
      ...MODELLO_PREDEFINITO,
      colore: "#7a1f5c",
      carattere: "Times",
      margine: "ampio",
      logo: { posizione: "sopra", larghezza: 150 },
      intestazione: {
        mostraTelefono: false,
        mostraEmail: true,
        mostraPec: false,
        mostraSitoWeb: true,
        righeExtra: "Certificazione ISO 9001\nSede operativa: Via Po 1",
      },
      documenti: Object.fromEntries(
        TIPI_DOCUMENTO.map((t) => [
          t,
          {
            titolo: `Titolo ${t}`,
            testoIniziale: "Gentile {destinatario}, come da accordi.",
            testoFinale: "Totale {totale}. Distinti saluti, {azienda}.",
            notaPiede: "Documento {numero} del {data} · IBAN {iban}",
            mostraIban: true,
            firmaAccettazione: true,
          },
        ]),
      ),
    });
    const conLogo = { ...AZIENDA, logo: png(40, 20) };
    for (const tipo of ["preventivo", "fattura", "ddt", "rapportino"] as const)
      for (const [m, a] of [
        [MODELLO_PREDEFINITO, AZIENDA],
        [pieno, conLogo],
        [
          { ...pieno, logo: { posizione: "sinistra" as const, larghezza: 80 } },
          conLogo,
        ],
        [
          { ...pieno, logo: { posizione: "nessuna" as const, larghezza: 80 } },
          conLogo,
        ],
      ] as const) {
        const b = await generaPdf(documentoEsempio(tipo, a, m));
        assert.equal(b.subarray(0, 5).toString(), "%PDF-", tipo);
      }
  });

  test("шрифтът на шаблона стига до файла", async () => {
    const times = await generaPdf(
      documentoEsempio(
        "preventivo",
        AZIENDA,
        leggiModello({ ...MODELLO_PREDEFINITO, carattere: "Courier" }),
      ),
    );
    assert.ok(contiene(times, "/Courier"));
    assert.equal(contiene(times, "/Helvetica"), false);
  });

  test("номерата на страниците не отварят празна страница", async () => {
    const molte: DocumentoPdf = {
      ...documentoEsempio("fattura", AZIENDA, MODELLO_PREDEFINITO),
      righe: Array.from({ length: 80 }, (_, i) => ({
        descrizione: `Riga ${i + 1} con una descrizione abbastanza lunga da andare a capo`,
        quantita: "1",
        prezzoUnitario: "10.00",
        aliquotaIva: "22",
        totale: "10.00",
      })),
      ritenuta: { aliquota: "4", importo: "20.80", netto: "613.60" },
    };
    const con = await generaPdf(molte);
    const senza = await generaPdf({
      ...molte,
      modello: { ...MODELLO_PREDEFINITO, numeriPagina: false },
    });
    assert.ok(pagine(con) > 1);
    assert.equal(pagine(con), pagine(senza));
  });

  test("повреден лого файл не проваля документа", async () => {
    const rotto = png();
    rotto[30] ^= 0xff; // развален IHDR CRC → pdfkit отказва образа
    const b = await generaPdf(
      documentoEsempio(
        "ddt",
        {
          ...AZIENDA,
          logo: Buffer.concat([rotto.subarray(0, 33), Buffer.from("x")]),
        },
        MODELLO_PREDEFINITO,
      ),
    );
    assert.equal(b.subarray(0, 5).toString(), "%PDF-");
  });

  test("подписан отчет и разделено плащане", async () => {
    const firmato: DocumentoPdf = {
      ...documentoEsempio("rapportino", AZIENDA, MODELLO_PREDEFINITO),
      firma: {
        immagine: `data:image/png;base64,${png(4, 2).toString("base64")}`,
        nome: "Anna Bianchi",
        ruolo: "Amministratrice",
        data: new Date(),
      },
    };
    assert.ok((await generaPdf(firmato)).length > 1000);
    const split: DocumentoPdf = {
      ...documentoEsempio("fattura", AZIENDA, MODELLO_PREDEFINITO),
      splitPayment: true,
      righe: [],
    };
    assert.ok((await generaPdf(split)).length > 1000);
  });

  test("на ръба на страницата: всеки блок отива цял на следващата", async () => {
    const m = leggiModello({
      ...MODELLO_PREDEFINITO,
      documenti: {
        ...MODELLO_PREDEFINITO.documenti,
        preventivo: {
          ...MODELLO_PREDEFINITO.documenti.preventivo,
          testoFinale: "Condizioni: {totale}. ".repeat(20),
          firmaAccettazione: true,
        },
        rapportino: {
          ...MODELLO_PREDEFINITO.documenti.rapportino,
          testoIniziale: "Premessa. ".repeat(600),
        },
      },
    });
    const riga = (i: number) => ({
      descrizione: `Voce ${i}`,
      quantita: "1",
      prezzoUnitario: i % 7 ? "10.00" : null,
      aliquotaIva: "22",
      totale: "10.00",
    });
    for (let n = 18; n <= 60; n++) {
      const prev = await generaPdf({
        ...documentoEsempio("preventivo", AZIENDA, m),
        righe: Array.from({ length: n }, (_, i) => riga(i)),
        riepilogo: [{ aliquota: "22", imponibile: "1.00", imposta: "0.22" }],
        note: "Nota del documento.",
      });
      assert.equal(prev.subarray(0, 5).toString(), "%PDF-");
      const rap = await generaPdf({
        ...documentoEsempio("rapportino", AZIENDA, m),
        righe: Array.from({ length: n }, (_, i) => ({
          descrizione: `Materiale ${i}`,
          quantita: "1",
        })),
        firma: {
          immagine:
            n % 2
              ? "data:image/png;base64,AAAA"
              : `data:image/png;base64,${png().toString("base64")}`,
          nome: "Anna Bianchi",
          ruolo: null,
          data: new Date(),
        },
      });
      assert.equal(rap.subarray(0, 5).toString(), "%PDF-");
    }
  });

  test("примерното досие носи шаблона", () => {
    const d = librettoEsempio(AZIENDA, MODELLO_PREDEFINITO);
    assert.equal(d.modello, MODELLO_PREDEFINITO);
    assert.equal(d.impianto.matricola, "ESEMPIO-001");
  });
});

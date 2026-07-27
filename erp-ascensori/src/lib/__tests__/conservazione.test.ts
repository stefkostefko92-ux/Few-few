import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { creaZip, nomeVoceSicuro } from "../zip";
import { creaPacchetto, impronta } from "../sdi/conservazione";

const QUANDO = new Date("2026-07-26T12:34:56Z");

const DOC = (numero: string, progressivo: string) => ({
  numero,
  data: new Date("2026-03-15T00:00:00Z"),
  nomeFile: `IT12345678901_${progressivo}.xml`,
  xml: `<?xml version="1.0"?><p:FatturaElettronica><n>${numero}</n></p:FatturaElettronica>`,
  destinatario: "Condominio Via Verdi 12",
  partitaIvaDestinatario: null,
  codiceFiscaleDestinatario: "97123456789",
  totaleCentesimi: 36600,
  tipoDocumento: "TD01",
});

const PRODUTTORE = {
  ragioneSociale: "Panev Ascensori S.r.l.",
  partitaIva: "12345678901",
  codiceFiscale: null,
};

describe("ZIP-ът е истински ZIP", () => {
  test("`unzip -t` приема архива", () => {
    // Проверка с ЧУЖД инструмент, не с наш четец: пакетът се отваря от
    // доставчика, не от нас, и то евентуално след години.
    const zip = creaZip(
      [
        { nome: "a.txt", dati: new TextEncoder().encode("ciao") },
        { nome: "cartella/b.xml", dati: new TextEncoder().encode("<x/>") },
      ],
      QUANDO,
    );
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    try {
      const f = join(dir, "t.zip");
      writeFileSync(f, zip);
      const out = execFileSync("unzip", ["-t", f], { encoding: "utf8" });
      assert.match(out, /No errors detected/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("съдържанието излиза байт по байт същото", () => {
    const testo = "Ricambi A&B — «porta» 3\nseconda riga\n";
    const zip = creaZip(
      [{ nome: "x.txt", dati: new TextEncoder().encode(testo) }],
      QUANDO,
    );
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    try {
      writeFileSync(join(dir, "t.zip"), zip);
      execFileSync("unzip", ["-q", "-o", "t.zip"], { cwd: dir });
      assert.equal(readFileSync(join(dir, "x.txt"), "utf8"), testo);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("празен архив е ПРАЗЕН, не повреден", () => {
    // Разликата има значение: „zipfile is empty" е съобщение за съдържание,
    // „cannot find zipfile directory" — за счупен файл. `unzip` връща изход ≠ 0
    // и в двата случая, затова се проверява СЪОБЩЕНИЕТО, не изходният код.
    const zip = creaZip([], QUANDO);
    // Каноничният празен архив е точно записът за край на централната
    // директория: 22 байта, започващи с PK\x05\x06.
    assert.equal(zip.length, 22);
    assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x05, 0x06]);

    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    try {
      writeFileSync(join(dir, "t.zip"), zip);
      let uscita = "";
      try {
        execFileSync("unzip", ["-l", join(dir, "t.zip")], { encoding: "utf8" });
      } catch (e) {
        uscita =
          String((e as { stderr?: string; stdout?: string }).stderr ?? "") +
          String((e as { stdout?: string }).stdout ?? "");
      }
      assert.match(uscita, /zipfile is empty/);
      assert.equal(/cannot find zipfile directory/.test(uscita), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("имената в архива", () => {
  test("наклонената черта в номера НЕ прави папка", () => {
    // „2026/0001" вътре в ZIP значи ПАПКА: файловете се разпръсват по дървото,
    // а някои инструменти отказват целия архив.
    assert.equal(nomeVoceSicuro("2026/0001.xml"), "2026_0001.xml");
    assert.equal(nomeVoceSicuro("a\\b.xml"), "a_b.xml");
  });

  test("изкачването нагоре се спира (zip-slip)", () => {
    const n = nomeVoceSicuro("../../etc/passwd");
    assert.equal(/\.\./.test(n), false, n);
    assert.equal(n.startsWith("/"), false, n);
  });

  test("празното след прочистване не дава файл без име", () => {
    assert.equal(nomeVoceSicuro("../"), "file");
    assert.equal(nomeVoceSicuro(""), "file");
  });
});

describe("пакетът за предаване", () => {
  const p = creaPacchetto(
    [DOC("2026/0001", "00001"), DOC("2026/0002", "00002")],
    PRODUTTORE,
    QUANDO,
  );

  test("носи индекс с ред за всеки документ", () => {
    assert.equal(p.indice.documenti.length, 2);
    assert.equal(p.indice.documenti[0].numero, "2026/0001");
    assert.equal(p.indice.produttore.ragioneSociale, "Panev Ascensori S.r.l.");
  });

  test("отпечатъкът е на РЕАЛНОТО съдържание на файла", () => {
    // Без това индексът е списък с обещания: няма как да се докаже, че
    // полученото е изпратеното.
    const d = DOC("2026/0001", "00001");
    assert.equal(
      p.indice.documenti[0].sha256,
      impronta(new TextEncoder().encode(d.xml)),
    );
  });

  test("тоталът е от центесими, без float", () => {
    assert.equal(p.indice.documenti[0].totale, "366.00");
  });

  test("индексът има СВОЙ отпечатък — иначе махнат ред минава незабелязано", () => {
    assert.match(p.indice.sha256Indice ?? "", /^[0-9a-f]{64}$/);
  });

  test("еднакво име не презаписва документ", () => {
    // Два документа с еднакъв прогресив биха се презаписали мълчаливо — тоест
    // изчезнал документ в пратка, която се пази десет години.
    const q = creaPacchetto(
      [DOC("A", "00001"), DOC("B", "00001")],
      PRODUTTORE,
      QUANDO,
    );
    const nomi = q.indice.documenti.map((d) => d.nomeFile);
    assert.equal(new Set(nomi).size, 2, nomi.join(" | "));
  });

  test("README-то казва какво пакетът НЕ е", () => {
    const dir = mkdtempSync(join(tmpdir(), "cons-"));
    try {
      writeFileSync(join(dir, "p.zip"), p.zip);
      execFileSync("unzip", ["-q", "-o", "p.zip"], { cwd: dir });
      const readme = readFileSync(join(dir, "README.txt"), "utf8");
      // Продуктът НЕ съхранява по норма и не бива да остави място за
      // подразбиране, че го прави.
      assert.match(readme, /NON è un sistema di conservazione a norma/);
      assert.match(readme, /NON sono firmati digitalmente/);
      // Процедурата за проверка на индекса трябва да е ИЗПЪЛНИМА: отпечатъкът
      // стои в отделен файл, върху индекса както е в архива. Дотук се смяташе
      // върху индекса БЕЗ полето `sha256Indice` — а махането на реда оставя
      // запетая в предходния, тоест байтовете никога не съвпадаха.
      const digest = readFileSync(join(dir, "indice.sha256"), "utf8");
      const testo = readFileSync(join(dir, "indice.json"), "utf8");
      assert.equal(digest, `${impronta(testo)}  indice.json\n`);
      assert.equal(digest.slice(0, 64), p.indice.sha256Indice);

      // Индексът в архива трябва да е СЪЩИЯТ като върнатия.
      const indice = JSON.parse(readFileSync(join(dir, "indice.json"), "utf8"));
      assert.equal(indice.documenti.length, 2);
      assert.equal(indice.formato, "erp-ascensori/conservazione/1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("името носи датата — пратките се трупат в една папка", () => {
    assert.equal(p.nomeFile, "conservazione_20260726.zip");
  });
});

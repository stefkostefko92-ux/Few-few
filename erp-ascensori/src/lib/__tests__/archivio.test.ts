// Хранилището на прикачените файлове — по РЕАЛЕН диск, във временна папка.
//
// Мокване на файловата система тук би било по-лошо от липсващ тест: проверява
// се точно поведението на файловата система (отказ при презапис, липсващ файл,
// изход извън корена), а мокът връща това, което сме предположили, че тя прави.
//
// Всеки тест си прави своя временна папка и я маха след себе си, за да могат
// да се пускат в произволен ред.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  radiceArchivio,
  percorsoAssoluto,
  impronta,
  salva,
  leggi,
  elimina,
  archivioScrivibile,
} from "../allegati/archivio";

const DATI = new TextEncoder().encode("contenuto di prova");
let dir = "";
const envVero = process.env.STORAGE_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "arch-"));
  process.env.STORAGE_DIR = dir;
});

afterEach(() => {
  // Правата се връщат: тестът за неписваемост ги сваля, а `rm` иска писане.
  try {
    chmodSync(dir, 0o755);
  } catch {
    /* папката вече може да е махната */
  }
  rmSync(dir, { recursive: true, force: true });
  if (envVero === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = envVero;
});

describe("коренът", () => {
  test("идва от обкръжението и е абсолютен", () => {
    assert.equal(radiceArchivio(), dir);
  });

  test("подразбирането е ИЗВЪН дървото на приложението", () => {
    // Под `public/` всеки качен документ би станал свободно достъпен на познат
    // адрес — а тук се качват сертификати и протоколи с лични данни.
    delete process.env.STORAGE_DIR;
    const r = radiceArchivio();
    assert.equal(r.startsWith("/"), true);
    assert.equal(/public/.test(r), false);
    assert.match(r, /erp-ascensori/);
  });
});

describe("пътят не излиза от корена", () => {
  test("нормалният път се разрешава под корена", () => {
    assert.equal(
      percorsoAssoluto("2026/07/abc.pdf"),
      join(dir, "2026/07/abc.pdf"),
    );
  });

  test("самият корен е позволен", () => {
    assert.equal(percorsoAssoluto("."), dir);
  });

  test("изкачването нагоре се ОТКАЗВА", () => {
    // Пътищата се строят от наши стойности, тоест това не би трябвало да е
    // възможно — но без проверката една бъдеща промяна в строенето мълчаливо
    // отваря четене на произволен файл от сървъра.
    for (const p of ["../fuori.txt", "a/../../fuori.txt", "/etc/passwd"])
      assert.throws(() => percorsoAssoluto(p), /fuori dall'archivio/, p);
  });

  test("папка със същия ПРЕФИКС не се брои за вътрешна", () => {
    // Класическата грешка: `startsWith(radice)` без разделителя приема
    // `/var/lib/erp-ascensori-altro` за път вътре в `/var/lib/erp-ascensori`.
    process.env.STORAGE_DIR = dir;
    assert.throws(() =>
      percorsoAssoluto("../" + dir.split("/").pop() + "-altro/x"),
    );
  });
});

describe("отпечатъкът", () => {
  test("е SHA-256 в шестнайсетичен вид", () => {
    assert.match(impronta(DATI), /^[0-9a-f]{64}$/);
  });

  test("същите байтове дават същия отпечатък", () => {
    assert.equal(
      impronta(DATI),
      impronta(new TextEncoder().encode("contenuto di prova")),
    );
  });

  test("един различен байт го променя изцяло", () => {
    assert.notEqual(
      impronta(DATI),
      impronta(new TextEncoder().encode("contenuto di provb")),
    );
  });

  test("празният вход не гърми", () => {
    assert.match(impronta(new Uint8Array()), /^[0-9a-f]{64}$/);
  });
});

describe("запис и четене", () => {
  test("записва, създавайки папките по пътя", async () => {
    await salva("2026/07/x.pdf", DATI);
    assert.ok(existsSync(join(dir, "2026/07/x.pdf")));
    assert.deepEqual(new Uint8Array(await leggi("2026/07/x.pdf")), DATI);
  });

  test("ОТКАЗВА да презапише съществуващ файл", async () => {
    // Пътят носи UUID, тоест сблъсък не се очаква — а ако все пак стане,
    // по-добре грешка, отколкото тихо изгубено доказателство.
    await salva("a.pdf", DATI);
    await assert.rejects(() =>
      salva("a.pdf", new TextEncoder().encode("altro")),
    );
    // И старото съдържание е непокътнато.
    assert.deepEqual(new Uint8Array(await leggi("a.pdf")), DATI);
  });

  test("записът извън корена се отказва, преди да пипне диска", async () => {
    await assert.rejects(
      () => salva("../fuori.pdf", DATI),
      /fuori dall'archivio/,
    );
    assert.equal(existsSync(join(dir, "..", "fuori.pdf")), false);
  });

  test("четенето на липсващ файл е грешка, не празнота", async () => {
    // Празен буфер би изглеждал като качен, но повреден файл — по-лошо от
    // явната грешка.
    await assert.rejects(() => leggi("mai-esistito.pdf"), { code: "ENOENT" });
  });
});

describe("изтриване", () => {
  test("маха файла", async () => {
    await salva("b.pdf", DATI);
    await elimina("b.pdf");
    assert.equal(existsSync(join(dir, "b.pdf")), false);
  });

  test("липсващият файл НЕ е грешка — изтриването е идемпотентно", async () => {
    // Редът в базата е истината за качения файл, а изтриването трябва да може
    // да се повтори след прекъснат опит.
    await elimina("mai-esistito.pdf");
    await elimina("mai-esistito.pdf");
  });

  test("ДРУГА грешка на файловата система се вдига", async () => {
    // Само ENOENT се преглъща. Ако папка се окаже там, където се чака файл,
    // това е повреда на хранилището и трябва да се види.
    await salva("dir-come-file/dentro.pdf", DATI);
    await assert.rejects(() => elimina("dir-come-file"));
  });

  test("изтриване извън корена се отказва", async () => {
    const fuori = join(dir, "..", "vittima.txt");
    writeFileSync(fuori, "non toccare");
    try {
      await assert.rejects(
        () => elimina("../vittima.txt"),
        /fuori dall'archivio/,
      );
      assert.ok(existsSync(fuori));
    } finally {
      rmSync(fuori, { force: true });
    }
  });
});

describe("здравната проверка", () => {
  test("казва „готово“, когато може да пише", async () => {
    assert.deepEqual(await archivioScrivibile(), { ok: true });
  });

  test("казва ЗАЩО не може, вместо просто „не“", async () => {
    // Здравният маршрут се чете по време на инцидент: „ok: false" без причина
    // праща човека да гадае между право на достъп, липсващ том и пълен диск.
    chmodSync(dir, 0o500);
    const r = await archivioScrivibile();
    // Под root правата не спират писането — тогава проверката просто минава и
    // това не е дефект на теста, а на средата.
    if (!r.ok) {
      assert.ok((r.motivo ?? "").length > 0);
      assert.match(r.motivo ?? "", /EACCES|permission/i);
    }
  });

  test("несъществуващ път се създава, не се обявява за счупен", async () => {
    process.env.STORAGE_DIR = join(dir, "nuovo", "livello");
    assert.deepEqual(await archivioScrivibile(), { ok: true });
  });
});

describe("отказ при писане — детерминирано", () => {
  test("път ПОД файл дава ясна причина, не мълчалив провал", () => {
    // По-надеждно от правата: под root правата не спират писането, а „папка
    // под файл" е невъзможна за всеки потребител. Точно това се случва, когато
    // томът не е монтиран и на негово място стои обикновен файл.
    const file = join(dir, "non-una-cartella");
    writeFileSync(file, "x");
    process.env.STORAGE_DIR = join(file, "dentro");
    return archivioScrivibile().then((r) => {
      assert.equal(r.ok, false);
      // Причината трябва да ГОВОРИ: „ok: false" праща човека да гадае между
      // право на достъп, липсващ том и пълен диск.
      assert.ok((r.motivo ?? "").length > 0);
      assert.match(r.motivo ?? "", /ENOTDIR|not a directory/i);
    });
  });
});

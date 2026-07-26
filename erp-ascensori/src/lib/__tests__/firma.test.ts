import test from "node:test";
import assert from "node:assert/strict";
import { validaFirma, rapportinoModificabile, MAX_BYTE_FIRMA } from "../firma";

/** Минимален валиден PNG (1×1 прозрачен), допълнен до нужния размер. */
function pngFinto(byteExtra = 0): string {
  const png = Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // подпис
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR
    ...new Array(byteExtra).fill(0x42),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

test("валиден PNG подпис минава", () => {
  assert.equal(validaFirma(pngFinto(400)).valida, true);
});

test("друг формат се отказва", () => {
  assert.equal(
    validaFirma("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").valida,
    false,
  );
  assert.equal(validaFirma("data:image/jpeg;base64,/9j/4AAQ").valida, false);
  assert.equal(validaFirma("https://esempio.it/firma.png").valida, false);
});

test("PNG обявен, но НЕ PNG по съдържание, се отказва", () => {
  // Клиентът може да напише какъвто иска тип в data URL-а — проверява се
  // самият подпис на файла.
  const finto = `data:image/png;base64,${Buffer.from("x".repeat(400)).toString("base64")}`;
  assert.equal(validaFirma(finto).valida, false);
});

test("нищо ненарисувано се отказва с ясно съобщение", () => {
  const r = validaFirma(pngFinto(0));
  assert.equal(r.valida, false);
  assert.match(r.errore ?? "", /Firma assente/);
});

test("прекалено голям подпис се отказва", () => {
  const grande = validaFirma(pngFinto(MAX_BYTE_FIRMA + 1000));
  assert.equal(grande.valida, false);
  assert.match(grande.errore ?? "", /troppo grande/);
});

test("невалиден base64 се отказва, без да гърми", () => {
  assert.equal(
    validaFirma("data:image/png;base64,!!!не-е-base64!!!").valida,
    false,
  );
  assert.equal(validaFirma("data:image/png;base64,").valida, false);
});

test("подписаният отчет не се променя", () => {
  assert.equal(rapportinoModificabile(null), true);
  assert.equal(rapportinoModificabile(undefined), true);
  assert.equal(rapportinoModificabile(new Date()), false);
});

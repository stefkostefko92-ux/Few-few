import test from "node:test";
import assert from "node:assert/strict";
import { qrSvg, urlImpianto } from "../qr";
import { ritornoSicuro, RITORNO_PREDEFINITO } from "../ritorno";

test("QR-ът е валиден SVG с квадратно платно", () => {
  const svg = qrSvg("https://erp.azienda.it/i/ASC-001");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>$/);
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(m);
  assert.equal(m[1], m[2], "кодът трябва да е квадратен");
});

test("по-дълги данни дават по-голям код", () => {
  const lato = (s: string) => Number(s.match(/viewBox="0 0 (\d+)/)![1]);
  assert.ok(lato(qrSvg("x".repeat(200))) > lato(qrSvg("x")));
});

test("тихата зона е част от платното", () => {
  // Под 4 модула много четци не хващат кода — затова е стойност по подразбиране.
  const conMargine = Number(qrSvg("test").match(/viewBox="0 0 (\d+)/)![1]);
  const senza = Number(
    qrSvg("test", { margine: 0 }).match(/viewBox="0 0 (\d+)/)![1],
  );
  assert.equal(conMargine - senza, 8 * 4, "по 4 модула от двете страни");
});

test("празни данни се отказват, вместо да дадат празен код", () => {
  assert.throws(() => qrSvg(""));
});

test("адресът сочи матриколата и е екраниран", () => {
  assert.equal(
    urlImpianto("https://erp.it", "ASC-001"),
    "https://erp.it/i/ASC-001",
  );
  // Наклонена черта в матрикола иначе би отворила друг път.
  assert.equal(urlImpianto("https://erp.it", "A/B"), "https://erp.it/i/A%2FB");
  // Двойна черта от небрежна конфигурация не бива да стига до стикера.
  assert.equal(urlImpianto("https://erp.it/", "X"), "https://erp.it/i/X");
});

test("връщането след вход пуска само вътрешни пътища", () => {
  assert.equal(ritornoSicuro("/i/ASC-001"), "/i/ASC-001");
  assert.equal(ritornoSicuro("/ordini?stato=EMESSO"), "/ordini?stato=EMESSO");
});

test("отвореното пренасочване се спира", () => {
  // Класиката: изглежда като път, а браузърът го праща навън.
  assert.equal(ritornoSicuro("//evil.example"), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro("/\\evil.example"), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro("https://evil.example"), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro("javascript:alert(1)"), RITORNO_PREDEFINITO);
  // Управляващ знак, който браузърът отрязва, преди да тълкува адреса.
  assert.equal(ritornoSicuro("/	/evil.example"), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro(" //evil.example"), RITORNO_PREDEFINITO);
  // Цикъл обратно към входа.
  assert.equal(ritornoSicuro("/login"), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro(null), RITORNO_PREDEFINITO);
  assert.equal(ritornoSicuro(""), RITORNO_PREDEFINITO);
});

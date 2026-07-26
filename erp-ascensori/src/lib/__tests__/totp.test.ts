import test from "node:test";
import assert from "node:assert/strict";
import {
  codice,
  verifica,
  base32Codifica,
  base32Decodifica,
  generaSegreto,
  generaCodiciRecupero,
  uriOtpauth,
  PASSO_SECONDI,
} from "../totp";

// Тестовите вектори от RFC 6238, приложение B. Тайната е ASCII „12345678901234567890".
const SEGRETO_RFC = base32Codifica(
  Buffer.from("12345678901234567890", "ascii"),
);

test("векторите от RFC 6238 съвпадат", () => {
  // Стойностите са от самия RFC — ако тук се счупи нещо, приложенията на
  // потребителите ще спрат да работят.
  const casi: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];
  for (const [secondi, atteso] of casi)
    assert.equal(codice(SEGRETO_RFC, secondi * 1000), atteso, `t=${secondi}`);
});

test("base32 обикаля напред и назад", () => {
  const b = Buffer.from("Ascensori Lombardia", "utf8");
  assert.deepEqual(base32Decodifica(base32Codifica(b)), b);
  // Малки букви и интервали се приемат — потребителят преписва на ръка.
  assert.deepEqual(base32Decodifica(base32Codifica(b).toLowerCase()), b);
});

test("невалиден base32 хвърля, не връща боклук", () => {
  assert.throws(() => base32Decodifica("PAROLA!"), /Base32/);
});

test("кодът от текущия момент е валиден", () => {
  const s = generaSegreto();
  assert.equal(verifica(s, codice(s)), true);
});

test("толерансът покрива ±1 стъпка, но не повече", () => {
  const s = generaSegreto();
  const ora = Date.now();
  // Часовникът на телефона изостава или избързва с половин минута.
  assert.equal(verifica(s, codice(s, ora - PASSO_SECONDI * 1000), ora), true);
  assert.equal(verifica(s, codice(s, ora + PASSO_SECONDI * 1000), ora), true);
  // Две стъпки назад вече не се приема — прозорецът не се разтяга.
  assert.equal(
    verifica(s, codice(s, ora - 2 * PASSO_SECONDI * 1000), ora),
    false,
  );
});

test("грешен и зле оформен код се отхвърлят", () => {
  const s = generaSegreto();
  assert.equal(verifica(s, "000000"), codice(s) === "000000");
  assert.equal(verifica(s, "12345"), false); // пет цифри
  assert.equal(verifica(s, "abcdef"), false);
  assert.equal(verifica(s, ""), false);
});

test("интервалите в кода се пренебрегват", () => {
  const s = generaSegreto();
  const c = codice(s);
  assert.equal(verifica(s, `${c.slice(0, 3)} ${c.slice(3)}`), true);
});

test("тайната е 160 бита, както иска RFC 4226", () => {
  assert.equal(base32Decodifica(generaSegreto()).length, 20);
});

test("две тайни не съвпадат", () => {
  assert.notEqual(generaSegreto(), generaSegreto());
});

test("URI-то за QR носи всичко нужно на приложението", () => {
  const u = uriOtpauth("ABCDEFGH", "mario@azienda.it");
  assert.match(u, /^otpauth:\/\/totp\//);
  assert.match(u, /secret=ABCDEFGH/);
  assert.match(u, /issuer=ERP%20Ascensori/);
  assert.match(u, /digits=6/);
  assert.match(u, /period=30/);
  // Имейлът се кодира — иначе „+" в адреса чупи URI-то.
  assert.match(
    uriOtpauth("A", "mario+test@azienda.it"),
    /mario%2Btest%40azienda\.it/,
  );
});

test("резервните кодове са различни и с четим формат", () => {
  const c = generaCodiciRecupero(8);
  assert.equal(c.length, 8);
  assert.equal(new Set(c).size, 8);
  for (const x of c) assert.match(x, /^[0-9A-F]{5}-[0-9A-F]{5}$/);
});

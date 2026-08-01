import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BarcodeError,
  completeEan13,
  ean13CheckDigit,
  generaBarcodeSvg,
  generaQrSvg,
  isValidEan13,
  payloadQrProdotto,
  skuBarcode,
} from '../barcode';

test('ean13CheckDigit calcola la cifra di controllo standard', () => {
  // Esempio da manuale GS1: 400638133393 → cifra di controllo 1.
  assert.equal(ean13CheckDigit('400638133393'), 1);
  assert.equal(completeEan13('400638133393'), '4006381333931');
});

test('ean13CheckDigit rifiuta input che non sono 12 cifre', () => {
  assert.throws(() => ean13CheckDigit('123'), BarcodeError);
  assert.throws(() => ean13CheckDigit('abcdefghijkl'), BarcodeError);
});

test('isValidEan13 riconosce codici corretti e scorretti', () => {
  assert.equal(isValidEan13('4006381333931'), true);
  assert.equal(isValidEan13('4006381333930'), false); // cifra di controllo sbagliata
  assert.equal(isValidEan13('123'), false);
});

test('skuBarcode sceglie EAN-13 solo per SKU numerici da 12/13 cifre', () => {
  assert.deepEqual(skuBarcode('400638133393'), { tipo: 'ean13', valore: '4006381333931' });
  assert.deepEqual(skuBarcode('4006381333931'), { tipo: 'ean13', valore: '4006381333931' });
  assert.deepEqual(skuBarcode('STF-GUIDA-001'), { tipo: 'code128', valore: 'STF-GUIDA-001' });
});

test('skuBarcode rifiuta un EAN-13 a 13 cifre con controllo errato', () => {
  assert.throws(() => skuBarcode('4006381333930'), BarcodeError);
});

test('payloadQrProdotto genera il percorso stabile della scheda prodotto', () => {
  const id = 'cljk3x9qz0000qzrmn831p9k1'; // cuid di esempio
  assert.equal(payloadQrProdotto(id), `/prodotti/${id}`);
});

test('payloadQrProdotto rifiuta identificativi non validi', () => {
  assert.throws(() => payloadQrProdotto('../../etc/passwd'), BarcodeError);
  assert.throws(() => payloadQrProdotto('<script>'), BarcodeError);
});

test('generaBarcodeSvg produce un SVG per Code128 ed EAN-13', () => {
  const code128 = generaBarcodeSvg('STF-GUIDA-001', 'code128');
  assert.match(code128, /^<svg/);
  const ean13 = generaBarcodeSvg('400638133393', 'ean13');
  assert.match(ean13, /^<svg/);
});

test('generaBarcodeSvg rifiuta input fuori dal set ammesso o troppo lunghi', () => {
  assert.throws(() => generaBarcodeSvg('<script>alert(1)</script>', 'code128'), BarcodeError);
  assert.throws(() => generaBarcodeSvg('a'.repeat(200), 'code128'), BarcodeError);
  assert.throws(() => generaBarcodeSvg('123', 'ean13'), BarcodeError);
});

test('generaQrSvg produce un SVG e rifiuta payload non interni', () => {
  const svg = generaQrSvg(payloadQrProdotto('cljk3x9qz0000qzrmn831p9k1'));
  assert.match(svg, /^<svg/);
  assert.throws(() => generaQrSvg('https://esempio.esterno/attacco'), BarcodeError);
});

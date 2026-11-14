import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKey,
  normalizeKey,
  hashKey,
  signLicenseBlob,
  verifyLicenseBlob,
  generateSigningKeys,
} from "../lib/license.js";

test("генерираният ключ е във формат CSPOS-XXXXX-XXXXX-XXXXX-XXXXX", () => {
  const key = generateKey();
  assert.match(key, /^CSPOS-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  assert.notEqual(generateKey(), key); // случайност
});

test("normalizeKey приема малки букви, интервали и липсващи тирета", () => {
  const key = generateKey();
  const messy = key.toLowerCase().replaceAll("-", " ");
  assert.equal(normalizeKey(messy), key);
  assert.equal(normalizeKey("нищо-такова"), null);
  assert.equal(normalizeKey("CSPOS-КРАТЪК"), null);
});

test("hashKey е детерминистичен и не пази ключа", () => {
  const key = generateKey();
  assert.equal(hashKey(key), hashKey(key));
  assert.equal(hashKey(key).length, 64);
  assert.ok(!hashKey(key).includes("CSPOS"));
});

test("подписан blob се верифицира и носи payload-а", () => {
  const { publicKeyPem, privateKeyPem } = generateSigningKeys();
  const payload = { v: 1, licenseId: "lic_x", plan: "yearly", seats: 3, deviceId: "dev-1", expiresAt: 123 };
  const blob = signLicenseBlob(payload, privateKeyPem);
  assert.deepEqual(verifyLicenseBlob(blob, publicKeyPem), payload);
});

test("подправен blob или чужд ключ → null", () => {
  const a = generateSigningKeys();
  const b = generateSigningKeys();
  const blob = signLicenseBlob({ seats: 1 }, a.privateKeyPem);
  assert.equal(verifyLicenseBlob(blob, b.publicKeyPem), null); // чужд публичен ключ
  const [body, sig] = blob.split(".");
  const forged = `${Buffer.from(JSON.stringify({ seats: 99 })).toString("base64url")}.${sig}`;
  assert.equal(verifyLicenseBlob(forged, a.publicKeyPem), null); // сменен payload
  assert.equal(verifyLicenseBlob(`${body}`, a.publicKeyPem), null); // липсващ подпис
});

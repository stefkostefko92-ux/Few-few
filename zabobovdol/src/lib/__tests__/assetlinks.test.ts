import test from "node:test";
import assert from "node:assert/strict";
import { parseFingerprints, buildAssetlinks } from "@/lib/assetlinks";

const FP1 = "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90";

test("parseFingerprints приема няколко реда и нормализира до главни букви", () => {
  const out = parseFingerprints(`${FP1.toLowerCase()}\n${FP1}`);
  // Двата са еднакви след нормализиране → остава един.
  assert.deepEqual(out, [FP1]);
});

test("parseFingerprints отхвърля невалидни редове", () => {
  assert.deepEqual(parseFingerprints("не-е-отпечатък\n123"), []);
});

test("parseFingerprints приема и разделени със запетая", () => {
  const out = parseFingerprints(`${FP1}, ${FP1}`);
  assert.equal(out.length, 1);
});

test("buildAssetlinks връща празен масив без валидни данни", () => {
  assert.deepEqual(buildAssetlinks("", []), []);
  assert.deepEqual(buildAssetlinks("eu.carbonstealth.zabobovdol", []), []);
});

test("buildAssetlinks прави валиден statement", () => {
  const out = buildAssetlinks("eu.carbonstealth.zabobovdol", [FP1]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(out[0].target.namespace, "android_app");
  assert.equal(out[0].target.package_name, "eu.carbonstealth.zabobovdol");
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, [FP1]);
});

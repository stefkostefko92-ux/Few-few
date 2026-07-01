import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sniffImageType,
  isSafeStoredName,
  contentTypeForName,
  newStoredName,
} from "@/lib/uploads";

test("sniffImageType разпознава PNG/JPEG/GIF/WEBP по магични байтове", () => {
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), "png");
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
  assert.equal(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])), "gif");
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffImageType(webp), "webp");
});

test("sniffImageType отхвърля SVG/текст/къси буфери (XSS защита)", () => {
  const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>");
  assert.equal(sniffImageType(svg), null);
  assert.equal(sniffImageType(new Uint8Array([1, 2, 3])), null);
  assert.equal(sniffImageType(new TextEncoder().encode("<script>alert(1)</script>")), null);
});

test("isSafeStoredName приема само <uuid>.<ext>, спира traversal", () => {
  assert.ok(isSafeStoredName("2b1f9c34-5e6a-4b7c-8d9e-0f1a2b3c4d5e.png"));
  assert.ok(!isSafeStoredName("../../etc/passwd"));
  assert.ok(!isSafeStoredName("evil.svg"));
  assert.ok(!isSafeStoredName("a.png/../b"));
});

test("contentTypeForName връща правилния MIME или null", () => {
  assert.equal(contentTypeForName("x.png"), "image/png");
  assert.equal(contentTypeForName("x.jpg"), "image/jpeg");
  assert.equal(contentTypeForName("x.txt"), null);
});

test("newStoredName дава уникално име с правилно разширение", () => {
  const a = newStoredName("jpeg");
  const b = newStoredName("jpeg");
  assert.match(a, /\.jpg$/);
  assert.notEqual(a, b);
  assert.ok(isSafeStoredName(a));
});

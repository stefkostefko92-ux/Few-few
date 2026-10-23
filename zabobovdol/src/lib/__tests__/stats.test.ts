import test from "node:test";
import assert from "node:assert/strict";
import { normalizePath, normalizeSource, sofiaDay, isBot } from "@/lib/stats-core";

test("пътят: без query/hash, без опашна черта, чужд вход → /other", () => {
  assert.equal(normalizePath("/kak-da/fb-kakvo-e?s=share#x"), "/kak-da/fb-kakvo-e");
  assert.equal(normalizePath("/uslugi/"), "/uslugi");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath("/a<script>"), "/other");
  assert.equal(normalizePath("/" + "x".repeat(500)).length, 160);
});

test("източникът: маркерът печели; иначе домейнът на препращащия; иначе direct", () => {
  assert.equal(normalizeSource("share", "https://google.com/", "zabobovdol.carbonstealth.eu"), "share");
  assert.equal(normalizeSource("qr-apteka-centar", null, null), "qr-apteka-centar");
  assert.equal(normalizeSource("<bad>", null, null), "other");
  assert.equal(normalizeSource("", "https://www.google.bg/search?q=x", null), "google");
  assert.equal(normalizeSource("", "https://l.facebook.com/l.php?u=x", null), "facebook");
  assert.equal(normalizeSource("", "https://zabobovdol.carbonstealth.eu/uslugi", "zabobovdol.carbonstealth.eu"), "internal");
  assert.equal(normalizeSource("", "https://www.example.org/a", null), "site:example.org");
  assert.equal(normalizeSource("", null, null), "direct");
  assert.equal(normalizeSource("", "не-url", null), "direct");
});

test("денят е по София (23:30 UTC през лятото е вече следващият ден)", () => {
  assert.equal(sofiaDay(new Date("2026-07-01T22:30:00Z")).toISOString().slice(0, 10), "2026-07-02");
  assert.equal(sofiaDay(new Date("2026-01-01T21:30:00Z")).toISOString().slice(0, 10), "2026-01-01");
});

test("ботовете и празният user agent не се броят", () => {
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBot(""), true);
  assert.equal(isBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"), false);
});

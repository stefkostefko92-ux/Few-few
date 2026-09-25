import test from "node:test";
import assert from "node:assert/strict";
import { encodeState, decodeState } from "@/lib/share";

// Споделеният линк е НЕДОВЕРЕН вход — повреден payload трябва да върне null,
// не да хвърли (иначе редакторът се срива при чужд/счупен линк).

test("споделяне: кирилица минава без загуба (roundtrip)", () => {
  const state = { title: "Домашно сладко", slogan: "Сладко, изпечено с любов" };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("споделяне: повреден base64 → null", () => {
  assert.equal(decodeState("!!!не-е-base64!!!"), null);
});

test("споделяне: валиден base64, но не JSON → null", () => {
  assert.equal(decodeState(encodeStateRaw("това не е json")), null);
});

test("споделяне: JSON, който не е обект → null", () => {
  assert.equal(decodeState(encodeStateRaw("42")), null);
  assert.equal(decodeState(encodeStateRaw("null")), null);
  assert.equal(decodeState(encodeStateRaw('"низ"')), null);
});

/** Кодира произволен низ като base64url (без JSON.stringify) — за негативните случаи. */
function encodeStateRaw(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

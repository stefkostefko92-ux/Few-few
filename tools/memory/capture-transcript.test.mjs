// capture-transcript.test.mjs — пред-филтърът трябва да вижда learn блок в РЕАЛЕН JSONL транскрипт.
//
// Дефектът: транскриптът е JSONL и новият ред след ```learn в него е екраниран (`\n`, два знака).
// Филтърът искаше истински нов ред, затова връщаше „няма learn блок" за ВСЕКИ реален транскрипт —
// ръчният път за записване на поуки (когато SubagentStop не тръгне за фонов агент) беше тих no-op.

import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLearnBlock } from "./capture-transcript.mjs";

const BLOCK = "```learn\nagent: dizayner\nlessons: []\n```";

test("разпознава learn блок в JSONL ред (екраниран нов ред)", () => {
  const line = JSON.stringify({ message: { content: [{ type: "tool_use", input: { message: "Доклад\n" + BLOCK } }] } });
  assert.ok(!line.includes("```learn\n"), "фикстурата трябва да е с екраниран нов ред, както в реален транскрипт");
  assert.equal(hasLearnBlock(line), true);
});

test("разпознава и суров текст с истински нов ред", () => {
  assert.equal(hasLearnBlock("текст\n" + BLOCK), true);
});

test("не се задейства без блок или при друга дума след ```learn", () => {
  assert.equal(hasLearnBlock("нищо тук"), false);
  assert.equal(hasLearnBlock("```learning\nx\n```"), false);
  assert.equal(hasLearnBlock(""), false);
});

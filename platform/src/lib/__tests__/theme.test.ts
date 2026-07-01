import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeAccent,
  safeFont,
  darken,
  contrastText,
  themeVars,
  DEFAULT_ACCENT,
} from "@/lib/theme";

test("safeAccent приема валиден hex, иначе подразбиране", () => {
  assert.equal(safeAccent("#AABBCC"), "#aabbcc");
  assert.equal(safeAccent("#zzz"), DEFAULT_ACCENT);
  assert.equal(safeAccent(""), DEFAULT_ACCENT);
  assert.equal(safeAccent(null), DEFAULT_ACCENT);
  assert.equal(safeAccent("red"), DEFAULT_ACCENT);
});

test("safeFont приема само познати ключове", () => {
  assert.equal(safeFont("serif"), "serif");
  assert.equal(safeFont("rounded"), "rounded");
  assert.equal(safeFont("comic"), "sans");
  assert.equal(safeFont(undefined), "sans");
});

test("darken връща по-тъмен валиден hex", () => {
  const d = darken("#ffffff", 0.5);
  assert.match(d, /^#[0-9a-f]{6}$/);
  assert.equal(d, "#808080");
});

test("contrastText: тъмен текст върху светъл цвят, бял върху тъмен", () => {
  assert.equal(contrastText("#ffffff"), "#0f172a");
  assert.equal(contrastText("#000000"), "#ffffff");
  assert.equal(contrastText("#4f46e5"), "#ffffff");
});

test("themeVars дава четирите CSS променливи", () => {
  const v = themeVars("#4f46e5", "serif");
  assert.equal(v["--pub-accent"], "#4f46e5");
  assert.ok(v["--pub-accent-dark"].startsWith("#"));
  assert.ok(v["--pub-accent-text"] === "#ffffff" || v["--pub-accent-text"] === "#0f172a");
  assert.match(v["--pub-font"], /serif/i);
});

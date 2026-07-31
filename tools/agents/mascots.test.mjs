// mascots.test.mjs — маскотите се ГЕНЕРИРАТ от регистъра, не се рисуват на ръка.
//
// Рискът, който гейтваме: нов агент влиза в agents.json, но остава без лице (или някой редактира
// SVG на ръка и той се разминава с генератора). И в двата случая таблото/презентацията показват
// непълен или несъответстващ флот — тихо, без никой да забележи.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mascotSvg } from "./mascots.mjs";
import { withMutation, replaceOnce } from "../lib/mutation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, "agents-dashboard", "mascots");
const TOOL = join(ROOT, "tools", "agents", "mascots.mjs");
const agents = () => {
  const reg = JSON.parse(readFileSync(join(ROOT, "agents-dashboard", "agents.json"), "utf8"));
  return reg.agents || reg;
};

test("всеки агент от регистъра има маскот", () => {
  const missing = agents().filter((a) => !existsSync(join(DIR, `${a.id}.svg`)));
  assert.deepEqual(missing.map((a) => a.id), [], "агент без лице");
});

test("няма сирачета (маскот без агент)", () => {
  const ids = new Set(agents().map((a) => `${a.id}.svg`));
  // React компонентът и CSS-ът са легитимен изход на генератора, не сирачета.
  const KEEP = new Set(["Mascot.tsx", "Mascot.css"]);
  const orphans = readdirSync(DIR).filter((f) => !KEEP.has(f) && !ids.has(f));
  assert.deepEqual(orphans, []);
});

test("файловете съвпадат с генератора (никой не ги е пипал на ръка)", () => {
  const stale = agents().filter((a) => readFileSync(join(DIR, `${a.id}.svg`), "utf8") !== mascotSvg(a));
  assert.deepEqual(stale.map((a) => a.id), [], "ръчна редакция ще се загуби при следващото генериране");
});

test("цветът идва от акцента на агента, а не е фиксиран", () => {
  const a = agents()[0];
  const svg = mascotSvg(a);
  assert.ok(svg.includes(a.accent), `${a.id}: акцентът ${a.accent} трябва да е в градиента`);
  const other = mascotSvg({ ...a, id: "proba", accent: "#ff00ff" });
  assert.ok(other.includes("#ff00ff"));
  assert.ok(!other.includes(`stop-color="${a.accent}"`), "смяна на акцента трябва да смени градиента");
});

test("SVG-то е валиден, самостоятелен документ", () => {
  for (const a of agents()) {
    const svg = readFileSync(join(DIR, `${a.id}.svg`), "utf8");
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${a.id}: липсва xmlns`);
    assert.match(svg, /viewBox="0 0 300 300"/, `${a.id}: очаквам координатната система на образеца`);
    assert.ok(svg.trimEnd().endsWith("</svg>"), `${a.id}: незатворен svg`);
    // Достъпност: екранен четец трябва да получи име, не „графика".
    assert.match(svg, /role="img"/, `${a.id}: липсва role`);
    assert.match(svg, /<title>/, `${a.id}: липсва <title>`);
    // Никакви външни ресурси — CSP на артефактите и офлайн ползване.
    assert.ok(!/xlink:href|<image|url\(http/.test(svg), `${a.id}: външен ресурс в SVG`);
  }
});

test("id-тата на градиента и филтъра са уникални per агент (иначе се смесват в обща страница)", () => {
  const ids = agents().map((a) => a.id.replace(/[^a-z0-9-]/gi, ""));
  assert.equal(new Set(ids).size, ids.length, "сблъсък на id при инлайн вграждане в едно HTML");
  for (const a of agents()) {
    const svg = readFileSync(join(DIR, `${a.id}.svg`), "utf8");
    assert.ok(svg.includes(`id="body-${a.id}"`) || svg.includes(`id="body-${a.id.replace(/[^a-z0-9-]/gi, "")}"`),
      `${a.id}: градиентът трябва да носи id на агента`);
  }
});

test("--check ПАДА при разсинхрон (доказано с мутация, не с допускане)", () => {
  const target = join(DIR, `${agents()[0].id}.svg`);
  const status = withMutation(target, replaceOnce("<title>", "<title>РЪЧНА РЕДАКЦИЯ "), () =>
    spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" }).status);
  assert.equal(status, 1, "ръчно редактиран маскот трябва да вдигне гейта");
  // След възстановяване гейтът пак е зелен — иначе тестът е оставил репото мръсно.
  assert.equal(spawnSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" }).status, 0);
});

test("проверката е в състава на гейта", () => {
  const gate = readFileSync(join(ROOT, "tools", "agents", "gate.mjs"), "utf8");
  assert.match(gate, /id:\s*"mascots"/);
  const rec = gate.slice(gate.indexOf('id: "mascots"'));
  assert.ok(!/required:\s*false/.test(rec.slice(0, rec.indexOf("}"))), "трябва да е задължителна");
});

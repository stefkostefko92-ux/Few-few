// Каталогът на плъгините от панела (CONTRACT §14) е на пет места — mods-lib.sh, агентът, C# PluginCatalog,
// панелът (TS) и договорът. Този тест ги държи еднакви: id, вид, папка, конфиг и дали има „по подразбиране“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PANEL_PLUGINS } from "../server/agent/agent-plugins.mjs";

const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const read = (p) => readFileSync(path(p), "utf8");

function lib(fn, ...args) {
  const r = spawnSync("bash", ["-c", `set -euo pipefail; source "${path("server/mods/mods-lib.sh")}"; "$@"`, "lib", fn, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const bashIds = read("server/mods/mods-lib.sh").match(/^CS2DM_PANEL_MODS="([^"]+)"$/m)[1].split(" ");
const lockNames = read("server/mods/mods.lock").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split("\t")[0]);

/** C#: new("id", "Folder"|null, "Config"|null, true|false) */
const csharp = [...read("plugins/src/CarbonStealth.Logic/PluginCatalog.cs").matchAll(/new\("([a-z0-9]+)", (null|"[A-Za-z]+"), (null|"[A-Za-z]+"), (true|false)\)/g)]
  .map(([, id, folder, config, def]) => ({ id, folder: folder === "null" ? null : folder.slice(1, -1), config: config === "null" ? null : config.slice(1, -1), hasDefault: def === "true" }));

/** TS: { id: 'x', kind: 'css', config: 'X' | null, hasDefault: true } — по един ред. */
const tsPath = "app/src/admin/plugins-catalog.ts";
const ts = [...read(tsPath).matchAll(/\{ id: '([a-z0-9]+)', kind: '(css|metamod)', config: (null|'[A-Za-z]+'), hasDefault: (true|false) \}/g)]
  .map(([, id, kind, config, def]) => ({ id, kind, config: config === "null" ? null : config.slice(1, -1), hasDefault: def === "true" }));

test("едни и същи id в същия ред: mods-lib · агентът · C# · панелът; всички са в mods.lock и без ядрото", () => {
  const agentIds = PANEL_PLUGINS.map((p) => p.id);
  assert.deepEqual(agentIds, bashIds);
  assert.deepEqual(csharp.map((p) => p.id), bashIds);
  assert.deepEqual(ts.map((p) => p.id), bashIds);
  for (const id of bashIds) {
    assert.ok(lockNames.includes(id), `${id} в mods.lock`);
    assert.match(id, /^[a-z0-9]{1,32}$/, "polkit и инстанцията на cs2-plugins@ приемат само това");
  }
  for (const core of ["metamod", "counterstrikesharp", "deathmatch", "multiaddonmanager"]) assert.ok(!bashIds.includes(core), core);
  assert.deepEqual([...lockNames.filter((n) => !["metamod", "counterstrikesharp", "deathmatch", "multiaddonmanager"].includes(n))].sort(), [...bashIds].sort(),
    "нов мод в mods.lock → и в панела (или изрично в ядрото)");
});

test("пътища и видове: агентът = cs2dm_mod_paths; C# папка = папката на CSS плъгина; видът навсякъде", () => {
  for (const p of PANEL_PLUGINS) {
    assert.equal(lib("cs2dm_mod_paths", p.id), p.path, p.id);
    const cs = csharp.find((c) => c.id === p.id);
    const tsRow = ts.find((c) => c.id === p.id);
    assert.equal(tsRow.kind, p.kind, p.id);
    if (p.kind === "css") assert.equal(`addons/counterstrikesharp/plugins/${cs.folder}`, p.path, p.id);
    else assert.equal(cs.folder, null, `${p.id}: Metamod няма папка за css_plugins`);
  }
});

test("конфигът: C# = панелът; „по подразбиране“ = нашият файл в server/mods/config (cs2dm_mod_config)", () => {
  for (const cs of csharp) {
    const tsRow = ts.find((c) => c.id === cs.id);
    assert.deepEqual({ config: tsRow.config, hasDefault: tsRow.hasDefault }, { config: cs.config, hasDefault: cs.hasDefault }, cs.id);
    const ours = lib("cs2dm_mod_config", cs.id) || null;
    if (cs.hasDefault) {
      assert.equal(ours, cs.config, `${cs.id}: install-mods.sh пише ${cs.config}.default.json`);
      assert.ok(existsSync(path(`server/mods/config/${cs.config}.json`)), cs.id);
    } else {
      assert.equal(ours, null, `${cs.id}: без наш конфиг — без „по подразбиране“`);
    }
  }
  assert.equal(csharp.find((c) => c.id === "cheatertroll").config, "CheaterTroll", "списъкът с читъри се редактира, но не се нулира");
});

test("договорът §14 изрежда всеки мод", () => {
  const section = read("CONTRACT.md").split("## 14.")[1] ?? "";
  for (const id of bashIds) assert.match(section, new RegExp(`\`${id}\``), id);
});

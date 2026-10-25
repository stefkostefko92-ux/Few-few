import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const read = (p) => readFileSync(path(p), "utf8");

const lockRows = read("server/mods/mods.lock")
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split("\t"));

test("mods.lock: всеки ред е заключен по HTTPS URL и sha256", () => {
  assert.ok(lockRows.length >= 3);
  const names = new Set();
  for (const [name, version, url, sha, method, ...rest] of lockRows) {
    assert.equal(rest.length, 0, `излишни полета: ${name}`);
    assert.match(name, /^[a-z0-9-]+$/);
    assert.ok(!names.has(name), `повторен: ${name}`);
    names.add(name);
    assert.match(url, /^https:\/\//, `${name}: само HTTPS`);
    assert.ok(url.includes(version.replace(/^2\.0\.0-/, "")), `${name}: версията не е в URL-а`);
    assert.match(sha, /^[0-9a-f]{64}$/, `${name}: sha256`);
    assert.ok(["tar", "zip", "cssplugin"].includes(method), `${name}: метод ${method}`);
  }
  for (const needed of ["metamod", "counterstrikesharp", "deathmatch"]) assert.ok(names.has(needed), needed);
});

test("CounterStrikeSharp: with-runtime пакетът (вграден .NET) и правилата на Valve включени", () => {
  const css = lockRows.find(([n]) => n === "counterstrikesharp");
  assert.match(css[2], /counterstrikesharp-with-runtime-linux-/);
  const core = JSON.parse(read("server/mods/config/core.json"));
  assert.equal(core.FollowCS2ServerGuidelines, true);
  assert.equal(core.AutoUpdateEnabled, true, "gamedata се обновява сама след ъпдейт на CS2");
});

const dm = JSON.parse(read("server/mods/config/Deathmatch.json"));

test("Deathmatch: без база (нула MySQL)", () => {
  assert.equal(dm["Save Players Weapons"], false);
  assert.equal(dm["Database Connection"].Host, "");
  assert.equal(dm["Database Connection"].Password, "");
});

test("Deathmatch: без pay-to-win — VIP е равен на обикновения играч", () => {
  const ps = dm["Players Gameplay Settings"];
  assert.deepEqual(ps["VIP Players"], ps["Non VIP Players"]);
  for (const [name, pref] of Object.entries(dm["Client Preferences"])) {
    assert.equal(pref["Only for VIP"], false, name);
  }
  for (const [weapon, perMode] of Object.entries(dm["Weapons Restrict"].Weapons)) {
    for (const [mode, byType] of Object.entries(perMode)) {
      assert.deepEqual(byType.VIP, byType.NonVIP, `${weapon} режим ${mode}`);
    }
  }
});

test("Deathmatch: FFA, режими на една карта, AWP разрешен (с таван)", () => {
  assert.equal(dm["Gameplay Settings"]["Free For All"], true);
  assert.equal(dm["Gameplay Settings"]["Custom Modes"], true);
  const modes = Object.values(dm["Custom Modes"]);
  assert.ok(modes.length >= 4);
  assert.ok(modes[0].PrimaryWeapons.includes("weapon_awp"), "AWP в основния режим");
  assert.ok(dm["Weapons Restrict"].Weapons.weapon_awp["0"].NonVIP.Global >= 1);
  assert.equal(dm.ConfigVersion, 1);
});

/** Пуска функция от cs2dm-lib.sh върху копие на истинския gameinfo.gi. */
function withGameinfo(fn) {
  const dir = mkdtempSync(join(tmpdir(), "cs2dm-gi-"));
  const gi = join(dir, "gameinfo.gi");
  copyFileSync(path("test/fixtures/gameinfo.gi"), gi);
  const run = (cmd) =>
    execFileSync("bash", ["-c", `set -euo pipefail; source "${path("server/cs2dm-lib.sh")}"; ${cmd}`], {
      env: { ...process.env, CS2DM_GAMEINFO: gi, CS2DM_STATE_DIR: join(dir, "state") },
      encoding: "utf8",
    });
  try {
    fn({ gi, run });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("gameinfo.gi: редът за Metamod влиза точно под Game_LowViolence, веднъж", () => {
  withGameinfo(({ gi, run }) => {
    run("cs2dm_patch_gameinfo; cs2dm_patch_gameinfo");
    const lines = readFileSync(gi, "utf8").split("\n");
    const at = lines.findIndex((l) => /^\s*Game_LowViolence\s+csgo_lv/.test(l));
    assert.equal(lines[at + 1], "\t\t\tGame\tcsgo/addons/metamod");
    assert.equal(lines.filter((l) => l.includes("csgo/addons/metamod")).length, 1);
    run("cs2dm_gameinfo_patched");
  });
});

test("gameinfo.gi: махането връща файла байт по байт", () => {
  withGameinfo(({ gi, run }) => {
    const original = readFileSync(gi, "utf8");
    run("cs2dm_patch_gameinfo; cs2dm_unpatch_gameinfo; cs2dm_unpatch_gameinfo");
    assert.equal(readFileSync(gi, "utf8"), original);
    assert.throws(() => run("cs2dm_gameinfo_patched"));
  });
});

test("gameinfo.gi: непознат формат → отказ, файлът остава непокътнат", () => {
  withGameinfo(({ gi, run }) => {
    writeFileSync(gi, '"GameInfo"\n{\n\tGame\tcsgo\n}\n');
    const before = readFileSync(gi, "utf8");
    assert.throws(() => run("cs2dm_patch_gameinfo"));
    assert.equal(readFileSync(gi, "utf8"), before);
  });
});

test("зареждането на плъгин се доказва от лога на CSS по час, без journald", () => {
  const dir = mkdtempSync(join(tmpdir(), "cs2dm-css-"));
  try {
    const bin = join(dir, "bin");
    execFileSync("mkdir", ["-p", bin, join(dir, "logs")]);
    // journald без нито един ред от играта (както на VPS-а): проверката не бива да зависи от него.
    writeFileSync(join(bin, "journalctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(
      join(dir, "logs", "log-all20261024.txt"),
      [
        "2026-10-24 15:00:14.901 +02:00 [INFO] (cssharp:PluginContext) Finished loading plugin Deathmatch",
        "2026-10-24 15:01:58.800 +02:00 [INFO] (cssharp:PluginContext) Finished loading plugin CarbonStealth",
        "",
      ].join("\n"),
    );
    const loaded = (since, name) => {
      try {
        execFileSync("bash", ["-c", `set -euo pipefail; source "${path("server/cs2dm-lib.sh")}"; cs2dm_plugin_loaded_since ${since} ${name}`], {
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CS2DM_CSS_LOGS: join(dir, "logs") },
          stdio: "pipe",
        });
        return true;
      } catch {
        return false;
      }
    };
    const at = (s) => Math.floor(Date.parse(s) / 1000);
    assert.equal(loaded(at("2026-10-24T13:00:00Z"), "Deathmatch"), true, "ред след момента");
    assert.equal(loaded(at("2026-10-24T13:01:00Z"), "Deathmatch"), false, "старият ред от същия ден не важи");
    assert.equal(loaded(at("2026-10-24T13:01:00Z"), "CarbonStealth"), true);
    assert.equal(loaded(at("2026-10-24T13:02:00Z"), "CarbonStealth"), false);
    assert.equal(loaded(at("2026-10-24T13:00:00Z"), "Missing"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("защита при респаун: наша в CarbonStealth (5 s), тази на Deathmatch е изключена, ванилов резерв в cfg", () => {
  // DM 1.3.6 проверява DesignerName „cs_player_pawn“ (пешката е „player“) → неговата никога не тръгва; ако
  // бъде поправена, двете не бива да се наслагват — нашата сваля защитата при изстрел, неговата не.
  const players = dm["Players Gameplay Settings"];
  assert.equal(players["Non VIP Players"]["Spawn Protection Time"], 0);
  assert.equal(players["VIP Players"]["Spawn Protection Time"], 0);
  const cs = read("plugins/src/CarbonStealth/SpawnProtection.cs");
  assert.match(cs, /entity\.DesignerName != "player"/);
  assert.match(cs, /\? HookResult\.Handled : HookResult\.Continue/, "само Handled спира щетата в CSS 1.0.378");
  // Зелено оцветяване на модела (вижда се само в пряка видимост) — НЕ контурен glow: в CS2 той минава
  // през стени (CGlowProperty няма настройка за това). Изчезва с края на защитата и при Unload.
  assert.match(cs, /ShieldTint = Color\.FromArgb\(255, 40, 220, 80\)/);
  assert.doesNotMatch(cs, /\.Glow\.|prop_dynamic|FollowEntity/, "без контурен glow през стени");
  assert.match(cs, /private void EndShield\(int slot\)\s*\{\s*_shield\.End\(slot\);\s*Untint\(slot\);/);
  assert.match(cs, /pawn\.Render\.ToArgb\(\) == ShieldTint\.ToArgb\(\)/, "не пипа чужд цвят (замразяване)");
  assert.match(read("plugins/src/CarbonStealth/CarbonStealthPlugin.cs"), /UntintAll\(\);/);
  assert.match(read("plugins/src/CarbonStealth/PluginConfig.cs"), /SpawnProtectionSeconds \{ get; set; \} = 5;/);
  assert.match(read("server/cfg/gamemode_deathmatch_server.cfg"), /^mp_respawn_immunitytime 5$/m, "ванилов режим без модове");
});

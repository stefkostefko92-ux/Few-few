// Модовете от mods.lock след ядрото (Metamod + CSS + DM): решенията в mods-lib.sh, нашите конфиги,
// демотата (срок 14 дни + таван) и червените линии — GSLT (нищо за предмети/рангове) и без pay-to-win.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const read = (p) => readFileSync(path(p), "utf8");
const json = (p) => JSON.parse(read(p));
const LOCK = path("server/mods/mods.lock");
const rows = read("server/mods/mods.lock")
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => l.split("\t"));
const names = rows.map(([n]) => n);
const CORE = ["metamod", "counterstrikesharp", "deathmatch"];

/** Пуска функция от mods-lib.sh; връща {ok, out}. */
function lib(fn, ...args) {
  const r = spawnSync("bash", ["-c", `set -euo pipefail; source "${path("server/mods/mods-lib.sh")}"; "$@"`, "lib", fn, ...args], {
    encoding: "utf8",
  });
  return { ok: r.status === 0, out: r.stdout };
}

test("mods.lock: нито един мод не симулира предмети или рангове (GSLT) и нищо платено", () => {
  const banned = /skin|knife|glove|agent|sticker|music.?kit|weapon.?paint|rank|medal|vip|store|shop|credit/i;
  for (const [name, , url] of rows) {
    assert.doesNotMatch(name, banned, name);
    assert.doesNotMatch(url, banned, url);
  }
  for (const needed of ["serverlistplayersfix", "quakesounds", "cosmetics", "demorecorder", "cheatertroll", "metablock"]) {
    assert.ok(names.includes(needed), needed);
  }
});

test("mods.lock: архивите на Kandru са cssplugin, всичко е от releases/download", () => {
  for (const [name, version, url, , method] of rows) {
    if (url.includes("github.com/Kandru/")) assert.equal(method, "cssplugin", name);
    if (url.startsWith("https://github.com/")) assert.match(url, new RegExp(`/releases/download/v?${version.replace(/\./g, "\\.")}/`), name);
  }
});

test("addon-и: на собственика първо, звуците на quakesounds накрая, без повторения", () => {
  assert.equal(lib("cs2dm_addon_list", "", "1").out, "3461824328");
  assert.equal(lib("cs2dm_addon_list", "", "0").out, "");
  assert.equal(lib("cs2dm_addon_list", "3456789012", "1").out, "3456789012,3461824328");
  assert.equal(lib("cs2dm_addon_list", "3461824328,3456789012", "1").out, "3461824328,3456789012");
  assert.equal(lib("cs2dm_addon_list", '"3456789012, 3456789013"', "0").out, "3456789012,3456789013");
  for (const bad of ["abc", "12345", "3456789012;rm", "3456789012,,1"]) assert.equal(lib("cs2dm_addon_list", bad, "1").ok, false, bad);
});

test("флагове: 0/1 и числа в граници, иначе отказ", () => {
  assert.equal(lib("cs2dm_flag", "", "1").out, "1");
  assert.equal(lib("cs2dm_flag", "0", "1").out, "0");
  assert.equal(lib("cs2dm_flag", "yes", "1").ok, false);
  assert.equal(lib("cs2dm_int", "", "10", "1", "500").out, "10");
  assert.equal(lib("cs2dm_int", "040", "10", "1", "500").out, "40");
  for (const bad of ["0", "501", "-1", "1e3", "x"]) assert.equal(lib("cs2dm_int", bad, "10", "1", "500").ok, false, bad);
});

test("CS2DM_SKIP_MODS: само имена от mods.lock, без ядрото и multiaddonmanager", () => {
  assert.equal(lib("cs2dm_skip_list", "", LOCK).out, "");
  assert.equal(lib("cs2dm_skip_list", "cosmetics, demorecorder,cosmetics", LOCK).out, "cosmetics,demorecorder");
  for (const bad of [...CORE, "multiaddonmanager", "nope", "Cosmetics", "cosmetics;x"]) {
    assert.equal(lib("cs2dm_skip_list", bad, LOCK).ok, false, bad);
  }
});

test("кой мод се пропуска: изключен, MultiAddonManager без addon-и, звуците спрени", () => {
  const skipped = (name, skip, addons, quake) => lib("cs2dm_mod_skipped", name, skip, addons, quake).ok;
  assert.equal(skipped("multiaddonmanager", "", "", "0"), true);
  assert.equal(skipped("multiaddonmanager", "", "3461824328", "1"), false);
  assert.equal(skipped("quakesounds", "", "3461824328", "0"), true);
  assert.equal(skipped("quakesounds", "", "3461824328", "1"), false);
  assert.equal(skipped("cosmetics", "cosmetics,metablock", "", "1"), true);
  assert.equal(skipped("metablock", "cosmetics,metablock", "", "1"), true);
  assert.equal(skipped("cheatertroll", "cosmetics,metablock", "", "1"), false);
  for (const core of CORE) assert.equal(skipped(core, "", "", "0"), false, core);
});

test("всеки мод извън ядрото знае какво да махне, когато е изключен", () => {
  for (const name of names) {
    const r = lib("cs2dm_mod_paths", name);
    if (CORE.includes(name)) {
      assert.equal(r.ok, false, name);
      continue;
    }
    assert.ok(r.ok, name);
    for (const rel of r.out.trim().split("\n")) assert.match(rel, /^addons\/[A-Za-z0-9_/.-]+$/, `${name}: ${rel}`);
  }
});

test("нашите конфиги съществуват; CheaterTroll не се презаписва (там е списъкът с читъри)", () => {
  for (const name of names) {
    const cfg = lib("cs2dm_mod_config", name).out;
    if (cfg) assert.ok(existsSync(path(`server/mods/config/${cfg}.json`)), cfg);
  }
  assert.equal(lib("cs2dm_mod_config", "cheatertroll").out, "");
  assert.doesNotMatch(read("server/mods/install-mods.sh"), /CheaterTroll\.json/);
});

test("Cosmetics: само лъчът убиец → жертва (~1.5 s), нищо друго", () => {
  const modules = json("server/mods/config/Cosmetics.json").modules;
  for (const [name, mod] of Object.entries(modules)) assert.equal(mod.enabled, name === "deathbeam", name);
  assert.equal(modules.deathbeam.timeout, 1.5);
});

test("QuakeSounds: само звук (чатът е на CarbonStealth), FFA броене, без двойни звуци с DM", () => {
  const qs = json("server/mods/config/QuakeSounds.json");
  assert.equal(qs.messages.enable_chat_message, false);
  assert.equal(qs.messages.enable_center_message, false);
  // FFA: половината „врагове“ са в същия отбор — иначе серията не се брои.
  assert.equal(qs.global.count_team_kills, true);
  assert.equal(qs.global.count_self_kills, false);
  // Headshot/нож свири DM плъгинът; teamkill/lastmanstanding нямат смисъл във FFA.
  for (const key of ["headshot", "knifekill", "teamkill", "selfkill", "lastmanstanding"]) assert.ok(!(key in qs.sounds), key);
  for (const [key, s] of Object.entries(qs.sounds)) assert.match(s._sound, /^QuakeSounds[DF]\.\w+$/, key);
  assert.deepEqual(qs.data, { player_muted: [], player_languages: {} });
});

test("MetaBlock: крие само meta / css_plugins / css; минава само собственикът", () => {
  const mb = json("server/mods/config/MetaBlock.json");
  assert.deepEqual(mb.BlockedCommands, ["meta", "css_plugins", "css"]);
  assert.equal(mb.AdminFlag, "@css/root");
});

test("Deathmatch: звуците за попадение/убийство/HS/нож са включени по подразбиране, без VIP", () => {
  const prefs = json("server/mods/config/Deathmatch.json")["Client Preferences"];
  for (const name of ["Kill Sound", "Headshot Kill Sound", "Knife Kill Sound", "Hit Sound"]) {
    assert.equal(prefs[name]["Default value"], true, name);
    assert.equal(prefs[name]["Only for VIP"], false, name);
  }
});

const unit = read("server/systemd/cs2-demos-clean.service");
const DEMO_DIR = "/opt/cs2/server/game/csgo/addons/counterstrikesharp/data/demos";

test("демота: една папка и един срок (14 дни) — конфиг, unit, mods-lib и политиката", () => {
  assert.equal(json("server/mods/config/DemoRecorder.json").demo_folder, `${DEMO_DIR}/`);
  assert.ok(read("server/mods/mods-lib.sh").includes(`CS2DM_DEMO_DIR=${DEMO_DIR}\n`));
  const exec = unit.match(/^ExecStart=\/usr\/local\/lib\/cs2dm\/demos-clean\.sh (\S+) (\d+)$/m);
  assert.ok(exec, "ExecStart");
  assert.equal(exec[1], DEMO_DIR);
  const days = Number(read("app/src/content.ts").match(/demosDays: (\d+)/)[1]);
  assert.equal(Number(exec[2]), days);
  assert.equal(days, 14);
});

test("cs2-demos-clean.service: cs2 без тайни, без мрежа, пише само в папката с демотата", () => {
  assert.match(unit, /^User=cs2$/m);
  assert.doesNotMatch(unit, /EnvironmentFile/);
  assert.match(unit, /^PrivateNetwork=yes$/m);
  assert.match(unit, /^ProtectSystem=strict$/m);
  assert.deepEqual(unit.match(/^ReadWritePaths=.*$/gm), [`ReadWritePaths=-${DEMO_DIR}`]);
  assert.match(read("server/systemd/cs2-demos-clean.timer"), /^OnCalendar=hourly$/m);
});

test("SourceTV: без зрители на живо и без глас в демото", () => {
  const cfg = read("server/cfg/gamemode_deathmatch_server.cfg");
  assert.match(cfg, /^tv_maxclients 0$/m);
  assert.match(cfg, /^tv_relayvoice 0$/m);
  assert.doesNotMatch(cfg, /^tv_enable/m); // включва го DemoRecorder само когато има хора
});

/** Папка с демота: [име, възраст в минути, размер]. */
function withDemos(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "cs2dm-demos-"));
  try {
    for (const [name, ageMin, size] of files) {
      execFileSync("truncate", ["-s", String(size), join(dir, name)]);
      execFileSync("touch", ["-d", `@${Math.floor(Date.now() / 1000) - ageMin * 60}`, join(dir, name)]);
    }
    fn(dir, () => readdirSync(dir).sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const clean = (...args) => spawnSync("bash", [path("server/mods/demos-clean.sh"), ...args], { encoding: "utf8" });
const MB = 1024 * 1024;

test("demos-clean.sh: по-старите от 14 дни се трият, другите остават", () => {
  withDemos([["old.dem", 14 * 1440 + 5, 10], ["day13.dem", 13 * 1440, 10], ["now.dem", 1, 10], ["note.txt", 30 * 1440, 1]], (dir, ls) => {
    assert.equal(clean(dir, "14").status, 0);
    assert.deepEqual(ls(), ["day13.dem", "note.txt", "now.dem"]);
  });
});

test("demos-clean.sh: над тавана — най-старите първо; текущият запис остава", () => {
  withDemos([["a.dem", 3 * 1440, 600 * MB], ["b.dem", 2 * 1440, 600 * MB], ["c.dem", 60, 300 * MB], ["live.dem", 2, 600 * MB]], (dir, ls) => {
    assert.equal(clean(dir, "14", "1").status, 0);
    assert.deepEqual(ls(), ["c.dem", "live.dem"]);
  });
  withDemos([["live1.dem", 1, 700 * MB], ["live2.dem", 3, 700 * MB]], (dir, ls) => {
    assert.equal(clean(dir, "14", "1").status, 0);
    assert.deepEqual(ls(), ["live1.dem", "live2.dem"]);
  });
});

test("demos-clean.sh: лоши аргументи → отказ, липсваща папка → нищо", () => {
  assert.equal(clean("/nonexistent-cs2dm", "14").status, 0);
  for (const bad of [["/tmp", "0"], ["/tmp", "x"], ["/tmp", "14", "0"], ["/tmp", "14", "1e3"]]) {
    assert.equal(clean(...bad).status, 2, bad.join(" "));
  }
});

test("install-mods.sh: mods-lib, cssplugin, таймерът за демотата, без тайни в изхода", () => {
  const sh = read("server/mods/install-mods.sh");
  assert.match(sh, /^source "\$SRC_DIR\/mods-lib\.sh"$/m);
  assert.match(sh, /cssplugin\)/);
  assert.match(sh, /systemctl enable --now cs2-demos-clean\.timer/);
  assert.match(sh, /install -d -o "\$CS2_USER" -g "\$CS2_USER" -m 0750 "\$CS2DM_DEMO_DIR"/);
  assert.match(sh, /rm -rf -- "\$\{CSGO_DIR:\?\}\/\$rel"/);
});

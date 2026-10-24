import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Само cvars, проверени в dump-а на билд 1.41.9.2 (SteamDatabase/GameTracking-CS2,
// DumpSource2/convars.txt). Нов cvar влиза тук САМО след проверка в dump-а — несъществуващ cvar
// CS2 тихо игнорира и настройката просто не действа.
const KNOWN_CVARS = new Set([
  "hostname", "sv_tags", "sv_lan", "sv_cheats", "sv_hibernate_when_empty",
  "mp_timelimit", "mp_respawn_immunitytime", "mp_match_end_changelevel", "mp_match_restart_delay", "mp_endmatch_votenextmap",
  "bot_quota", "bot_quota_mode", "bot_difficulty", "bot_join_after_player",
  "tv_maxclients", "tv_relayvoice",
  "sv_max_queries_sec", "sv_max_queries_sec_global", "sv_max_queries_window",
]);

/** @returns {Map<string, string>} cvar → стойност (без коментари и кавички) */
function parseCfg(text) {
  const out = new Map();
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(.*)$/);
    assert.ok(m, `ред без стойност: ${raw}`);
    out.set(m[1], m[2].replace(/^"(.*)"$/, "$1"));
  }
  return out;
}

const cfg = parseCfg(read("server/cfg/gamemode_deathmatch_server.cfg"));

test("името на сървъра е точно „CarbonStealth.eu | Dust2 DM“", () => {
  assert.equal(cfg.get("hostname"), "CarbonStealth.eu | Dust2 DM");
});

test("cfg ползва само проверени cvars", () => {
  for (const name of cfg.keys()) assert.ok(KNOWN_CVARS.has(name), `непроверен cvar: ${name}`);
});

test("cfg не носи тайни и не пуска читове", () => {
  for (const banned of ["rcon_password", "sv_setsteamaccount", "sv_password"]) {
    assert.ok(!cfg.has(banned), `${banned} е тайна — мястото ѝ е /etc/cs2/cs2.env`);
  }
  assert.equal(cfg.get("sv_cheats"), "0");
  assert.equal(cfg.get("sv_lan"), "0");
});

test("никъде не се изключва FollowCS2ServerGuidelines (риск от GSLT бан)", () => {
  const files = ["server/cfg/gamemode_deathmatch_server.cfg", "server/install.sh", "server/update.sh",
    "server/cs2dm-lib.sh", "server/systemd/cs2.service", "server/mods/install-mods.sh", "server/mods/config/core.json"];
  for (const f of files) assert.doesNotMatch(read(f), /FollowCS2ServerGuidelines"?\s*[:=]\s*false/i, f);
});

const unit = read("server/systemd/cs2.service");

test("cs2.service: Deathmatch само на Dust2, през cs2.sh, тайните от env файла", () => {
  assert.match(unit, /^User=cs2$/m);
  assert.match(unit, /^EnvironmentFile=\/etc\/cs2\/cs2\.env$/m);
  assert.match(unit, /ExecStart=\/opt\/cs2\/server\/game\/cs2\.sh -dedicated /);
  assert.match(unit, /\+game_type 1 \+game_mode 2 \+mapgroup mg_de_dust2 \+map de_dust2/);
  assert.match(unit, /\+sv_setsteamaccount \$\{CS2_GSLT\}/);
});

test("cs2.service: проверката за GSLT не вписва токена в командния ред", () => {
  const pre = unit.split("\n").find((l) => l.startsWith("ExecStartPre="));
  assert.ok(pre);
  assert.match(pre, /\$\$CS2_GSLT/);
  assert.doesNotMatch(pre.replaceAll("$$CS2_GSLT", ""), /\$\{?CS2_GSLT/);
});

test("cs2.service: втвърдено, но без MemoryDenyWriteExecute (.NET JIT)", () => {
  for (const d of ["NoNewPrivileges=yes", "PrivateTmp=yes", "ProtectSystem=strict", "ReadWritePaths=/opt/cs2", "ProtectHome=yes"]) {
    assert.ok(unit.includes(d), d);
  }
  assert.doesNotMatch(unit, /^MemoryDenyWriteExecute=/m);
});

test("примерният env файл е без стойност за GSLT", () => {
  assert.match(read("server/cs2.env.example"), /^CS2_GSLT=$/m);
});

test("shell скриптовете са валиден bash със set -euo pipefail", () => {
  for (const f of ["server/install.sh", "server/update.sh", "server/mods/install-mods.sh"]) {
    execFileSync("bash", ["-n", new URL(`../${f}`, import.meta.url).pathname]);
    assert.match(read(f), /^set -euo pipefail$/m, f);
  }
  // Библиотеката се зарежда със source от скриптове, които вече са със set -euo pipefail.
  execFileSync("bash", ["-n", new URL("../server/cs2dm-lib.sh", import.meta.url).pathname]);
});

test("root изпълнява скриптове само извън дома на cs2", () => {
  assert.match(read("server/systemd/cs2-update.service"), /^ExecStart=\/usr\/local\/lib\/cs2dm\/update\.sh$/m);
});

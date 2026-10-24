import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { buildConfig, parseBannerModels } from "../server/mods/plugin-config.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const env = {
  CS2DM_DB_CONNECTION: "Host=127.0.0.1;Port=5442;Database=cs2dm;Username=cs2dm;Password=x",
  CS2DM_REDIS_CONNECTION: "127.0.0.1:6392,password=y,abortConnect=false",
  CS2DM_BRIDGE_KEY: "a".repeat(64),
};

test("plugin-config: полетата съвпадат с PluginConfig.cs", () => {
  const cfg = buildConfig(env);
  const cs = read("plugins/src/CarbonStealth/PluginConfig.cs");
  const declared = [...cs.matchAll(/JsonPropertyName\("(\w+)"\)/g)].map((m) => m[1]);
  for (const key of declared) assert.ok(key in cfg, `липсва ${key}`);
  for (const key of Object.keys(cfg)) assert.ok(declared.includes(key) || key === "ConfigVersion", `излишно ${key}`);
  assert.equal(cfg.SiteUrl, "cs2.carbonstealth.eu");
  assert.equal(cfg.AdvertSeconds, 240);
  assert.equal(cfg.InfiniteReserveAmmo, true);
  assert.equal(buildConfig({ ...env, CS2DM_INFINITE_AMMO: "0" }).InfiniteReserveAmmo, false);
  assert.equal(cfg.PublicSlots, 0);
  assert.equal(cfg.AfkSeconds, 90);
  assert.equal(cfg.MaxPing, 150);
});

test("plugin-config: честна игра — 0 изключва, извън границите спира", () => {
  assert.equal(buildConfig({ ...env, CS2DM_AFK_SECONDS: "0" }).AfkSeconds, 0);
  assert.equal(buildConfig({ ...env, CS2DM_MAX_PING: "0" }).MaxPing, 0);
  assert.equal(buildConfig({ ...env, CS2DM_AFK_SECONDS: "120", CS2DM_MAX_PING: "200" }).AfkSeconds, 120);
  for (const bad of ["10", "4000", "-5", "abc", "1.5"]) {
    assert.throws(() => buildConfig({ ...env, CS2DM_AFK_SECONDS: bad }), /CS2DM_AFK_SECONDS/, bad);
  }
  for (const bad of ["20", "1001", "x"]) assert.throws(() => buildConfig({ ...env, CS2DM_MAX_PING: bad }), /CS2DM_MAX_PING/, bad);
  // Плъгинът проверява същите граници (конфигът може да е редактиран на ръка).
  const cs = read("plugins/src/CarbonStealth/CarbonStealthPlugin.cs");
  assert.match(cs, /config\.AfkSeconds is not 0 and \(< 30 or > 3600\)/);
  assert.match(cs, /config\.MaxPing is not 0 and \(< 50 or > 1000\)/);
  const sh = read("server/mods/install-plugins.sh");
  assert.match(sh, /CS2DM_AFK_SECONDS="\$\(env_value CS2DM_AFK_SECONDS\)"/);
  assert.match(sh, /CS2DM_MAX_PING="\$\(env_value CS2DM_MAX_PING\)"/);
  const example = read("server/cs2.env.example");
  for (const key of ["CS2DM_AFK_SECONDS=90", "CS2DM_MAX_PING=150", "CS2DM_QUAKE_SOUNDS=1", "CS2DM_SKIP_MODS=", "CS2DM_DEMO_MAX_GB=10"]) {
    assert.ok(example.includes(`\n${key}\n`), key);
  }
});

test("плъгинът: правата за чужди плъгини никога не са @css/vip или @css/root", () => {
  const logic = read("plugins/src/CarbonStealth.Logic/CssFlags.cs");
  const grants = [...logic.matchAll(/\(Role\.\w+, "(@[^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(grants, ["@css/generic", "@css/chat", "@css/kick", "@css/ban", "@css/slay", "@cheatertroll/admin"]);
  const code = readdirSync(new URL("../plugins/src/CarbonStealth/", import.meta.url)).filter((f) => f.endsWith(".cs"));
  for (const f of code) {
    const src = read(`plugins/src/CarbonStealth/${f}`);
    assert.doesNotMatch(src, /AddPlayerPermissions\([^)]*@css\/(vip|root)/, f);
  }
});

test("plugin-config: слаб ключ изключва моста, невалидна база спира", () => {
  assert.equal(buildConfig({ ...env, CS2DM_BRIDGE_KEY: "short" }).BridgeKey, "");
  assert.throws(() => buildConfig({ ...env, CS2DM_DB_CONNECTION: "" }), /CS2DM_DB_CONNECTION/);
  assert.throws(() => buildConfig({ ...env, CS2DM_DB_CONNECTION: "Host=x;Username=y" }), /CS2DM_DB_CONNECTION/);
  assert.throws(() => buildConfig({ ...env, CS2DM_ADVERT_SECONDS: "5" }), /CS2DM_ADVERT_SECONDS/);
  assert.equal(buildConfig({ ...env, CS2DM_ADVERT_SECONDS: "0" }).AdvertSeconds, 0);
  assert.equal(buildConfig({ ...env, CS2DM_SITE_URL: "https://cs2.carbonstealth.eu/" }).SiteUrl, "cs2.carbonstealth.eu");
});

test("plugin-config: банери-модели — само наши пътища", () => {
  assert.deepEqual(parseBannerModels("logo=models/carbonstealth/logo.vmdl, shot1=models/carbonstealth/shot1.vmdl"), {
    logo: "models/carbonstealth/logo.vmdl",
    shot1: "models/carbonstealth/shot1.vmdl",
  });
  assert.deepEqual(parseBannerModels(""), {});
  for (const bad of ["logo=../x.vmdl", "logo=models/../../x.vmdl", "Logo=models/a.vmdl", "adblock=models/a.vmdl", "logo=models/a.mdl", "logo"]) {
    assert.throws(() => parseBannerModels(bad), /CS2DM_BANNER_MODELS/, bad);
  }
});

test("lang: EN и BG имат едни и същи ключове, всеки ключ от кода съществува", () => {
  const en = JSON.parse(read("plugins/src/CarbonStealth/lang/en.json"));
  const bg = JSON.parse(read("plugins/src/CarbonStealth/lang/bg.json"));
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  const dir = new URL("../plugins/src/CarbonStealth/", import.meta.url);
  const code = readdirSync(dir).filter((f) => f.endsWith(".cs")).map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  const used = new Set([
    ...[...code.matchAll(/(?:ForPlayer\([^,()]+(?:\([^()]*\))?, |Tell\([^,]+, |Broadcast\(|Localizer\[)"([a-z][a-zA-Z.]+)"/g)].map((m) => m[1]),
    ...[...code.matchAll(/"(advert\.[a-z]+)"/g)].map((m) => m[1]),
  ]);
  assert.ok(used.size > 40, `намерени ключове: ${used.size}`);
  for (const k of used) assert.ok(k in en, `липсва в lang: ${k}`);
  // Динамичните ключове: admin.{тип}, category.{категория}, you.{тип}.
  for (const t of ["MUTE", "GAG", "SILENCE"]) assert.ok(`admin.${t}` in en && `you.${t}` in en);
  for (const c of ["CHEATING", "TOXICITY", "EXPLOIT", "SPAM", "IMPERSONATION", "OTHER"]) assert.ok(`category.${c}` in en);
});

test("install-plugins.sh: SDK образът е закован по digest, тайните отиват в 0600", () => {
  const sh = read("server/mods/install-plugins.sh");
  assert.match(sh, /^set -euo pipefail$/m);
  assert.match(sh, /mcr\.microsoft\.com\/dotnet\/sdk:10\.0\.\d+@sha256:[0-9a-f]{64}/);
  const sdk = JSON.parse(read("plugins/global.json")).sdk.version;
  assert.ok(sh.includes(`sdk:${sdk}@`), "SDK образът и global.json са една версия");
  assert.match(sh, /chmod 0600 "\$tmp"/);
  assert.doesNotMatch(sh, /echo[^\n]*(CS2DM_DB_CONNECTION|BRIDGE_KEY|\$db\b)/, "тайна в изхода");
});

test("плъгинът: DeathmatchAPI не се копира (иначе два типа IDeathmatchAPI)", () => {
  const csproj = read("plugins/src/CarbonStealth/CarbonStealth.csproj");
  assert.match(csproj, /<Reference Include="DeathmatchAPI">[\s\S]*?<Private>false<\/Private>/);
  assert.match(csproj, /CounterStrikeSharp\.API[\s\S]*?<ExcludeAssets>runtime<\/ExcludeAssets>/);
});

test("mods: MultiAddonManager само при Workshop addon-и (на собственика и/или звуците)", () => {
  const sh = read("server/mods/install-mods.sh");
  assert.match(read("server/mods/mods-lib.sh"), /\[\[ "\$1" == multiaddonmanager && -z "\$3" \]\] && return 0/);
  assert.match(sh, /if cs2dm_mod_skipped "\$name" "\$skip" "\$addons" "\$quake"; then continue; fi/);
  assert.match(sh, /rm -f "\$CSGO_DIR\/addons\/metamod\/multiaddonmanager\.vdf"/);
  assert.match(sh, /mm_extra_addons "\$addons"/);
  assert.match(sh, /mm_cache_clients_with_addons 1/);
});

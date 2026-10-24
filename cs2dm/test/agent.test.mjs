// Тестове на cs2-agent (CONTRACT.md §9): подпис, RESP, редакция, диспечер с подменен execFile,
// агентът от край до край срещу фалшив Redis (и срещу истински, ако има такъв на 127.0.0.1:6379,
// база 14), unit-ът, polkit правилото и ключовете в install-agent.sh.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHANNELS, BIN, MAX_LINE_CHARS, sign, envelope, ReplayGuard, openCommand, redactLine, encodeCommand, RespParser,
  RespError, RedisConnection, createDispatcher, validateLogsArgs, parseShow, parseSystemdTime, parseCssTime, tailFile,
  pluginLoadedSince, execAllowed, a2sSnapshot, createAgent, configFromEnv, parseEnvFile, selftest,
} from "../server/agent/cs2-agent.mjs";

const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
const read = (p) => readFileSync(path(p), "utf8");
const KEY = "k".repeat(16) + "0123456789abcdef0123456789abcdef";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000, what = "условието") {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(10);
  }
  assert.fail(`не дочаках ${what} за ${ms} ms`);
}
const payload = (o) => JSON.stringify({ id: randomUUID(), ts: Date.now(), actor: "76561198000000001", action: "status", args: {}, ...o });
function tmp(t, prefix = "cs2-agent-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// ── Подпис ────────────────────────────────────────────────────────────────────────────────────

test("подпис: тестовият вектор от Bridge.cs (HMAC на {\"a\":\"б\"} с ключ k)", () => {
  assert.equal(sign('{"a":"б"}', "k"), "cbe3d618023a5e002fabbf60787c7c3eace0fed4d426c56cca26641d6ab481d7");
  assert.equal(sign('{"a":"б"}', Buffer.from("k")), sign('{"a":"б"}', "k"));
  const env = JSON.parse(envelope('{"a":"б"}', "k"));
  assert.deepEqual(Object.keys(env), ["p", "sig"]);
  assert.equal(env.p, '{"a":"б"}');
});

test("подпис: валидна команда (с кирилица и ü) се приема и args идват непокътнати", () => {
  const now = Date.now();
  const p = payload({ id: "a1", ts: now, action: "logs", args: { source: "css", lines: 5, note: "тест ü" } });
  const r = openCommand(envelope(p, KEY), KEY, now, new ReplayGuard());
  assert.equal(r.ok, true, r.error);
  assert.equal(r.command.action, "logs");
  assert.deepEqual(r.command.args, { source: "css", lines: 5, note: "тест ü" });
});

test("подпис: подменен payload, друг ключ, чужд/къс sig → bad signature", () => {
  const now = Date.now();
  const env = envelope(payload({ ts: now, action: "status" }), KEY);
  const g = new ReplayGuard();
  assert.deepEqual(openCommand(env.replace("status", "update"), KEY, now, g), { ok: false, error: "bad signature" });
  assert.deepEqual(openCommand(envelope(payload({ ts: now }), "друг-ключ-0123456789-0123456789-xx"), KEY, now, g), { ok: false, error: "bad signature" });
  const { p, sig } = JSON.parse(env);
  assert.deepEqual(openCommand(JSON.stringify({ p, sig: sig.slice(0, 62) }), KEY, now, g), { ok: false, error: "bad signature" });
  assert.deepEqual(openCommand(JSON.stringify({ p, sig: "0".repeat(64) }), KEY, now, g), { ok: false, error: "bad signature" });
  // главни букви в hex са същият подпис
  assert.equal(openCommand(JSON.stringify({ p, sig: sig.toUpperCase() }), KEY, now, g).ok, true);
});

test("подпис: стар и бъдещ ts (> 30 s) → stale; точно 30 s е на границата и минава", () => {
  const now = 1_792_828_391_000;
  const g = new ReplayGuard();
  const at = (ts) => openCommand(envelope(payload({ ts }), KEY), KEY, now, g);
  assert.deepEqual(at(now - 30_001), { ok: false, error: "stale" });
  assert.deepEqual(at(now + 30_001), { ok: false, error: "stale" });
  assert.equal(at(now - 30_000).ok, true);
  assert.equal(at(now + 30_000).ok, true);
});

test("подпис: повторен id → replay; пазят се последните 1000", () => {
  const now = Date.now();
  const g = new ReplayGuard();
  const msg = envelope(payload({ id: "same", ts: now }), KEY);
  assert.equal(openCommand(msg, KEY, now, g).ok, true);
  assert.deepEqual(openCommand(msg, KEY, now, g), { ok: false, error: "replay" });
  const small = new ReplayGuard(3);
  for (const id of ["a", "b", "c", "d"]) assert.equal(small.accept(id), true);
  assert.equal(small.accept("a"), true, "най-старият е забравен");
  assert.equal(small.accept("d"), false);
  const big = new ReplayGuard();
  for (let i = 0; i < 1000; i++) big.accept(`id${i}`);
  assert.equal(big.accept("id0"), false, "1000-ният още се помни");
  big.accept("id1000");
  assert.equal(big.accept("id0"), true, "1001-вият изтласква първия");
});

test("подпис: боклук, непознато действие, лош id, липсващи полета", () => {
  const now = Date.now();
  const g = new ReplayGuard();
  for (const bad of ["не е json", "null", "[]", '{"p":1,"sig":"00"}', '{"p":"x"}', '{"p":"x","sig":"zz"}', '{"p":"x","sig":"abc"}']) {
    assert.deepEqual(openCommand(bad, KEY, now, g), { ok: false, error: "malformed envelope" }, bad);
  }
  const open = (p) => openCommand(envelope(p, KEY), KEY, now, g);
  assert.deepEqual(open("не е json"), { ok: false, error: "malformed payload" });
  assert.deepEqual(open(JSON.stringify({ id: "x", actor: "a", action: "status" })), { ok: false, error: "malformed payload" });
  assert.deepEqual(open(payload({ ts: now + 0.5 })), { ok: false, error: "malformed payload" });
  assert.deepEqual(open(payload({ ts: String(now) })), { ok: false, error: "malformed payload" });
  assert.deepEqual(open(payload({ action: "rcon" })), { ok: false, error: "bad command" });
  assert.deepEqual(open(payload({ action: "kick" })), { ok: false, error: "bad command" }, "действията на моста не важат тук");
  assert.deepEqual(open(payload({ id: "" })), { ok: false, error: "bad command" });
  assert.deepEqual(open(payload({ id: "x".repeat(65) })), { ok: false, error: "bad command" });
  const r = open(payload({ args: ["не", "обект"] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.command.args, {});
});

// ── RESP ──────────────────────────────────────────────────────────────────────────────────────

test("RESP: командата е масив от bulk низове с дължина в байтове (UTF-8)", () => {
  assert.equal(encodeCommand(["SET", "k", "б", "EX", 30]).toString("utf8"), "*5\r\n$3\r\nSET\r\n$1\r\nk\r\n$2\r\nб\r\n$2\r\nEX\r\n$2\r\n30\r\n");
  assert.equal(encodeCommand(["PING"]).toString(), "*1\r\n$4\r\nPING\r\n");
  assert.equal(encodeCommand(["SET", "k", ""]).toString(), "*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$0\r\n\r\n");
});

test("RESP: всички типове отговори, вкл. null, вложени масиви и pub/sub съобщение", () => {
  const p = new RespParser();
  const replies = p.feed(Buffer.from("+OK\r\n-WRONGPASS invalid\r\n:42\r\n$5\r\nhe\r\nl\r\n$-1\r\n*-1\r\n*0\r\n*2\r\n*1\r\n:1\r\n$0\r\n\r\n*3\r\n$7\r\nmessage\r\n$2\r\nch\r\n$3\r\nб!\r\n"));
  assert.equal(replies[0], "OK");
  assert.ok(replies[1] instanceof RespError);
  assert.equal(replies[1].message, "WRONGPASS invalid");
  assert.equal(replies[2], 42);
  assert.equal(replies[3], "he\r\nl", "bulk може да съдържа CRLF");
  assert.equal(replies[4], null);
  assert.equal(replies[5], null);
  assert.deepEqual(replies[6], []);
  assert.deepEqual(replies[7], [[1], ""]);
  assert.deepEqual(replies[8], ["message", "ch", "б!"]);
  assert.equal(replies.length, 9);
});

test("RESP: отговор, подаден байт по байт (и с разцепен UTF-8 знак), се сглобява", () => {
  const whole = Buffer.from("*3\r\n$7\r\nmessage\r\n$14\r\ncs2dm:agent:ck\r\n$6\r\nбгд\r\n:7\r\n");
  const p = new RespParser();
  const got = [];
  for (let i = 0; i < whole.length; i++) got.push(...p.feed(whole.subarray(i, i + 1)));
  assert.deepEqual(got, [["message", "cs2dm:agent:ck", "бгд"], 7]);
});

test("RESP: непознат тип или счупена дължина → протоколна грешка", () => {
  assert.throws(() => new RespParser().feed(Buffer.from("?huh\r\n")), RespError);
  assert.throws(() => new RespParser().feed(Buffer.from("$abc\r\n")), RespError);
  assert.throws(() => new RespParser().feed(Buffer.from("$2\r\nabcd\r\n")), RespError);
});

// ── Редакция ──────────────────────────────────────────────────────────────────────────────────

const GSLT = "0123456789ABCDEF0123456789ABCDEF";

test("редакция: GSLT в командния ред (journald) — и като 32 hex, и като аргумент на sv_setsteamaccount", () => {
  const line = `2026-10-24T15:01:58+0200 vps cs2.sh[912]: Command line: -dedicated -console -ip 0.0.0.0 -port 27015 -maxplayers 20 +game_type 1 +game_mode 2 +mapgroup mg_de_dust2 +map de_dust2 +sv_setsteamaccount ${GSLT}`;
  const out = redactLine(line);
  assert.ok(!out.includes(GSLT));
  assert.ok(!out.includes("0123456789"));
  assert.match(out, /\+sv_setsteamaccount <redacted>$/);
  assert.match(out, /-ip x\.x\.x\.x -port 27015/);
  assert.match(out, /\+map de_dust2/);
});

test("редакция: sv_setsteamaccount в кавички, с „=“, с не-hex токен и токенът при вход в Steam", () => {
  for (const tok of [`"${GSLT}"`, `'${GSLT}'`, "short-non-hex-token", `= ${GSLT}`]) {
    const out = redactLine(`exec: sv_setsteamaccount ${tok} ; next`);
    assert.equal(out, "exec: sv_setsteamaccount <redacted> ; next", tok);
  }
  assert.equal(redactLine("SV_SETSTEAMACCOUNT abc"), "SV_SETSTEAMACCOUNT <redacted>");
  const steam = redactLine("Logging into Steam gameserver account with logon token 'C0FFEE00xxxxxxxxxxxxxxxxxxxxxxxx'");
  assert.equal(steam, "Logging into Steam gameserver account with logon token <redacted>");
});

test("редакция: всеки низ от 32+ hex (ключове, пароли от openssl) → <redacted>; 31 hex остава", () => {
  const hex64 = "ab".repeat(32);
  assert.equal(redactLine(`key=${hex64}`), "key=<redacted>");
  assert.equal(redactLine(`x${"F".repeat(32)}y`), "x<redacted>y", "и залепен за дума");
  assert.equal(redactLine("a".repeat(31)), "a".repeat(31));
  assert.equal(redactLine(`sha256 ${"0".repeat(64)} ок`), "sha256 <redacted> ок");
});

test("редакция: IPv4 навсякъде (с порт, в скоби, няколко на ред)", () => {
  assert.equal(redactLine('Client "Иван" connected (93.184.216.34:27005).'), 'Client "Иван" connected (x.x.x.x:27005).');
  assert.equal(redactLine("from 10.0.0.1 to 192.168.1.255, via 127.0.0.1"), "from x.x.x.x to x.x.x.x, via x.x.x.x");
  assert.equal(redactLine("ip=8.8.8.8;port=53"), "ip=x.x.x.x;port=53");
  // Над-редакция по замисъл: версия с 4 части изглежда като IPv4 (по-добре така, отколкото изтичане).
  assert.equal(redactLine("CS2 version 1.41.9.2"), "CS2 version x.x.x.x");
});

test("редакция: IPv6 — пълен, съкратен, loopback, с зона, в скоби с порт, IPv4-mapped, с порт без скоби", () => {
  const cases = {
    "addr 2001:0db8:85a3:0000:0000:8a2e:0370:7334 end": "addr x.x.x.x end",
    "peer [2001:db8::1]:27015": "peer [x.x.x.x]:27015",
    "local ::1.": "local x.x.x.x.",
    "link fe80::1%eth0 up": "link x.x.x.x up",
    "mapped ::ffff:93.184.216.34": "mapped x.x.x.x",
    "bare 2001:db8::1:27015": "bare x.x.x.x",
    "caps 2001:DB8::ABCD": "caps x.x.x.x",
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(redactLine(input), want, input);
});

test("редакция: часове, SteamID, C++ имена, карта и времена на CSS остават непокътнати", () => {
  const keep = [
    "2026-10-24 15:01:58.441 +02:00 [INFO] (cssharp:PluginContext) Finished loading plugin Deathmatch",
    "2026-10-24T15:01:58+0200 vps cs2.sh[912]: Map de_dust2 loaded",
    "player [U:1:123456789] 76561198000000001 CCSPlayerController::Respawn std::string",
    "round 12:34 left",
  ];
  for (const line of keep) assert.equal(redactLine(line), line);
});

test("редакция: пароли в низ за връзка, ANSI/контролни знаци, таван на дължината", () => {
  assert.equal(
    redactLine("Npgsql: Host=127.0.0.1;Port=5442;Database=cs2dm;Username=cs2dm;Password=hunter2;Timeout=5"),
    "Npgsql: Host=x.x.x.x;Port=5442;Database=cs2dm;Username=cs2dm;Password=<redacted>;Timeout=5",
  );
  assert.equal(redactLine('redis: password="s3cr3t pass" ok'), "redis: password=<redacted> ok");
  assert.equal(redactLine("requirepass topsecret"), "requirepass <redacted>");
  assert.equal(redactLine("wrong password for user"), "wrong password for user", "обикновената дума остава");
  assert.equal(redactLine("\x1b[31mERROR\x1b[0m\x07 bell\r"), "ERROR bell");
  const long = redactLine("я".repeat(5000));
  assert.equal(long.length, MAX_LINE_CHARS + 1);
  assert.ok(long.endsWith("…"));
  // GSLT точно на границата на рязането не оцелява: редакцията е преди рязането.
  const edge = redactLine(`${"a ".repeat((MAX_LINE_CHARS - 10) / 2)}${GSLT}`);
  assert.ok(!edge.includes("0123456789AB"));
});

// ── Помощници ─────────────────────────────────────────────────────────────────────────────────

test("lines: цяло число 1…200, по подразбиране 100; source само css|journal", () => {
  assert.deepEqual(validateLogsArgs({ source: "css" }), { ok: true, source: "css", lines: 100 });
  assert.deepEqual(validateLogsArgs({ source: "journal", lines: 200 }), { ok: true, source: "journal", lines: 200 });
  assert.deepEqual(validateLogsArgs({ source: "journal", lines: 1 }), { ok: true, source: "journal", lines: 1 });
  for (const lines of [0, -1, 201, 1.5, "50", NaN, Infinity, null, [5], 1e9]) {
    assert.deepEqual(validateLogsArgs({ source: "css", lines }), { ok: false, error: "bad args" }, String(lines));
  }
  for (const source of [undefined, "CSS", "syslog", "../etc", 1]) {
    assert.deepEqual(validateLogsArgs({ source, lines: 5 }), { ok: false, error: "bad args" }, String(source));
  }
});

test("systemctl show, времена от systemd и от лога на CSS", () => {
  const m = parseShow("Id=cs2.service\nActiveState=active\nActiveEnterTimestamp=@1792828391\n\nId=cs2-update.service\nActiveState=inactive\nActiveEnterTimestamp=\n");
  assert.equal(m.get("cs2.service").ActiveState, "active");
  assert.equal(m.get("cs2-update.service").ActiveState, "inactive");
  assert.equal(parseSystemdTime("@1792828391"), 1_792_828_391_000);
  assert.equal(parseSystemdTime("Sat 2026-10-24 12:01:58 UTC"), Date.parse("2026-10-24T12:01:58Z"));
  assert.equal(parseSystemdTime(""), null);
  assert.equal(parseSystemdTime("n/a"), null);
  assert.equal(parseCssTime("2026-10-24 15:01:58.441 +02:00 [INFO] x"), Date.parse("2026-10-24T13:01:58.441Z"));
  assert.equal(parseCssTime("без час"), null);
});

test("tailFile: последните N реда, и от голям файл (чете се само краят)", async (t) => {
  const dir = tmp(t);
  const f = join(dir, "big.txt");
  const lines = Array.from({ length: 40_000 }, (_, i) => `ред ${i} ${"x".repeat(40)}`);
  writeFileSync(f, `${lines.join("\n")}\n`);
  assert.ok(statSync(f).size > 1024 * 1024);
  assert.deepEqual(await tailFile(f, 3), lines.slice(-3));
  writeFileSync(f, "a\r\nb\r\nc");
  assert.deepEqual(await tailFile(f, 5), ["a", "b", "c"]);
});

test("pluginLoadedSince: по час в лога на CSS, само файлове след старта", async (t) => {
  const dir = tmp(t);
  const f = join(dir, "log-all20261024.txt");
  writeFileSync(f, "2026-10-24 15:00:14.901 +02:00 [INFO] (cssharp:PluginContext) Finished loading plugin Deathmatch\n");
  const at = (s) => Date.parse(s);
  assert.equal(await pluginLoadedSince(dir, "Deathmatch", at("2026-10-24T13:00:00Z")), true);
  assert.equal(await pluginLoadedSince(dir, "Deathmatch", at("2026-10-24T13:01:00Z")), false, "старият ред не важи");
  const old = new Date("2026-10-23T00:00:00Z");
  utimesSync(f, old, old);
  assert.equal(await pluginLoadedSince(dir, "Deathmatch", at("2026-10-24T13:00:00Z")), false, "файл отпреди старта не се чете");
  assert.equal(await pluginLoadedSince(join(dir, "няма"), "Deathmatch", 0), false);
});

test("execAllowed: само systemctl и journalctl по абсолютен път — нищо друго не се пуска", async () => {
  await assert.rejects(execAllowed("/bin/sh", ["-c", "true"], { timeout: 1000 }), /забранен/);
  await assert.rejects(execAllowed("systemctl", ["status"], { timeout: 1000 }), /забранен/);
  await assert.rejects(execAllowed("/usr/bin/systemctl/../../bin/sh", [], { timeout: 1000 }), /забранен/);
  assert.deepEqual(Object.values(BIN), ["/usr/bin/systemctl", "/usr/bin/journalctl"]);
  const src = read("server/agent/cs2-agent.mjs");
  const childImports = src.match(/^import .* from "node:child_process";$/gm);
  assert.deepEqual(childImports, ['import { execFile as nodeExecFile } from "node:child_process";'], "само execFile");
  assert.doesNotMatch(src, /\bexecSync\b|\bspawn(Sync)?\(|shell:\s*true|child_process"\)\.exec\b/, "без shell и без синхронно изпълнение");
  assert.match(src, /shell: false/);
});

test("a2sSnapshot: числата от A2S; без отговор → online: false и null (нищо измислено)", async () => {
  const now = () => 1234;
  const up = await a2sSnapshot(async (host, port, timeout) => {
    assert.deepEqual([host, port, timeout], ["127.0.0.1", 27016, 3000]);
    return { name: "CarbonStealth.eu | Dust2 DM", map: "de_dust2", players: 7, bots: 3, maxPlayers: 20, version: "x" };
  }, 27016, now);
  assert.deepEqual(up, { ts: 1234, online: true, name: "CarbonStealth.eu | Dust2 DM", map: "de_dust2", players: 7, bots: 3, maxPlayers: 20 });
  const down = await a2sSnapshot(async () => { throw new Error("timeout"); }, 27015, now);
  assert.deepEqual(down, { ts: 1234, online: false, name: null, map: null, players: null, bots: null, maxPlayers: null });
});

test("настройки: ключ ≥ 32, Redis само на loopback, портове; env файлът се чете като от systemd", () => {
  assert.throws(() => configFromEnv({}), /CS2DM_AGENT_KEY/);
  assert.throws(() => configFromEnv({ CS2DM_AGENT_KEY: "x".repeat(31) }), /CS2DM_AGENT_KEY/);
  const cfg = configFromEnv({ CS2DM_AGENT_KEY: KEY });
  assert.deepEqual(cfg, { key: KEY, redis: { host: "127.0.0.1", port: 6392, password: undefined, db: 0 }, cs2Port: 27015 });
  assert.throws(() => configFromEnv({ CS2DM_AGENT_KEY: KEY, CS2DM_REDIS_HOST: "10.0.0.5" }), /127\.0\.0\.1/);
  assert.throws(() => configFromEnv({ CS2DM_AGENT_KEY: KEY, CS2DM_REDIS_PORT: "70000" }), /CS2DM_REDIS_PORT/);
  assert.throws(() => configFromEnv({ CS2DM_AGENT_KEY: KEY, CS2_PORT: "27015;rm" }), /CS2_PORT/);
  assert.deepEqual(parseEnvFile('# коментар\n\nA=1\nB="x y"\nC=\'z\'\n C = 2 \nD=a=b;c\n'), { A: "1", B: "x y", C: "2", D: "a=b;c" });
});

// ── Диспечерът с подменен execFile ──────────────────────────────────────────────────────────────

const SHOW_OK = "Id=cs2.service\nActiveState=active\nActiveEnterTimestamp=@1792828391\n\nId=cs2-update.service\nActiveState=inactive\nActiveEnterTimestamp=\n";

/** Фалшив execFile: записва извикванията; отговорът зависи от (файл, първия аргумент). */
function fakeExec(handlers = {}) {
  const calls = [];
  const exec = async (file, args, opts) => {
    calls.push({ file, args, opts });
    const h = handlers[`${file} ${args[0] === "--no-ask-password" ? args[1] : args[0]}`];
    if (h) return h(args);
    if (file === BIN.systemctl && args[0] === "show") return { stdout: SHOW_OK, stderr: "" };
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

function machine(t) {
  const dir = tmp(t);
  mkdirSync(join(dir, "logs"));
  mkdirSync(join(dir, "state"));
  writeFileSync(join(dir, "steam.inf"), "ClientVersion=2000\r\nPatchVersion=1.41.9.2\r\nProductName=cs2\r\n");
  return { dir, paths: { cssLogs: join(dir, "logs"), steamInf: join(dir, "steam.inf"), modsBroken: join(dir, "state", "mods-broken") } };
}

test("status: активен от ActiveEnterTimestamp, версията от steam.inf, модовете по лога на CSS, счупени", async (t) => {
  const { dir, paths } = machine(t);
  const since = 1_792_828_391_000;
  const iso = new Date(since + 20_000).toISOString().replace("T", " ").replace("Z", " +00:00");
  writeFileSync(join(dir, "logs", "log-all20261024.txt"), `${iso} [INFO] (cssharp:PluginContext) Finished loading plugin Deathmatch\n`);
  const { exec, calls } = fakeExec();
  const d = createDispatcher({ exec, paths });
  const r = await d.run("status");
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { active: true, state: "active", since, gameVersion: "1.41.9.2", modsLoaded: true, broken: null, busy: null });
  assert.deepEqual(calls.map((c) => [c.file, ...c.args]), [
    [BIN.systemctl, "show", "cs2.service", "cs2-update.service", "--property=Id,ActiveState,ActiveEnterTimestamp", "--timestamp=unix"],
  ]);

  writeFileSync(paths.modsBroken, "1.41.9.3\n");
  const { exec: exec2 } = fakeExec({
    [`${BIN.systemctl} show`]: () => ({ stdout: SHOW_OK.replace("ActiveState=active", "ActiveState=failed").replace("ActiveState=inactive", "ActiveState=activating"), stderr: "" }),
  });
  const r2 = await createDispatcher({ exec: exec2, paths }).run("status");
  assert.deepEqual(r2.data, { active: false, state: "failed", since: null, gameVersion: "1.41.9.2", modsLoaded: false, broken: "1.41.9.3", busy: "update" });

  // Липсващи файлове (няма игра/модове) → частичен статус, не провал.
  const r3 = await createDispatcher({ exec, paths: { cssLogs: join(dir, "няма"), steamInf: join(dir, "няма.inf"), modsBroken: join(dir, "няма-broken") } }).run("status");
  assert.deepEqual(r3, { ok: true, data: { active: true, state: "active", since, gameVersion: null, modsLoaded: false, broken: null, busy: null } });
});

test("restart: точно `systemctl --no-ask-password restart cs2.service`, нищо повече", async (t) => {
  const { exec, calls } = fakeExec();
  const r = await createDispatcher({ exec, paths: machine(t).paths }).run("restart", { unit: "ssh.service", extra: "--force" });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls.map((c) => [c.file, ...c.args]), [
    [BIN.systemctl, "show", "cs2.service", "cs2-update.service", "--property=Id,ActiveState,ActiveEnterTimestamp", "--timestamp=unix"],
    [BIN.systemctl, "--no-ask-password", "restart", "cs2.service"],
  ]);
  assert.ok(calls.every((c) => typeof c.opts.timeout === "number" && c.opts.timeout > 0));
});

for (const verb of ["start", "stop"]) {
  test(`${verb}: точно \`systemctl --no-ask-password ${verb} cs2.service\`, без входни аргументи`, async (t) => {
    const { exec, calls } = fakeExec();
    const r = await createDispatcher({ exec, paths: machine(t).paths }).run(verb, { unit: "ssh.service", extra: "--force" });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(calls.at(-1).args, ["--no-ask-password", verb, "cs2.service"]);
    assert.equal(calls.at(-1).file, BIN.systemctl);
  });
}

test("busy: stop е еднопоточен с restart/update/start и личи в status", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { exec, calls } = fakeExec({ [`${BIN.systemctl} stop`]: () => gate.then(() => ({ stdout: "", stderr: "" })) });
  const d = createDispatcher({ exec, paths: machine(t).paths });
  const first = d.run("stop");
  await until(() => calls.some((c) => c.args.includes("stop")), 1000, "първия stop");
  for (const other of ["start", "restart", "update", "stop"]) assert.deepEqual(await d.run(other), { ok: false, error: "busy" }, other);
  assert.equal((await d.run("status")).data.busy, "stop");
  release();
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await d.run("start"), { ok: true }, "след края — пак може");
});

test("update: `systemctl --no-ask-password start --no-block cs2-update.service`", async (t) => {
  const { exec, calls } = fakeExec();
  const r = await createDispatcher({ exec, paths: machine(t).paths }).run("update", { anything: 1 });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls.at(-1).args, ["--no-ask-password", "start", "--no-block", "cs2-update.service"]);
});

test("busy: restart/update са еднопоточни; status и logs вървят успоредно", async (t) => {
  let release;
  const gate = new Promise((r) => (release = r));
  const { exec, calls } = fakeExec({ [`${BIN.systemctl} restart`]: () => gate.then(() => ({ stdout: "", stderr: "" })) });
  const d = createDispatcher({ exec, paths: machine(t).paths });
  const first = d.run("restart");
  await until(() => calls.some((c) => c.args.includes("restart")), 1000, "първия restart");
  assert.deepEqual(await d.run("restart"), { ok: false, error: "busy" });
  assert.deepEqual(await d.run("update"), { ok: false, error: "busy" });
  const st = await d.run("status");
  assert.equal(st.ok, true);
  assert.equal(st.data.busy, "restart");
  assert.equal((await d.run("logs", { source: "journal", lines: 1 })).ok, true);
  assert.equal(calls.filter((c) => c.args.includes("restart")).length, 1, "вторият restart не е пуснат");
  assert.equal(calls.filter((c) => c.args.includes("--no-block")).length, 0, "update не е пуснат");
  release();
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await d.run("update"), { ok: true }, "след края — пак може");
});

test("busy: докато cs2-update.service тече, restart и update не пипат нищо", async (t) => {
  const { exec, calls } = fakeExec({
    [`${BIN.systemctl} show`]: () => ({ stdout: SHOW_OK.replace("ActiveState=inactive", "ActiveState=activating"), stderr: "" }),
  });
  const d = createDispatcher({ exec, paths: machine(t).paths });
  assert.deepEqual(await d.run("restart"), { ok: false, error: "busy" });
  assert.deepEqual(await d.run("update"), { ok: false, error: "busy" });
  assert.ok(calls.every((c) => c.args[0] === "show"));
});

test("провал на systemctl → ok: false, error „failed“, кратък редактиран детайл (polkit отказ, таймаут)", async (t) => {
  const denied = Object.assign(new Error("Command failed"), { code: 1, stderr: "Failed to restart cs2.service: Access denied\nSee system logs.\n" });
  const { exec } = fakeExec({ [`${BIN.systemctl} restart`]: () => { throw denied; } });
  const d = createDispatcher({ exec, paths: machine(t).paths });
  assert.deepEqual(await d.run("restart"), { ok: false, error: "failed", data: { detail: "Failed to restart cs2.service: Access denied" } });
  const slow = Object.assign(new Error("killed"), { killed: true, signal: "SIGTERM" });
  const { exec: exec2 } = fakeExec({ [`${BIN.systemctl} start`]: () => { throw slow; } });
  assert.deepEqual(await createDispatcher({ exec: exec2, paths: machine(t).paths }).run("update"), { ok: false, error: "failed", data: { detail: "timeout" } });
  // след провал заключването е освободено
  assert.deepEqual(await d.run("update"), { ok: true });
});

test("logs journal: `journalctl -u cs2.service -n N -o short-iso --no-pager`, последните N, редактирани", async (t) => {
  const out = [
    "2026-10-24T15:00:00+0200 vps systemd[1]: Started cs2.service",
    `2026-10-24T15:00:01+0200 vps cs2.sh[9]: Command line: -ip 0.0.0.0 +sv_setsteamaccount ${GSLT}`,
    '2026-10-24T15:00:02+0200 vps cs2.sh[9]: Client "x" connected (93.184.216.34:27005)',
    "",
  ].join("\n");
  const { exec, calls } = fakeExec({ [`${BIN.journalctl} -u`]: () => ({ stdout: out, stderr: "" }) });
  const r = await createDispatcher({ exec, paths: machine(t).paths }).run("logs", { source: "journal", lines: 2 });
  assert.equal(r.ok, true);
  assert.deepEqual(calls[0].args, ["-u", "cs2.service", "-n", "2", "-o", "short-iso", "--no-pager", "--quiet"]);
  assert.equal(calls[0].file, BIN.journalctl);
  assert.deepEqual(r.data, {
    source: "journal",
    lines: [
      "2026-10-24T15:00:01+0200 vps cs2.sh[9]: Command line: -ip x.x.x.x +sv_setsteamaccount <redacted>",
      '2026-10-24T15:00:02+0200 vps cs2.sh[9]: Client "x" connected (x.x.x.x:27005)',
    ],
  });
  assert.ok(!JSON.stringify(r).includes(GSLT));
});

test("logs css: най-новият log-all*.txt по време на промяна, последните N реда, редактирани", async (t) => {
  const { dir, paths } = machine(t);
  const older = join(dir, "logs", "log-all20261025.txt");
  const newer = join(dir, "logs", "log-all20261024.txt");
  writeFileSync(older, "стар 1.2.3.4\n");
  writeFileSync(newer, `ред 1\nред 2 Password=hunter2;\nред 3 от 93.184.216.34 ключ ${"c".repeat(64)}\n`);
  writeFileSync(join(dir, "logs", "other.txt"), "не е log-all\n");
  utimesSync(older, new Date("2026-10-01"), new Date("2026-10-01"));
  const { exec, calls } = fakeExec();
  const d = createDispatcher({ exec, paths });
  const r = await d.run("logs", { source: "css", lines: 2 });
  assert.deepEqual(r, { ok: true, data: { source: "css", lines: ["ред 2 Password=<redacted>;", "ред 3 от x.x.x.x ключ <redacted>"] } });
  assert.equal(calls.length, 0, "css логът се чете без външни програми");
  rmSync(join(dir, "logs"), { recursive: true });
  assert.deepEqual(await d.run("logs", { source: "css", lines: 5 }), { ok: true, data: { source: "css", lines: [] } }, "без модове → празно");
});

test("logs с невалидни аргументи → bad args, нищо не се пуска; непознато действие → отказ", async (t) => {
  const { exec, calls } = fakeExec();
  const d = createDispatcher({ exec, paths: machine(t).paths });
  assert.deepEqual(await d.run("logs", { source: "journal", lines: 500 }), { ok: false, error: "bad args" });
  assert.deepEqual(await d.run("logs", { source: "journal; rm -rf /", lines: 5 }), { ok: false, error: "bad args" });
  assert.deepEqual(await d.run("logs"), { ok: false, error: "bad args" });
  assert.deepEqual(await d.run("rcon", {}), { ok: false, error: "unknown action" });
  assert.equal(calls.length, 0);
});

// ── Фалшив Redis (RESP) за CI без Redis ─────────────────────────────────────────────────────────

/** Минимален Redis: AUTH, SELECT, PING, SUBSCRIBE, PUBLISH, SET … EX, GET, TTL, DEL. */
async function fakeRedis(t, { password } = {}) {
  const subs = new Map();
  const store = new Map();
  const commands = [];
  const sockets = new Set();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    const parser = new RespParser();
    let authed = !password;
    let subscribed = false;
    const send = (s) => sock.write(s);
    sock.on("data", (chunk) => {
      for (const [name, ...args] of parser.feed(chunk)) {
        const cmd = String(name).toUpperCase();
        commands.push([cmd, ...args]);
        if (cmd === "AUTH") {
          if (args.at(-1) === password) {
            authed = true;
            send("+OK\r\n");
          } else send("-WRONGPASS invalid username-password pair or user is disabled.\r\n");
          continue;
        }
        if (!authed) {
          send("-NOAUTH Authentication required.\r\n");
          continue;
        }
        if (subscribed && !["SUBSCRIBE", "PING"].includes(cmd)) {
          // като истинския Redis: абонирана връзка не може да прави нищо друго
          send(`-ERR Can't execute '${cmd.toLowerCase()}': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context\r\n`);
          continue;
        }
        switch (cmd) {
          case "SELECT":
            send("+OK\r\n");
            break;
          case "PING":
            send(subscribed ? encodeCommand(["pong", ""]) : "+PONG\r\n");
            break;
          case "SUBSCRIBE":
            subscribed = true;
            if (!subs.has(args[0])) subs.set(args[0], new Set());
            subs.get(args[0]).add(sock);
            send(Buffer.concat([Buffer.from("*3\r\n"), encodeCommand(["subscribe", args[0]]).subarray(4), Buffer.from(":1\r\n")]));
            break;
          case "PUBLISH": {
            const targets = [...(subs.get(args[0]) ?? [])];
            for (const s of targets) s.write(encodeCommand(["message", args[0], args[1]]));
            send(`:${targets.length}\r\n`);
            break;
          }
          case "SET":
            store.set(args[0], { value: args[1], ex: args[2]?.toUpperCase() === "EX" ? Number(args[3]) : null });
            send("+OK\r\n");
            break;
          case "GET": {
            const v = store.get(args[0]);
            send(v ? `$${Buffer.byteLength(v.value)}\r\n${v.value}\r\n` : "$-1\r\n");
            break;
          }
          default:
            send(`-ERR unknown command '${cmd}'\r\n`);
        }
      }
    });
    sock.on("close", () => {
      sockets.delete(sock);
      for (const set of subs.values()) set.delete(sock);
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    for (const s of sockets) s.destroy();
    server.close();
  });
  return { port: server.address().port, store, commands, kickAll: () => { for (const s of sockets) s.destroy(); } };
}

function conn(t, port, extra = {}) {
  const logs = [];
  const c = new RedisConnection({ host: "127.0.0.1", port, name: "тест", log: (m) => logs.push(m), ...extra }).start();
  t.after(() => c.stop());
  return Object.assign(c, { logs });
}

test("RESP клиент: AUTH, SUBSCRIBE/PUBLISH, SET EX и повторно свързване с нов абонамент", async (t) => {
  const redis = await fakeRedis(t, { password: "p@ss-тест" });
  const got = [];
  const sub = conn(t, redis.port, { password: "p@ss-тест", onReady: (c) => c.subscribe("ch"), onMessage: (ch, m) => got.push([ch, m]) });
  // абонираната връзка отказва други команди (като истинския Redis), но PING минава
  await until(() => sub.ready && redis.commands.some((c) => c[0] === "SUBSCRIBE"), 2000, "абонамента");
  await assert.rejects(sub.command("PUBLISH", "ch", "x"), /only \(P\|S\)SUBSCRIBE/);
  assert.deepEqual(await sub.command("PING"), ["pong", ""]);
  const pub = conn(t, redis.port, { password: "p@ss-тест" });
  await until(() => sub.ready && pub.ready && redis.commands.some((c) => c[0] === "SUBSCRIBE"), 2000, "свързване");
  assert.equal(await pub.command("PUBLISH", "ch", "здравей"), 1);
  await until(() => got.length === 1);
  assert.deepEqual(got[0], ["ch", "здравей"]);
  assert.equal(await pub.command("SET", "k", "v", "EX", 30), "OK");
  assert.deepEqual(redis.store.get("k"), { value: "v", ex: 30 });
  assert.equal(await pub.command("GET", "k"), "v");
  await assert.rejects(pub.command("NOPE"), RespError);

  redis.kickAll();
  await until(() => !sub.ready, 1000, "падане");
  await assert.rejects(pub.command("PING"), /не е свързан/);
  await until(() => sub.ready && pub.ready && redis.commands.filter((c) => c[0] === "SUBSCRIBE").length === 2, 3000, "ново свързване");
  await pub.command("PUBLISH", "ch", "пак");
  await until(() => got.length === 2);
  assert.deepEqual(got[1], ["ch", "пак"]);
  assert.ok(sub.logs.some((l) => l.includes("възстановена")));
  assert.ok(!sub.logs.join("\n").includes("p@ss"), "паролата не стига до лога");
});

test("RESP клиент: грешна парола → не е готов, лог веднъж, без паролата в него", async (t) => {
  const redis = await fakeRedis(t, { password: "правилна" });
  const c = conn(t, redis.port, { password: "грешна-парола-123" });
  await until(() => redis.commands.filter((x) => x[0] === "AUTH").length >= 2, 3000, "втори опит");
  assert.equal(c.ready, false);
  assert.equal(c.logs.length, 1, c.logs.join("\n"));
  assert.match(c.logs[0], /WRONGPASS/);
  assert.ok(!c.logs[0].includes("грешна-парола"));
});

// ── Агентът от край до край ─────────────────────────────────────────────────────────────────────

function testChannels() {
  const p = `cs2dm-test:${randomUUID()}:`;
  return { cmd: `${p}agent:cmd`, ack: `${p}agent:ack`, a2s: `${p}a2s` };
}

async function startAgent(t, redisOpts, extra = {}) {
  const channels = testChannels();
  const { exec, calls } = fakeExec();
  const logs = [];
  const agent = createAgent({
    key: KEY,
    redis: { host: "127.0.0.1", ...redisOpts },
    cs2Port: 27015,
    channels,
    exec,
    paths: machine(t).paths,
    query: async () => ({ name: "CarbonStealth.eu | Dust2 DM", map: "de_dust2", players: 5, bots: 2, maxPlayers: 20 }),
    heartbeatMs: 50,
    log: (m) => logs.push(m),
    ...extra,
  }).start();
  t.after(() => agent.stop());
  const acks = [];
  // Панелът — като сайта: една връзка за абонамента за отговорите и една за командите.
  const panelSub = conn(t, redisOpts.port, { ...redisOpts, onReady: (c) => c.subscribe(channels.ack), onMessage: (_c, m) => acks.push(JSON.parse(m)) });
  const panel = conn(t, redisOpts.port, redisOpts);
  await until(() => agent.connections.sub.ready && agent.connections.pub.ready && panel.ready && panelSub.ready, 3000, "агента и панела");
  await until(async () => (await panel.command("PUBLISH", channels.ack, "{}")) === 1, 3000, "абонамента на панела");
  // абонаментът на агента е потвърден, когато PUBLISH стига до един получател
  await until(async () => (await panel.command("PUBLISH", channels.cmd, "{}")) === 1, 3000, "абонамента");
  const ask = async (action, args = {}, mutate = (p) => p) => {
    const id = randomUUID();
    await panel.command("PUBLISH", channels.cmd, mutate(envelope(payload({ id, action, args }), KEY)));
    return id;
  };
  return { agent, channels, calls, logs, acks, panel, ask };
}

test("агентът (фалшив Redis с парола): подписан status → ack по §9; фалшив подпис → без ack; A2S → SET EX 30", async (t) => {
  const redis = await fakeRedis(t, { password: "redis-парола" });
  const { channels, logs, acks, ask } = await startAgent(t, { port: redis.port, password: "redis-парола" });

  const id = await ask("status");
  await until(() => acks.some((a) => a.id === id), 3000, "ack за status");
  const ack = acks.find((a) => a.id === id);
  assert.equal(ack.ok, true);
  assert.deepEqual(Object.keys(ack), ["id", "ok", "data"]);
  assert.equal(ack.data.gameVersion, "1.41.9.2");
  assert.equal(ack.data.active, true);

  const forged = await ask("restart", {}, (env) => env.replace(/"sig":"[0-9a-f]{4}/, '"sig":"0000'));
  const bad = await ask("logs", { source: "journal", lines: 999 });
  await until(() => acks.some((a) => a.id === bad), 3000, "ack за лошите аргументи");
  assert.deepEqual(acks.find((a) => a.id === bad), { id: bad, ok: false, error: "bad args" });
  await sleep(100);
  assert.ok(!acks.some((a) => a.id === forged), "фалшивата команда няма отговор");
  assert.ok(logs.some((l) => l.includes("отхвърлена команда (bad signature)")));
  assert.ok(logs.some((l) => l.includes("отхвърлена команда (malformed envelope)")), "празният плик от проверката на абонамента");

  await until(() => redis.store.has(channels.a2s), 2000, "A2S удара");
  const a2s = redis.store.get(channels.a2s);
  assert.equal(a2s.ex, 30);
  const snap = JSON.parse(a2s.value);
  assert.deepEqual(Object.keys(snap), ["ts", "online", "name", "map", "players", "bots", "maxPlayers"]);
  assert.equal(snap.online, true);
  assert.equal(snap.players, 5);
  assert.ok(redis.commands.some((c) => c[0] === "SET" && c[1] === channels.a2s && c[3] === "EX" && c[4] === "30"));

  const all = logs.join("\n");
  assert.ok(!all.includes(KEY) && !all.includes("redis-парола"), "нито ключът, нито паролата в лога");
});

test("агентът: повторена (прихваната) команда не се изпълнява втори път", async (t) => {
  const redis = await fakeRedis(t);
  const { channels, calls, acks, panel } = await startAgent(t, { port: redis.port });
  const id = randomUUID();
  const env = envelope(payload({ id, action: "update" }), KEY);
  await panel.command("PUBLISH", channels.cmd, env);
  await until(() => acks.some((a) => a.id === id));
  await panel.command("PUBLISH", channels.cmd, env);
  await sleep(150);
  assert.equal(acks.filter((a) => a.id === id).length, 1);
  assert.equal(calls.filter((c) => c.args.includes("--no-block")).length, 1);
});

test("самопроверката на install-agent.sh: status + logs към работещ агент → 0; без агент → 1", async (t) => {
  const redis = await fakeRedis(t, { password: "pw-самопроверка" });
  const { channels } = await startAgent(t, { port: redis.port, password: "pw-самопроверка" });
  const dir = tmp(t);
  const envFile = join(dir, "agent.env");
  writeFileSync(envFile, `CS2DM_AGENT_KEY=${KEY}\nCS2DM_REDIS_HOST=127.0.0.1\nCS2DM_REDIS_PORT=${redis.port}\nCS2DM_REDIS_PASSWORD=pw-самопроверка\nCS2_PORT=27015\n`);
  const lines = [];
  assert.equal(await selftest(envFile, { channels, out: (l) => lines.push(l), timeoutMs: 3000 }), 0, lines.join("\n"));
  assert.match(lines.join("\n"), /✓ status: играта върви · версия 1\.41\.9\.2/);
  assert.match(lines.join("\n"), /✓ logs journal/);
  assert.match(lines.join("\n"), /✓ logs css/);
  assert.ok(!lines.join("\n").includes(KEY));
  const silent = [];
  assert.equal(await selftest(envFile, { channels: testChannels(), out: (l) => silent.push(l), timeoutMs: 300 }), 1);
  assert.match(silent.join("\n"), /не отговори/);
});

test("CLI: без ключ агентът не тръгва (изход 1, ясно съобщение); непознат аргумент → 2", () => {
  const bin = path("server/agent/cs2-agent.mjs");
  const env = { PATH: process.env.PATH };
  const r = spawnSync(process.execPath, [bin], { env, encoding: "utf8", timeout: 10_000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /СТОП: CS2DM_AGENT_KEY липсва/);
  assert.doesNotMatch(r.stderr, /at .*\.mjs:\d+/, "без stack trace");
  const r2 = spawnSync(process.execPath, [bin, "--bogus"], { env, encoding: "utf8", timeout: 10_000 });
  assert.equal(r2.status, 2);
});

// ── Истински Redis (ако има — локално; в CI се пропуска чисто) ────────────────────────────────────

const REAL = { host: "127.0.0.1", port: Number(process.env.CS2DM_TEST_REDIS_PORT || 6379), db: 14 };
const realRedis = await new Promise((resolve) => {
  const s = net.createConnection(REAL);
  const done = (v) => {
    s.destroy();
    resolve(v);
  };
  s.setTimeout(300, () => done(false));
  s.on("connect", () => done(true));
  s.on("error", () => done(false));
});

test("истински Redis (база 14): status, A2S ключът с TTL ≤ 30, чистене след себе си", { skip: !realRedis && `няма Redis на 127.0.0.1:${REAL.port}` }, async (t) => {
  const { channels, acks, ask, panel } = await startAgent(t, { port: REAL.port, db: REAL.db });
  t.after(async () => {
    try {
      await panel.command("DEL", channels.a2s);
    } catch {
      // връзката вече е затворена
    }
  });
  const id = await ask("logs", { source: "journal", lines: 3 });
  await until(() => acks.some((a) => a.id === id), 3000, "ack от истинския Redis");
  assert.equal(acks.find((a) => a.id === id).ok, true);
  await until(async () => (await panel.command("EXISTS", channels.a2s)) === 1, 3000, "A2S ключа");
  const ttl = await panel.command("TTL", channels.a2s);
  assert.ok(ttl > 0 && ttl <= 30, `TTL ${ttl}`);
  assert.equal(JSON.parse(await panel.command("GET", channels.a2s)).online, true);
  assert.equal(await panel.command("DEL", channels.a2s), 1);
  // Ключът е в база 14, не в 0 (базата на сайта).
  const zero = conn(t, REAL.port, {});
  await until(() => zero.ready);
  assert.equal(await zero.command("EXISTS", channels.a2s), 0);
});

// ── Unit-ът ────────────────────────────────────────────────────────────────────────────────────

/** @returns {Record<string, Record<string, string[]>>} секция → ключ → стойности (повторенията се пазят) */
function parseUnit(text) {
  const out = {};
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const s = line.match(/^\[(.+)\]$/);
    if (s) {
      section = s[1];
      out[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    const k = line.slice(0, eq);
    (out[section][k] ??= []).push(line.slice(eq + 1));
  }
  return out;
}

const unitText = read("server/agent/cs2-agent.service");
const unit = parseUnit(unitText);
const svc = unit.Service;
const one = (k) => {
  assert.ok(svc[k], `липсва ${k}`);
  assert.equal(svc[k].length, 1, `${k} е повторен`);
  return svc[k][0];
};

test("unit: потребител cs2agent, без shell, node по абсолютен път, ключът само от env файла", () => {
  assert.equal(one("User"), "cs2agent");
  assert.equal(one("Group"), "cs2agent");
  assert.equal(one("ExecStart"), "/usr/bin/node /usr/local/lib/cs2dm/agent/cs2-agent.mjs");
  assert.equal(one("EnvironmentFile"), "/etc/cs2/agent.env");
  assert.equal(one("Restart"), "always");
  assert.doesNotMatch(unitText, /\/bin\/(ba)?sh|sh -c|ExecStartPre|ExecStartPost/);
  assert.doesNotMatch(unitText, /\$\{?CS2DM_AGENT_KEY|\$\{?CS2DM_REDIS_PASSWORD/, "тайна в командния ред");
  assert.deepEqual(one("SupplementaryGroups").split(/\s+/).sort(), ["cs2", "systemd-journal"]);
  assert.equal(svc.StartLimitBurst, undefined, "границите са в [Unit] — в [Service] systemd ги игнорира");
  assert.ok(unit.Unit.StartLimitIntervalSec && unit.Unit.StartLimitBurst);
});

test("unit: втвърден — без права, без запис, само нужните семейства адреси", () => {
  for (const [k, v] of Object.entries({
    NoNewPrivileges: "yes", PrivateTmp: "yes", PrivateDevices: "yes", ProtectSystem: "strict", ProtectHome: "yes",
    ProtectProc: "invisible", ProtectKernelTunables: "yes", ProtectKernelModules: "yes", ProtectKernelLogs: "yes",
    ProtectControlGroups: "yes", ProtectClock: "yes", ProtectHostname: "yes", RestrictNamespaces: "yes",
    RestrictRealtime: "yes", RestrictSUIDSGID: "yes", LockPersonality: "yes", SystemCallArchitectures: "native",
    UMask: "0077", CapabilityBoundingSet: "", AmbientCapabilities: "",
  })) assert.equal(one(k), v, k);
  assert.deepEqual(one("RestrictAddressFamilies").split(/\s+/).sort(), ["AF_INET", "AF_INET6", "AF_UNIX"]);
  assert.ok(svc.SystemCallFilter.includes("@system-service"));
  assert.ok(svc.SystemCallFilter.includes("~@privileged"));
  assert.equal(svc.ReadWritePaths, undefined, "агентът не пише никъде");
  assert.equal(svc.MemoryDenyWriteExecute, undefined, "V8 JIT");
  assert.equal(svc.PrivateNetwork, undefined, "Redis и A2S са в мрежата на хоста");
  assert.equal(svc.PrivateUsers, undefined, "polkit вижда истинския uid");
  const ro = one("ReadOnlyPaths").split(/\s+/);
  assert.ok(ro.includes("-/opt/cs2/server/game/csgo/addons/counterstrikesharp/logs"));
  assert.ok(ro.every((p) => p.startsWith("-/")), "липсващ път не бива да проваля старта");
  const hidden = one("InaccessiblePaths").split(/\s+/);
  assert.ok(hidden.includes("-/opt/cs2/server/game/csgo/addons/counterstrikesharp/configs"), "конфигът на плъгина е с тайни");
});

// ── polkit ─────────────────────────────────────────────────────────────────────────────────────

const rulesText = read("server/agent/50-cs2dm-agent.rules");
const Result = { YES: "yes", NO: "no", AUTH_ADMIN: "auth_admin", NOT_HANDLED: null };
const rules = [];
vm.runInNewContext(rulesText, { polkit: { Result, addRule: (f) => rules.push(f) } });
const decide = (user, id, details = {}) => rules[0]({ id, lookup: (k) => details[k] }, { user, groups: [], isInGroup: () => false });
const MANAGE = "org.freedesktop.systemd1.manage-units";

test("polkit: cs2agent може САМО start/stop/restart на cs2.service и start на cs2-update.service", () => {
  assert.equal(rules.length, 1);
  for (const verb of ["start", "stop", "restart"]) {
    assert.equal(decide("cs2agent", MANAGE, { unit: "cs2.service", verb }), Result.YES, verb);
  }
  assert.equal(decide("cs2agent", MANAGE, { unit: "cs2-update.service", verb: "start" }), Result.YES);
  const denied = [
    ["cs2.service", "reload"], ["cs2.service", "try-restart"], ["cs2.service", "Stop"], ["cs2.service", "isolate"],
    ["cs2.service", "reload-or-restart"], ["cs2.service", "kill"], ["cs2-update.service", "restart"],
    ["cs2-update.service", "stop"], ["cs2-update.timer", "start"], ["cs2-agent.service", "restart"],
    ["ssh.service", "restart"], ["medqr.service", "stop"], ["docker.service", "restart"], ["CS2.service", "restart"],
    [undefined, "restart"], ["cs2.service", undefined], [undefined, undefined],
  ];
  for (const [u, v] of denied) assert.equal(decide("cs2agent", MANAGE, { unit: u, verb: v }), Result.NO, `${v} ${u}`);
  for (const other of ["org.freedesktop.systemd1.manage-unit-files", "org.freedesktop.systemd1.reload-daemon",
    "org.freedesktop.login1.reboot", "org.freedesktop.login1.power-off", "org.freedesktop.policykit.exec"]) {
    assert.equal(decide("cs2agent", other, { unit: "cs2.service", verb: "restart" }), Result.NO, other);
  }
});

test("polkit: за всички други потребители правилото не решава нищо", () => {
  for (const user of ["root", "cs2", "www-data", "cs2agent2", "xcs2agent"]) {
    assert.equal(decide(user, MANAGE, { unit: "cs2.service", verb: "restart" }), Result.NOT_HANDLED, user);
    assert.equal(decide(user, "org.freedesktop.login1.reboot"), Result.NOT_HANDLED, user);
  }
});

test("polkit: само ES5 (duktape в polkit ≥ 121) и точният път в инсталатора", () => {
  const code = rulesText.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /=>|\blet\b|\bconst\b|`|\bclass\b/);
  assert.match(code, /action\.lookup\("unit"\)/);
  assert.match(code, /action\.lookup\("verb"\)/);
  assert.match(read("server/agent/install-agent.sh"), /POLKIT_RULE="\$POLKIT_DIR\/50-cs2dm-agent\.rules"/);
  assert.match(read("server/agent/install-agent.sh"), /POLKIT_DIR="\$\{CS2DM_POLKIT_DIR:-\/etc\/polkit-1\/rules\.d\}"/);
});

// ── install-agent.sh: ключовете ────────────────────────────────────────────────────────────────

const installer = path("server/agent/install-agent.sh");
const installerText = read("server/agent/install-agent.sh");
const HEX = /^[0-9a-f]{64}$/;
const BRIDGE = "b".repeat(64);
const REDIS_PW = "d".repeat(64);

function envDir(t, { app = `# сайтът\nHTTP_PORT=4350\nREDIS_PASSWORD=${REDIS_PW}\nREDIS_PORT=6393\nPOSTGRES_PASSWORD=${"e".repeat(64)}\n`, cs2 } = {}) {
  const dir = tmp(t, "cs2-agent-env-");
  writeFileSync(join(dir, "cs2.env"), cs2 ?? [
    "CS2_GSLT=ABCDEF",
    "CS2_PORT=27016",
    // „;“ в низа на Npgsql: при `source` това би пуснало touch.
    `CS2DM_DB_CONNECTION=Host=127.0.0.1;Port=5442;Database=cs2dm;Username=cs2dm;Password=x;touch ${join(dir, "pwned")}`,
    `CS2DM_BRIDGE_KEY=${BRIDGE}`,
    "",
  ].join("\n"), { mode: 0o600 });
  if (app !== null) writeFileSync(join(dir, "app.env"), app, { mode: 0o600 });
  return dir;
}

function syncKeys(dir) {
  const r = spawnSync("bash", ["-c", `set -euo pipefail; source "${installer}"; sync_keys`], {
    env: { ...process.env, CS2DM_ENV_DIR: dir },
    encoding: "utf8",
    timeout: 20_000,
  });
  return { ...r, all: `${r.stdout}${r.stderr}` };
}

const envOf = (dir, f) => parseEnvFile(readFileSync(join(dir, f), "utf8"));
const mode = (p) => statSync(p).mode & 0o777;

test("install-agent: ключовете — един CS2DM_AGENT_KEY в двата файла, мостът копиран, APP_ENC_KEY създаден, 0600", (t) => {
  const dir = envDir(t);
  const r = syncKeys(dir);
  assert.equal(r.status, 0, r.all);
  const agent = envOf(dir, "agent.env");
  const app = envOf(dir, "app.env");
  assert.deepEqual(Object.keys(agent).sort(), ["CS2DM_AGENT_KEY", "CS2DM_REDIS_HOST", "CS2DM_REDIS_PASSWORD", "CS2DM_REDIS_PORT", "CS2_PORT"]);
  assert.match(agent.CS2DM_AGENT_KEY, HEX);
  assert.equal(app.CS2DM_AGENT_KEY, agent.CS2DM_AGENT_KEY);
  assert.equal(agent.CS2DM_REDIS_HOST, "127.0.0.1");
  assert.equal(agent.CS2DM_REDIS_PORT, "6393");
  assert.equal(agent.CS2DM_REDIS_PASSWORD, REDIS_PW);
  assert.equal(agent.CS2_PORT, "27016");
  assert.equal(app.CS2DM_BRIDGE_KEY, BRIDGE);
  assert.match(app.APP_ENC_KEY, HEX);
  assert.notEqual(app.APP_ENC_KEY, agent.CS2DM_AGENT_KEY);
  assert.equal(app.HTTP_PORT, "4350", "останалото в app.env е непокътнато");
  assert.ok(readFileSync(join(dir, "app.env"), "utf8").startsWith("# сайтът\nHTTP_PORT=4350\n"));
  assert.equal(mode(join(dir, "agent.env")), 0o600);
  assert.equal(mode(join(dir, "app.env")), 0o600);
  assert.ok(!existsSync(join(dir, "pwned")), "cs2.env е прочетен със sed, не със source");
  for (const secret of [agent.CS2DM_AGENT_KEY, app.APP_ENC_KEY, BRIDGE, REDIS_PW, "e".repeat(64)]) {
    assert.ok(!r.all.includes(secret), "тайна в изхода на инсталатора");
  }
  // agent.env е точно това, което агентът очаква
  const cfg = configFromEnv(agent);
  assert.deepEqual(cfg.redis, { host: "127.0.0.1", port: 6393, password: REDIS_PW, db: 0 });
  assert.equal(cfg.cs2Port, 27016);
});

test("install-agent: второ пускане не сменя нищо (APP_ENC_KEY никога), повторенията в app.env се махат", (t) => {
  const dir = envDir(t);
  assert.equal(syncKeys(dir).status, 0);
  const agent1 = readFileSync(join(dir, "agent.env"), "utf8");
  const app1 = readFileSync(join(dir, "app.env"), "utf8");
  const r = syncKeys(dir);
  assert.equal(r.status, 0, r.all);
  assert.equal(readFileSync(join(dir, "agent.env"), "utf8"), agent1);
  assert.equal(readFileSync(join(dir, "app.env"), "utf8"), app1);
  assert.doesNotMatch(r.all, /нов /, "нищо ново при второто пускане");

  // повторен ред за ключа (ръчна редакция) → остава един, със същата стойност
  const key = envOf(dir, "app.env").CS2DM_AGENT_KEY;
  writeFileSync(join(dir, "app.env"), `${app1}CS2DM_AGENT_KEY=${"f".repeat(64)}\n`);
  assert.equal(syncKeys(dir).status, 0);
  const lines = readFileSync(join(dir, "app.env"), "utf8").split("\n").filter((l) => l.startsWith("CS2DM_AGENT_KEY="));
  assert.deepEqual(lines, [`CS2DM_AGENT_KEY=${key}`]);
});

test("install-agent: ключ, който вече е в app.env, се приема; кратък APP_ENC_KEY не се пипа; кавички се махат", (t) => {
  const existing = "a1".repeat(32);
  const dir = envDir(t, { app: `REDIS_PASSWORD="${REDIS_PW}"\nCS2DM_AGENT_KEY=${existing}\nAPP_ENC_KEY=short\n` });
  const r = syncKeys(dir);
  assert.equal(r.status, 0, r.all);
  assert.equal(envOf(dir, "agent.env").CS2DM_AGENT_KEY, existing);
  assert.equal(envOf(dir, "agent.env").CS2DM_REDIS_PASSWORD, REDIS_PW);
  assert.equal(envOf(dir, "agent.env").CS2DM_REDIS_PORT, "6392", "по подразбиране");
  assert.equal(envOf(dir, "app.env").APP_ENC_KEY, "short");
  assert.match(r.all, /APP_ENC_KEY .* НЕ го пипам/);
});

test("install-agent: липсващ app.env / празна или опасна парола на Redis / мостът липсва", (t) => {
  const noApp = syncKeys(envDir(t, { app: null }));
  assert.equal(noApp.status, 1);
  assert.match(noApp.all, /липсва .*app\.env.*docker compose --env-file/);

  const empty = syncKeys(envDir(t, { app: "REDIS_PASSWORD=\n" }));
  assert.equal(empty.status, 1);
  assert.match(empty.all, /REDIS_PASSWORD е празен/);

  const dangerous = syncKeys(envDir(t, { app: `REDIS_PASSWORD=${"a".repeat(40)}$HOME x\n` }));
  assert.equal(dangerous.status, 1);
  assert.match(dangerous.all, /REDIS_PASSWORD .* знаци/);

  const dir = envDir(t, { cs2: "CS2_GSLT=x\n" });
  const noBridge = syncKeys(dir);
  assert.equal(noBridge.status, 0, noBridge.all);
  assert.match(noBridge.all, /CS2DM_BRIDGE_KEY липсва/);
  assert.equal(envOf(dir, "app.env").CS2DM_BRIDGE_KEY, undefined);
  assert.equal(envOf(dir, "agent.env").CS2_PORT, "27015");
});

test("install-agent: само root, set -euo pipefail, umask 077, sed (не source), потребител без shell", () => {
  assert.match(installerText, /^set -euo pipefail$/m);
  assert.match(installerText, /^umask 077$/m);
  assert.match(installerText, /\[\[ \$EUID -eq 0 \]\] \|\| die/);
  assert.doesNotMatch(installerText, /^\s*(source|\.)\s+\S*(env|ENV)/m, "env файл със source");
  assert.match(installerText, /useradd --system [^\n]*--shell \/usr\/sbin\/nologin "\$AGENT_USER"/);
  assert.match(installerText, /usermod --shell \/usr\/sbin\/nologin "\$AGENT_USER"/);
  assert.match(installerText, /openssl rand -hex 32/);
  assert.match(installerText, /systemctl enable --quiet cs2-agent\.service/);
  assert.match(installerText, /install -o root -g root -m 0644 "\$SRC_DIR\/cs2-agent\.mjs"/);
  // Никакво echo/printf на ключ извън записа във файл.
  for (const line of installerText.split("\n")) {
    if (/\b(echo|printf)\b.*\$\{?(agent_key|enc|bridge|redis_pass)\b/.test(line)) {
      assert.match(line, /^\s*printf 'CS2DM_(AGENT_KEY|REDIS_PASSWORD)=%s\\n'/, `печат на тайна: ${line.trim()}`);
    }
  }
});

test("package.json: новите файлове са в lint", () => {
  const lint = JSON.parse(read("package.json")).scripts.lint;
  assert.match(lint, /server\/agent\/install-agent\.sh/);
  assert.match(lint, /node --check server\/agent\/cs2-agent\.mjs/);
  assert.ok(CHANNELS.cmd === "cs2dm:agent:cmd" && CHANNELS.ack === "cs2dm:agent:ack" && CHANNELS.a2s === "cs2dm:a2s");
});

#!/usr/bin/env node
// cs2-agent.mjs — агентът на хоста за уеб панела на cs2dm (CONTRACT.md §9). Нула зависимости, Node ≥ 20.
//
// Сайтът е в Docker и не може да пипа systemd. Агентът слуша подписани команди в Redis
// (`cs2dm:agent:cmd`) и прави САМО шест неща: status · start · stop · restart · update · logs. Отговаря в
// `cs2dm:agent:ack`. На всеки 10 s пише A2S снимка в `cs2dm:a2s` (EX 30) — статусът, когато
// плъгинът спи (празен сървър).
//
// Сигурност: подпис HMAC-SHA256 с отделен ключ CS2DM_AGENT_KEY (както мостът в §5), ±30 s, пази
// последните 1000 id; изпълнение САМО с execFile (без shell), абсолютни пътища, затворен списък;
// start/stop/restart/update са еднопоточни; логовете минават през редакция (IP, GSLT, 32+ hex, пароли).
// Тече като `cs2agent` без root — systemd действията ги разрешава polkit само за два unit-а.
//
//   node cs2-agent.mjs                         агентът (настройки от средата, виж configFromEnv)
//   node cs2-agent.mjs --selftest [env файл]   подписан status + logs към работещия агент (за install-agent.sh)
import net from "node:net";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, readFile, readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { queryInfo } from "../a2s.mjs";

// ── Договорът (CONTRACT.md §9) ──────────────────────────────────────────────────────────────────

export const CHANNELS = Object.freeze({ cmd: "cs2dm:agent:cmd", ack: "cs2dm:agent:ack", a2s: "cs2dm:a2s" });
export const ACTIONS = Object.freeze(["status", "start", "stop", "restart", "update", "logs"]);
export const MAX_SKEW_MS = 30_000;
export const REPLAY_CAPACITY = 1000;
export const MAX_LINES = 200;
export const DEFAULT_LINES = 100;
export const HEARTBEAT_MS = 10_000;
export const A2S_TTL_S = 30;
/** Ред от лога след редакция се реже до толкова знака (отговорът да остане малък). */
export const MAX_LINE_CHARS = 1000;

/** Единствените изпълними файлове, които агентът пуска. Абсолютни пътища, без shell. */
export const BIN = Object.freeze({ systemctl: "/usr/bin/systemctl", journalctl: "/usr/bin/journalctl" });
const ALLOWED_BINS = new Set(Object.values(BIN));
const GAME_UNIT = "cs2.service";
const UPDATE_UNIT = "cs2-update.service";
/** Плъгинът, чието зареждане доказва веригата Metamod → CSS → плъгин (като CS2DM_PROBE_PLUGIN). */
const PROBE_PLUGIN = "Deathmatch";

/** Пътищата на машината; подменят се само от тестовете (през средата), като в cs2dm-lib.sh. */
export function defaultPaths(env = process.env) {
  return {
    cssLogs: env.CS2DM_CSS_LOGS || "/opt/cs2/server/game/csgo/addons/counterstrikesharp/logs",
    steamInf: env.CS2DM_STEAM_INF || "/opt/cs2/server/game/csgo/steam.inf",
    modsBroken: join(env.CS2DM_STATE_DIR || "/var/lib/cs2dm", "mods-broken"),
  };
}

const log = (/** @type {string} */ msg) => process.stdout.write(`[cs2-agent] ${msg}\n`);

// ── Подписът (същата схема като Bridge.cs, ключ CS2DM_AGENT_KEY) ─────────────────────────────────

/** @param {string | Buffer} key */
const keyBytes = (key) => (Buffer.isBuffer(key) ? key : Buffer.from(key, "utf8"));

/**
 * HMAC-SHA256 върху байтовете на низа `payload` (UTF-8), точно както е изпратен — без канонизация.
 * @param {string} payload
 * @param {string | Buffer} key
 */
export function sign(payload, key) {
  return createHmac("sha256", keyBytes(key)).update(Buffer.from(payload, "utf8")).digest("hex");
}

/** Пликът `{"p": "<payload>", "sig": "<hex>"}`. */
export function envelope(/** @type {string} */ payload, /** @type {string | Buffer} */ key) {
  return JSON.stringify({ p: payload, sig: sign(payload, key) });
}

/** Помни последните N id, за да отхвърли повторно изпратена команда (като ReplayGuard в C#). */
export class ReplayGuard {
  constructor(capacity = REPLAY_CAPACITY) {
    this.capacity = capacity;
    /** @type {Set<string>} */
    this.seen = new Set();
  }

  /** @param {string} id */
  accept(id) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    // Set пази реда на добавяне → първият е най-старият.
    while (this.seen.size > this.capacity) this.seen.delete(this.seen.values().next().value);
    return true;
  }
}

/**
 * @typedef {{ id: string, ts: number, actor: string, action: string, args: Record<string, unknown> }} AgentCommand
 * @typedef {{ ok: true, command: AgentCommand } | { ok: false, error: string }} OpenResult
 */

/**
 * Проверява плика и връща командата. Грешките са същите низове като в C# (BridgeProtocol.TryOpen):
 * malformed envelope · bad signature · malformed payload · bad command · stale · replay.
 * Payload-ът се парсва чак СЛЕД успешна проверка на подписа.
 * @param {string} message
 * @param {string | Buffer} key
 * @param {number} nowMs
 * @param {ReplayGuard} guard
 * @returns {OpenResult}
 */
export function openCommand(message, key, nowMs, guard) {
  const fail = (/** @type {string} */ error) => /** @type {OpenResult} */ ({ ok: false, error });
  /** @type {unknown} */
  let env;
  try {
    env = JSON.parse(message);
  } catch {
    return fail("malformed envelope");
  }
  if (!env || typeof env !== "object" || Array.isArray(env)) return fail("malformed envelope");
  const { p, sig } = /** @type {{ p?: unknown, sig?: unknown }} */ (env);
  if (typeof p !== "string" || typeof sig !== "string" || sig.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(sig)) {
    return fail("malformed envelope");
  }
  const expected = createHmac("sha256", keyBytes(key)).update(Buffer.from(p, "utf8")).digest();
  const given = Buffer.from(sig, "hex");
  if (given.length !== expected.length || !timingSafeEqual(expected, given)) return fail("bad signature");

  /** @type {unknown} */
  let cmd;
  try {
    cmd = JSON.parse(p);
  } catch {
    return fail("malformed payload");
  }
  if (!cmd || typeof cmd !== "object" || Array.isArray(cmd)) return fail("malformed payload");
  const { id, ts, actor, action, args } = /** @type {Record<string, unknown>} */ (cmd);
  if (typeof id !== "string" || typeof actor !== "string" || typeof action !== "string" || !Number.isSafeInteger(ts)) {
    return fail("malformed payload");
  }
  if (id.length === 0 || id.length > 64 || !ACTIONS.includes(action)) return fail("bad command");
  if (Math.abs(nowMs - /** @type {number} */ (ts)) > MAX_SKEW_MS) return fail("stale");
  if (!guard.accept(id)) return fail("replay");
  const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? /** @type {Record<string, unknown>} */ (args) : {};
  return { ok: true, command: { id, ts: /** @type {number} */ (ts), actor, action, args: safeArgs } };
}

// ── Редакция на логовете (§9: IP → x.x.x.x · sv_setsteamaccount <…> и 32+ hex → <redacted>) ────────

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]/g;
const CONTROL = /[\x00-\x08\x0a-\x1f\x7f]/g;
const GSLT_ARG = /(sv_setsteamaccount)(?:\s*=\s*|\s+)(?:"[^"]*"?|'[^']*'?|\S+)/gi;
// Само „ИМЕ=стойност“ / „ИМЕ: стойност“ (низът на Npgsql, конфиг) — обикновеното „password for …“ остава.
const PASSWORD_ARG = /\b(password|passwd|pwd)\s*[=:]\s*(?:"[^"]*"?|'[^']*'?|[^\s;,"']+)/gi;
const REDIS_PASS_ARG = /\b(requirepass)\s+(?:"[^"]*"?|'[^']*'?|\S+)/gi;
// Steam при вход: „Logging into Steam gameserver account with logon token 'XXXXXXXXxxxx…'“.
const LOGON_TOKEN = /\b(logon token)\s*(?:"[^"]*"?|'[^']*'?|\S+)/gi;
const LONG_HEX = /[0-9a-f]{32,}/gi;
// Кандидат за IPv6: поредица от hex, „:“ и „.“ с поне две двоеточия, ограничена от знаци извън нея
// (така „std::string“, „[U:1:123]“ и „T15:01:58“ не са кандидати). После — проверка с net.isIPv6.
const IPV6_CANDIDATE = /(?<![0-9a-z_:.])[0-9a-f.]*:[0-9a-f.]*:[0-9a-f:.]*(?:%[0-9a-z_.-]+)?(?![0-9a-z_:.%])/gi;
const IPV4 = /(?<![0-9.])(?:\d{1,3}\.){3}\d{1,3}(?![0-9])/g;

/** @param {string} run */
function looksLikeIPv6(run) {
  const core = run.replace(/%.*$/, "").replace(/\.+$/, "");
  if (net.isIPv6(core)) return true;
  // „2001:db8::1:27015“ — адрес с порт без скоби.
  const noPort = core.replace(/:\d{1,5}$/, "");
  if (noPort !== core && net.isIPv6(noPort)) return true;
  // Fail closed: „::“ се среща само в IPv6, а 5+ двоеточия не са час.
  return core.includes("::") || (core.match(/:/g) ?? []).length >= 5;
}

/**
 * Един ред лог → безопасен за панела: без ANSI/контролни знаци, без IP адреси, GSLT, дълги hex
 * низове (ключове, пароли от `openssl rand -hex`) и стойности след „password=“. Над-редакцията е
 * допустима (версията „1.41.9.2“ изглежда като IPv4 и става x.x.x.x) — изтичането не е.
 * @param {string} line
 */
export function redactLine(line) {
  let s = String(line).replace(ANSI, "").replace(CONTROL, "");
  s = s.replace(GSLT_ARG, "$1 <redacted>");
  s = s.replace(LOGON_TOKEN, "$1 <redacted>");
  s = s.replace(PASSWORD_ARG, "$1=<redacted>");
  s = s.replace(REDIS_PASS_ARG, "$1 <redacted>");
  s = s.replace(LONG_HEX, "<redacted>");
  s = s.replace(IPV6_CANDIDATE, (run) => {
    if (!looksLikeIPv6(run)) return run;
    const dots = run.match(/\.+$/)?.[0] ?? "";
    return `x.x.x.x${dots}`;
  });
  s = s.replace(IPV4, "x.x.x.x");
  return s.length > MAX_LINE_CHARS ? `${s.slice(0, MAX_LINE_CHARS)}…` : s;
}

/** @param {string[]} lines */
export const redactLines = (lines) => lines.map(redactLine);

// ── RESP (Redis протокол, версия 2) ─────────────────────────────────────────────────────────────

const CRLF = Buffer.from("\r\n");
const MAX_BULK = 64 * 1024 * 1024;
const MAX_DEPTH = 8;

export class RespError extends Error {}

/**
 * Команда → RESP масив от bulk низове (дължините са в БАЙТОВЕ — UTF-8).
 * @param {Array<string | number | Buffer>} args
 */
export function encodeCommand(args) {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.isBuffer(a) ? a : Buffer.from(String(a), "utf8");
    parts.push(Buffer.from(`$${b.length}\r\n`), b, CRLF);
  }
  return Buffer.concat(parts);
}

/**
 * @param {Buffer} buf
 * @param {number} o
 * @param {number} depth
 * @returns {{ value: unknown, end: number } | null} null = още няма целия отговор
 */
function parseAt(buf, o, depth) {
  if (o >= buf.length) return null;
  const nl = buf.indexOf(CRLF, o);
  if (nl < 0) {
    if (buf.length - o > 64 * 1024) throw new RespError("протоколна грешка: ред без край");
    return null;
  }
  const type = buf[o];
  const line = buf.toString("utf8", o + 1, nl);
  const int = () => {
    if (!/^-?\d+$/.test(line)) throw new RespError(`протоколна грешка: „${line.slice(0, 20)}“ не е число`);
    return Number(line);
  };
  switch (type) {
    case 0x2b: // +
      return { value: line, end: nl + 2 };
    case 0x2d: // -
      return { value: new RespError(line), end: nl + 2 };
    case 0x3a: // :
      return { value: int(), end: nl + 2 };
    case 0x24: { // $
      const len = int();
      if (len === -1) return { value: null, end: nl + 2 };
      if (len < 0 || len > MAX_BULK) throw new RespError("протоколна грешка: дължина на bulk");
      const start = nl + 2;
      if (buf.length < start + len + 2) return null;
      if (buf[start + len] !== 0x0d || buf[start + len + 1] !== 0x0a) throw new RespError("протоколна грешка: bulk без CRLF");
      return { value: buf.toString("utf8", start, start + len), end: start + len + 2 };
    }
    case 0x2a: { // *
      const n = int();
      if (n === -1) return { value: null, end: nl + 2 };
      if (n < 0 || depth >= MAX_DEPTH) throw new RespError("протоколна грешка: масив");
      const arr = [];
      let p = nl + 2;
      for (let i = 0; i < n; i++) {
        const r = parseAt(buf, p, depth + 1);
        if (!r) return null;
        arr.push(r.value);
        p = r.end;
      }
      return { value: arr, end: p };
    }
    default:
      throw new RespError(`протоколна грешка: непознат тип 0x${type.toString(16)}`);
  }
}

/** Инкрементален парсер: подаваш парчета от сокета, връща всички цели отговори. */
export class RespParser {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  /** @param {Buffer} chunk @returns {unknown[]} */
  feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    for (;;) {
      const r = parseAt(this.buf, 0, 0);
      if (!r) break;
      out.push(r.value);
      this.buf = this.buf.subarray(r.end);
    }
    if (this.buf.length > MAX_BULK + 1024) throw new RespError("протоколна грешка: прекалено голям отговор");
    return out;
  }
}

const BACKOFF_MS = [250, 500, 1000, 2000, 5000, 10_000];

/**
 * Една връзка към Redis с повторно свързване. AUTH/SELECT при всяко свързване, после onReady
 * (абонаментът се подновява там). В режим на абонамент „message“ отговорите отиват в onMessage.
 */
export class RedisConnection {
  /**
   * @param {{ host: string, port: number, password?: string, db?: number, name: string,
   *   onReady?: (c: RedisConnection) => unknown, onMessage?: (channel: string, message: string) => void,
   *   log?: (msg: string) => void, connectTimeoutMs?: number }} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.log = opts.log ?? log;
    this.ready = false;
    this.stopped = true;
    this.attempt = 0;
    this.down = false;
    this.everReady = false;
    /** @type {net.Socket | null} */
    this.sock = null;
    /** @type {Array<{ resolve: (v: unknown) => void, reject: (e: Error) => void }>} */
    this.pending = [];
    this.subscribed = false;
    /** @type {NodeJS.Timeout | undefined} */
    this.timer = undefined;
  }

  start() {
    this.stopped = false;
    this.#connect();
    return this;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.sock?.destroy();
  }

  #connect() {
    const { host, port, password, db, name, connectTimeoutMs = 5000 } = this.opts;
    const sock = net.createConnection({ host, port });
    this.sock = sock;
    this.ready = false;
    this.subscribed = false;
    const parser = new RespParser();
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 30_000);
    sock.setTimeout(connectTimeoutMs, () => sock.destroy(new Error("таймаут при свързване")));
    sock.on("connect", async () => {
      sock.setTimeout(0);
      try {
        if (password) await this.#send(["AUTH", password]);
        if (db) await this.#send(["SELECT", db]);
        this.ready = true;
        this.attempt = 0;
        if (this.down || !this.everReady) this.log(`Redis (${name}): ${this.everReady ? "връзката е възстановена" : "свързан"}`);
        this.down = false;
        this.everReady = true;
        await this.opts.onReady?.(this);
      } catch (err) {
        this.#fail(err);
        sock.destroy();
      }
    });
    sock.on("data", (chunk) => {
      let replies;
      try {
        replies = parser.feed(chunk);
      } catch (err) {
        this.#fail(err);
        sock.destroy();
        return;
      }
      for (const r of replies) this.#dispatch(r);
    });
    sock.on("error", (err) => this.#fail(err));
    sock.on("close", () => {
      if (this.sock !== sock) return;
      if (!this.stopped) this.#fail(new Error("връзката падна"));
      this.ready = false;
      const pending = this.pending.splice(0);
      for (const p of pending) p.reject(new Error("връзката с Redis падна"));
      if (this.stopped) return;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt++;
      this.timer = setTimeout(() => this.#connect(), delay);
    });
  }

  /** Лог само при смяна на състоянието — без спам при всеки опит. Паролата никога не е в съобщението. */
  #fail(/** @type {unknown} */ err) {
    if (this.down) return;
    this.down = true;
    this.log(`Redis (${this.opts.name}) ${this.opts.host}:${this.opts.port}: ${err instanceof Error ? err.message : String(err)} — свързвам се наново`);
  }

  #dispatch(/** @type {unknown} */ reply) {
    if (this.subscribed && Array.isArray(reply) && reply[0] === "message") {
      if (typeof reply[1] === "string" && typeof reply[2] === "string") this.opts.onMessage?.(reply[1], reply[2]);
      return;
    }
    const p = this.pending.shift();
    if (!p) return;
    if (reply instanceof RespError) p.reject(reply);
    else p.resolve(reply);
  }

  /** @param {Array<string | number>} args */
  #send(args) {
    const sock = this.sock;
    return new Promise((resolve, reject) => {
      if (!sock || sock.destroyed) {
        reject(new Error("няма връзка с Redis"));
        return;
      }
      this.pending.push({ resolve, reject });
      sock.write(encodeCommand(args));
    });
  }

  /** Команда по готова връзка; без връзка → веднага грешка (не трупаме опашка). */
  command(/** @type {Array<string | number>} */ ...args) {
    if (!this.ready) return Promise.reject(new Error("Redis не е свързан"));
    return this.#send(args);
  }

  /** @param {string} channel */
  subscribe(channel) {
    this.subscribed = true;
    return this.#send(["SUBSCRIBE", channel]);
  }
}

// ── Действията ──────────────────────────────────────────────────────────────────────────────────

/** Средата на децата: без тайните на агента, без pager и цветове. */
const CHILD_ENV = Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C.UTF-8", SYSTEMD_PAGER: "", SYSTEMD_COLORS: "0" });

/**
 * @typedef {{ stdout: string, stderr: string }} ExecResult
 * @typedef {(file: string, args: string[], opts: { timeout: number }) => Promise<ExecResult>} ExecFn
 */

/**
 * execFile без shell, само за изпълнимите файлове от BIN. Грешката носи stdout/stderr.
 * @type {ExecFn}
 */
export function execAllowed(file, args, { timeout }) {
  if (!ALLOWED_BINS.has(file)) return Promise.reject(new Error(`забранен изпълним файл: ${file}`));
  return new Promise((resolve, reject) => {
    nodeExecFile(
      file,
      args,
      { timeout, killSignal: "SIGTERM", maxBuffer: 4 * 1024 * 1024, env: CHILD_ENV, shell: false, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) reject(Object.assign(err, { stdout, stderr }));
        else resolve({ stdout, stderr });
      },
    );
  });
}

/**
 * `lines` по §9: цяло число 1…200 (липсва → 100); `source`: "css" | "journal".
 * @param {Record<string, unknown>} args
 * @returns {{ ok: true, source: "css" | "journal", lines: number } | { ok: false, error: string }}
 */
export function validateLogsArgs(args) {
  const source = args?.source;
  if (source !== "css" && source !== "journal") return { ok: false, error: "bad args" };
  const lines = args.lines === undefined ? DEFAULT_LINES : args.lines;
  if (typeof lines !== "number" || !Number.isInteger(lines) || lines < 1 || lines > MAX_LINES) return { ok: false, error: "bad args" };
  return { ok: true, source, lines };
}

/**
 * Изходът на `systemctl show <unit>… --property=Id,ActiveState,ActiveEnterTimestamp` → по unit.
 * @param {string} text
 * @returns {Map<string, Record<string, string>>}
 */
export function parseShow(text) {
  const out = new Map();
  for (const block of text.split(/\n\s*\n/)) {
    /** @type {Record<string, string>} */
    const props = {};
    for (const line of block.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    if (props.Id) out.set(props.Id, props);
  }
  return out;
}

/**
 * Времето от `systemctl show --timestamp=unix` („@1792828391“) или utc („Sat 2026-10-24 12:01:58 UTC“).
 * @param {string | undefined} value
 * @returns {number | null} ms
 */
export function parseSystemdTime(value) {
  if (!value || value === "n/a" || value === "0") return null;
  const unix = value.match(/^@(\d+)(?:\.(\d+))?$/);
  if (unix) return Number(unix[1]) * 1000 + (unix[2] ? Math.floor(Number(`0.${unix[2]}`) * 1000) : 0);
  const utc = value.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) UTC$/);
  if (utc) return Date.parse(`${utc[1]}T${utc[2]}Z`);
  return null;
}

/**
 * Часът в началото на ред от лога на CSS („2026-10-24 15:01:58.441 +02:00 [INFO] …“).
 * @param {string} line
 * @returns {number | null} ms
 */
export function parseCssTime(line) {
  const m = line.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ([+-]\d{2}:\d{2})/);
  if (!m) return null;
  const t = Date.parse(`${m[1]}T${m[2]}${m[3]}`);
  return Number.isNaN(t) ? null : t;
}

/** @param {string} dir @returns {Promise<Array<{ path: string, mtimeMs: number }>>} най-новият първи */
async function cssLogFiles(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") return [];
    throw err;
  }
  const files = [];
  for (const name of names) {
    if (!/^log-all.*\.txt$/.test(name)) continue;
    const path = join(dir, name);
    try {
      const st = await stat(path);
      if (st.isFile()) files.push({ path, mtimeMs: st.mtimeMs });
    } catch {
      // изтрит междувременно (ротация)
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs || (a.path < b.path ? 1 : -1));
}

/**
 * Последните `n` реда на файл, като се чете само краят му (логът на CSS може да е голям).
 * @param {string} path
 * @param {number} n
 */
export async function tailFile(path, n) {
  const fh = await open(path, "r");
  try {
    const { size } = await fh.stat();
    const want = Math.min(size, 1024 * 1024);
    const buf = Buffer.alloc(want);
    await fh.read(buf, 0, want, size - want);
    let text = buf.toString("utf8");
    if (want < size) text = text.slice(text.indexOf("\n") + 1); // първият ред е отрязан
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-n);
  } finally {
    await fh.close();
  }
}

/**
 * Има ли ред „Finished loading plugin <name>“ с час ≥ sinceMs в лог файл, променян след sinceMs?
 * @param {string} dir
 * @param {string} name
 * @param {number} sinceMs
 */
export async function pluginLoadedSince(dir, name, sinceMs) {
  const needle = `Finished loading plugin ${name}`;
  const sinceS = Math.floor(sinceMs / 1000);
  for (const f of await cssLogFiles(dir)) {
    if (f.mtimeMs < sinceMs - 1000) break; // по-старите не може да съдържат реда
    const rl = createInterface({ input: createReadStream(f.path, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes(needle)) continue;
      const at = parseCssTime(line);
      if (at !== null && Math.floor(at / 1000) >= sinceS) {
        rl.close();
        return true;
      }
    }
  }
  return false;
}

/** Съдържанието без празните краища; липсващ/нечетим файл → null (статусът е частичен, не пада). */
async function readTrimmed(/** @type {string} */ path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

/** Кратко, редактирано описание на провал (за `data.detail` в отговора). */
function failDetail(/** @type {unknown} */ err) {
  const e = /** @type {{ killed?: boolean, signal?: string, stderr?: string, message?: string, code?: unknown }} */ (err ?? {});
  if (e.killed || e.signal === "SIGTERM") return "timeout";
  const text = (e.stderr && e.stderr.trim()) || e.message || String(err);
  return redactLine(text.split("\n")[0]).slice(0, 300);
}

/**
 * Диспечерът на действията. `exec` се подменя в тестовете; start/stop/restart/update са еднопоточни.
 * @param {{ exec?: ExecFn, paths?: ReturnType<typeof defaultPaths> }} [deps]
 */
export function createDispatcher({ exec = execAllowed, paths = defaultPaths() } = {}) {
  /** @type {string | null} */
  let running = null;
  /** Кеш „модовете са заредени след старта X“ (true не се променя, докато X е същото). */
  /** @type {{ since: number, value: boolean, at: number } | null} */
  let modsCache = null;

  async function unitStates() {
    const { stdout } = await exec(
      BIN.systemctl,
      ["show", GAME_UNIT, UPDATE_UNIT, "--property=Id,ActiveState,ActiveEnterTimestamp", "--timestamp=unix"],
      { timeout: 10_000 },
    );
    return parseShow(stdout);
  }

  /** @param {number} since */
  async function modsLoaded(since) {
    const now = Date.now();
    if (modsCache && modsCache.since === since && (modsCache.value || now - modsCache.at < 15_000)) return modsCache.value;
    // Нечетим лог → „не“ (не знаем = не доказано); причината се вижда с logs css.
    const value = await pluginLoadedSince(paths.cssLogs, PROBE_PLUGIN, since).catch(() => false);
    modsCache = { since, value, at: now };
    return value;
  }

  async function status() {
    const units = await unitStates();
    const game = units.get(GAME_UNIT) ?? {};
    const update = units.get(UPDATE_UNIT) ?? {};
    const state = game.ActiveState ?? "unknown";
    const active = state === "active";
    const since = active ? parseSystemdTime(game.ActiveEnterTimestamp) : null;
    const inf = await readTrimmed(paths.steamInf);
    const gameVersion = inf?.match(/^PatchVersion=(.+)$/m)?.[1].trim() ?? null;
    const broken = (await readTrimmed(paths.modsBroken)) || null;
    return {
      active,
      state,
      since,
      gameVersion,
      modsLoaded: active && since !== null ? await modsLoaded(since) : false,
      broken,
      busy: running ?? (update.ActiveState === "activating" ? "update" : null),
    };
  }

  /**
   * @param {"start" | "stop" | "restart" | "update"} action
   * @param {string[]} args
   * @param {number} timeout
   */
  async function mutate(action, args, timeout) {
    if (running) return { ok: false, error: "busy" };
    running = action;
    try {
      // Ъпдейтът (таймерът на 10 мин или от панела) спира и пуска играта сам — не се намесваме.
      if ((await unitStates()).get(UPDATE_UNIT)?.ActiveState === "activating") return { ok: false, error: "busy" };
      await exec(BIN.systemctl, args, { timeout });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: "failed", data: { detail: failDetail(err) } };
    } finally {
      running = null;
    }
  }

  /** @param {number} n */
  async function cssLogs(n) {
    const [newest] = await cssLogFiles(paths.cssLogs);
    return newest ? redactLines(await tailFile(newest.path, n)) : [];
  }

  /** @param {number} n */
  async function journalLogs(n) {
    const { stdout } = await exec(
      BIN.journalctl,
      ["-u", GAME_UNIT, "-n", String(n), "-o", "short-iso", "--no-pager", "--quiet"],
      { timeout: 15_000 },
    );
    const lines = stdout.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return redactLines(lines.slice(-n));
  }

  /**
   * @param {string} action
   * @param {Record<string, unknown>} [args]
   * @returns {Promise<{ ok: boolean, error?: string, data?: unknown }>}
   */
  async function run(action, args = {}) {
    try {
      switch (action) {
        case "status":
          return { ok: true, data: await status() };
        // Спиране от панела държи: update.sh пуска играта само ако е вървяла (was_active), а новият опит
        // със счупените модове иска празен сървър, който отговаря на A2S.
        case "start":
          return await mutate("start", ["--no-ask-password", "start", GAME_UNIT], 120_000);
        case "stop":
          return await mutate("stop", ["--no-ask-password", "stop", GAME_UNIT], 120_000);
        case "restart":
          return await mutate("restart", ["--no-ask-password", "restart", GAME_UNIT], 120_000);
        case "update":
          return await mutate("update", ["--no-ask-password", "start", "--no-block", UPDATE_UNIT], 30_000);
        case "logs": {
          const v = validateLogsArgs(args);
          if (!v.ok) return v;
          const lines = v.source === "css" ? await cssLogs(v.lines) : await journalLogs(v.lines);
          return { ok: true, data: { source: v.source, lines } };
        }
        default:
          return { ok: false, error: "unknown action" };
      }
    } catch (err) {
      return { ok: false, error: "failed", data: { detail: failDetail(err) } };
    }
  }

  return { run, isBusy: () => running };
}

// ── A2S сърдечен ритъм ──────────────────────────────────────────────────────────────────────────

/**
 * Снимката за `cs2dm:a2s` по §9. `players` е както в A2S (с ботовете), `bots` — отделно.
 * Без отговор → online: false и null навсякъде (никога измислени числа).
 * @param {typeof queryInfo} query
 * @param {number} port
 * @param {() => number} now
 */
export async function a2sSnapshot(query, port, now = Date.now) {
  try {
    const i = await query("127.0.0.1", port, 3000);
    return {
      ts: now(),
      online: true,
      name: String(i.name).slice(0, 128),
      map: String(i.map).slice(0, 64),
      players: i.players,
      bots: i.bots,
      maxPlayers: i.maxPlayers,
    };
  } catch {
    return { ts: now(), online: false, name: null, map: null, players: null, bots: null, maxPlayers: null };
  }
}

// ── Агентът ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ key: string, redis: { host: string, port: number, password?: string, db?: number }, cs2Port: number }} AgentConfig
 */

/**
 * @param {AgentConfig & { channels?: typeof CHANNELS, exec?: ExecFn, query?: typeof queryInfo,
 *   paths?: ReturnType<typeof defaultPaths>, now?: () => number, log?: (msg: string) => void, heartbeatMs?: number }} cfg
 */
export function createAgent(cfg) {
  const { key, redis, cs2Port, channels = CHANNELS, query = queryInfo, now = Date.now, heartbeatMs = HEARTBEAT_MS } = cfg;
  const say = cfg.log ?? log;
  const guard = new ReplayGuard();
  const dispatcher = createDispatcher({ exec: cfg.exec, paths: cfg.paths });
  let beating = false;
  let a2sDown = false;
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  /** @type {NodeJS.Timeout | undefined} */
  let pinger;

  const pub = new RedisConnection({ ...redis, name: "команди", log: say, onReady: () => void heartbeat() });
  const sub = new RedisConnection({
    ...redis,
    name: "абонамент",
    log: say,
    onReady: (c) => c.subscribe(channels.cmd),
    onMessage: (_channel, message) => void handle(message),
  });

  /** @param {string} message */
  async function handle(message) {
    const opened = openCommand(message, key, now(), guard);
    if (!opened.ok) {
      // Като плъгина: отхвърлената команда не получава отговор (не вярваме на id-то ѝ).
      say(`отхвърлена команда (${opened.error})`);
      return;
    }
    const { id, action, actor } = opened.command;
    say(`команда ${action} · id ${id} · от ${actor.slice(0, 32)}`);
    const result = await dispatcher.run(action, opened.command.args);
    /** @type {{ id: string, ok: boolean, error?: string, data?: unknown }} */
    const ack = { id, ok: result.ok };
    if (result.error) ack.error = result.error;
    if (result.data !== undefined) ack.data = result.data;
    if (!result.ok) say(`команда ${action} · id ${id}: ${result.error}`);
    try {
      await pub.command("PUBLISH", channels.ack, JSON.stringify(ack));
    } catch (err) {
      say(`отговорът за ${id} не е изпратен: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function heartbeat() {
    if (beating) return;
    beating = true;
    try {
      const snap = await a2sSnapshot(query, cs2Port, now);
      if (snap.online === a2sDown) {
        a2sDown = !snap.online;
        say(snap.online ? "A2S: сървърът отговаря" : `A2S: няма отговор от 127.0.0.1:${cs2Port}`);
      }
      await pub.command("SET", channels.a2s, JSON.stringify(snap), "EX", A2S_TTL_S);
    } catch {
      // Redis липсва → RedisConnection вече е казал; следващият удар ще опита пак.
    } finally {
      beating = false;
    }
  }

  /** Полуотворена връзка на абоната не се вижда — PING на 30 s, без отговор за 10 s → наново. */
  async function pingSubscriber() {
    if (!sub.ready) return;
    const t = setTimeout(() => sub.sock?.destroy(new Error("PING без отговор")), 10_000);
    try {
      await sub.command("PING");
    } catch {
      // close-ът ще свърже наново
    } finally {
      clearTimeout(t);
    }
  }

  return {
    start() {
      pub.start();
      sub.start();
      timer = setInterval(() => void heartbeat(), heartbeatMs);
      pinger = setInterval(() => void pingSubscriber(), 30_000);
      say(`слуша ${channels.cmd} на ${redis.host}:${redis.port}; A2S → ${channels.a2s} на ${heartbeatMs / 1000} s`);
      return this;
    },
    stop() {
      clearInterval(timer);
      clearInterval(pinger);
      pub.stop();
      sub.stop();
    },
    handle,
    heartbeat,
    dispatcher,
    connections: { pub, sub },
  };
}

// ── Настройки и CLI ─────────────────────────────────────────────────────────────────────────────

/** @param {string | undefined} v @param {number} def @param {number} min @param {number} max @param {string} name */
function intSetting(v, def, min, max, name) {
  if (v === undefined || v === "") return def;
  if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) throw new Error(`${name}: очаквам цяло число ${min}…${max}`);
  return Number(v);
}

/**
 * Настройките от средата (/etc/cs2/agent.env през EnvironmentFile на unit-а).
 * @param {Record<string, string | undefined>} env
 * @returns {AgentConfig}
 */
export function configFromEnv(env) {
  const key = env.CS2DM_AGENT_KEY ?? "";
  if (key.length < 32) throw new Error("CS2DM_AGENT_KEY липсва или е под 32 знака — агентът не тръгва (install-agent.sh го генерира)");
  const host = env.CS2DM_REDIS_HOST || "127.0.0.1";
  // Redis на приложението е вързан само за loopback (CONTRACT §5) — друг адрес е грешка в настройката.
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) throw new Error(`CS2DM_REDIS_HOST=${host}: позволен е само 127.0.0.1`);
  return {
    key,
    redis: {
      host,
      port: intSetting(env.CS2DM_REDIS_PORT, 6392, 1, 65535, "CS2DM_REDIS_PORT"),
      password: env.CS2DM_REDIS_PASSWORD || undefined,
      db: intSetting(env.CS2DM_REDIS_DB, 0, 0, 15, "CS2DM_REDIS_DB"),
    },
    cs2Port: intSetting(env.CS2_PORT, 27015, 1, 65535, "CS2_PORT"),
  };
}

/**
 * KEY=VALUE файл като EnvironmentFile на systemd (коментари, празни редове, кавички отвън).
 * @param {string} text
 */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    let v = line.slice(eq + 1).trim();
    if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1);
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

/**
 * Самопроверка за install-agent.sh: подписва status и logs към работещия агент и чака отговорите.
 * Печата само обобщение (без тайни и без редовете от логовете). 0 = агентът отговаря.
 * @param {string} envFile
 * @param {{ timeoutMs?: number, channels?: typeof CHANNELS, out?: (line: string) => void }} [opts]
 */
export async function selftest(envFile, { timeoutMs = 10_000, channels = CHANNELS, out: print } = {}) {
  const cfg = configFromEnv(parseEnvFile(await readFile(envFile, "utf8")));
  const quiet = () => {};
  /** @type {Map<string, (ack: Record<string, unknown>) => void>} */
  const waiting = new Map();
  /** @type {() => void} */
  let onSubscribed = () => {};
  const subscribed = new Promise((resolve) => (onSubscribed = /** @type {() => void} */ (resolve)));
  const sub = new RedisConnection({
    ...cfg.redis,
    name: "самопроверка",
    log: quiet,
    onReady: async (c) => {
      await c.subscribe(channels.ack);
      onSubscribed();
    },
    onMessage: (_ch, message) => {
      try {
        const ack = JSON.parse(message);
        waiting.get(ack?.id)?.(ack);
      } catch {
        // чужд отговор
      }
    },
  }).start();
  const pub = new RedisConnection({ ...cfg.redis, name: "самопроверка", log: quiet }).start();
  const out = print ?? ((/** @type {string} */ s) => process.stdout.write(`  ${s}\n`));
  /** @param {string} action @param {Record<string, unknown>} args */
  const ask = (action, args) =>
    new Promise((resolve) => {
      const id = randomUUID();
      const t = setTimeout(() => {
        waiting.delete(id);
        resolve(null);
      }, timeoutMs);
      waiting.set(id, (ack) => {
        clearTimeout(t);
        waiting.delete(id);
        resolve(ack);
      });
      const payload = JSON.stringify({ id, ts: Date.now(), actor: "install-agent", action, args });
      pub.command("PUBLISH", channels.cmd, envelope(payload, cfg.key)).catch(() => {});
    });
  try {
    let ready = false;
    let subDone = false;
    subscribed.then(() => (subDone = true));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !(ready = subDone && pub.ready)) await new Promise((r) => setTimeout(r, 50));
    if (!ready) {
      out(`✘ Redis на ${cfg.redis.host}:${cfg.redis.port} не отговаря (или паролата е грешна)`);
      return 1;
    }
    const status = /** @type {{ ok?: boolean, data?: Record<string, unknown>, error?: string } | null} */ (await ask("status", {}));
    if (!status) {
      out("✘ агентът не отговори на подписан status за 10 s (journalctl -u cs2-agent -n 50)");
      return 1;
    }
    if (!status.ok) {
      const detail = /** @type {{ detail?: string } | undefined} */ (/** @type {{ data?: unknown }} */ (status).data)?.detail;
      out(`✘ status: ${status.error}${detail ? ` (${detail})` : ""}`);
      return 1;
    }
    const d = status.data ?? {};
    out(`✓ status: ${d.active ? "играта върви" : `играта не върви (${d.state})`} · версия ${d.gameVersion ?? "?"} · модове ${d.modsLoaded ? "заредени" : "не"}${d.broken ? ` · счупени при ${d.broken}` : ""}`);
    let code = 0;
    for (const source of ["journal", "css"]) {
      const r = /** @type {{ ok?: boolean, data?: { lines?: unknown[] }, error?: string } | null} */ (await ask("logs", { source, lines: 1 }));
      if (r?.ok) out(`✓ logs ${source}: ${r.data?.lines?.length ?? 0} ред(а) (редактирани)`);
      else {
        const detail = /** @type {{ data?: { detail?: string } }} */ (r ?? {}).data?.detail;
        out(`⚠ logs ${source}: ${r ? `${r.error}${detail ? ` (${detail})` : ""}` : "няма отговор"}`);
        code = 1;
      }
    }
    return code;
  } finally {
    sub.stop();
    pub.stop();
  }
}

async function main(/** @type {string[]} */ argv) {
  if (argv[0] === "--selftest") {
    process.exitCode = await selftest(argv[1] ?? "/etc/cs2/agent.env");
    return;
  }
  if (argv.length > 0) {
    process.stderr.write("употреба: cs2-agent.mjs [--selftest [env файл]]\n");
    process.exitCode = 2;
    return;
  }
  /** @type {AgentConfig} */
  let cfg;
  try {
    cfg = configFromEnv(process.env);
  } catch (err) {
    process.stderr.write(`[cs2-agent] СТОП: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  // Тайните не остават в средата (децата и без това получават CHILD_ENV).
  delete process.env.CS2DM_AGENT_KEY;
  delete process.env.CS2DM_REDIS_PASSWORD;
  const agent = createAgent(cfg).start();
  const shutdown = () => {
    log("спирам");
    agent.stop();
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}

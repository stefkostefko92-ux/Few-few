// safe.mjs — НАШ модул (Carbon Stealth VCC, 24.11.2026), не е от cth9191/animate.
// Общите предпазители на умението animacia по двата прегледа (Кодаджията, Разбивача; втори — и Правния):
//   playwright()  — Chromium без мрежа: всеки контекст е offline и пуска само file:/data:/blob:/about:;
//                   WebRTC е махнат от страницата, а UDP/TCP на WebRTC и DNS отиват в мъртъв прокси
//   spawnSync()   — като node:child_process; за ffmpeg/ffprobe всеки вход -i е само файл или pipe
//   inside()      — пътят остава в базовата папка (piece.json, voice script, --out) — и след symlink
//   noLinks()     — парчето без нито един symlink (изходите се пишат с writeFileSync и ffmpeg -y, а те следват връзката)
//   num() / name()— числа в граници за филтрите на ffmpeg; kebab имена за стил/ред (без пътища)
//   jsonForScript — JSON, който не може да затвори inline <script>
import { createRequire } from 'node:module';
import { spawnSync as rawSpawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const LOCAL = /^(file|data|blob|about):/i;

/** Playwright с Chromium, който не излиза в мрежата. Липсва ли — човекът го инсталира (tools/video/doctor.mjs). */
export function playwright() {
  let pw;
  try { pw = require('playwright'); } catch {
    console.error('Playwright липсва. Инсталира го човекът (виж tools/video/doctor.mjs) — умението нищо не инсталира.');
    process.exit(2);
  }
  return { chromium: offline(pw.chromium) };
}

// route() и offline виждат HTTP и WebSocket, но не WebRTC (ICE/TURN по TCP мина покрай тях — втори преглед,
// Разбивача): затова (1) страницата и всяка рамка остават без RTCPeerConnection, (2) WebRTC и имената отиват
// в прокси, който не съществува (127.0.0.1:9), а UDP извън прокси е забранен.
const NO_RTC = () => {
  for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate', 'RTCDataChannel']) {
    try { Object.defineProperty(globalThis, k, { value: undefined, configurable: false, writable: false }); } catch {}
  }
};
const NET_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'];
const DEAD_PROXY = { server: 'http://127.0.0.1:9', bypass: '<-loopback>' };

async function lock(ctx) {
  await ctx.addInitScript(NO_RTC);
  await ctx.route('**/*', (r) => (LOCAL.test(r.request().url()) ? r.continue() : r.abort()));
  if (typeof ctx.routeWebSocket === 'function') await ctx.routeWebSocket(/.*/, (ws) => ws.close());
}

/** Обвивка: launch() връща браузър, чиито newContext/newPage са offline и с мрежова ограда. */
export function offline(chromium) {
  return {
    async launch(opts = {}) {
      const browser = await chromium.launch({ ...opts, args: [...(opts.args || []), ...NET_ARGS], proxy: DEAD_PROXY });
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (o = {}) => { const c = await newContext({ ...o, offline: true }); await lock(c); return c; };
      browser.newPage = async (o = {}) => {
        const c = await browser.newContext(o);
        const p = await c.newPage();
        p.on('close', () => { c.close().catch(() => {}); });
        return p;
      };
      return browser;
    },
  };
}

/** ffmpeg/ffprobe: преди всеки -i добавя -protocol_whitelist file,pipe (без http:, tcp:, concat:, subfile:);
 *  ffprobe взима входа без -i — там оградата е най-отпред. */
export function ffArgs(args, cmd = 'ffmpeg') {
  const out = cmd === 'ffprobe' ? ['-protocol_whitelist', 'file,pipe'] : [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i') out.push('-protocol_whitelist', 'file,pipe');
    out.push(args[i]);
  }
  return out;
}

export function spawnSync(cmd, args = [], opts) {
  const a = cmd === 'ffmpeg' || cmd === 'ffprobe' ? ffArgs(args, cmd) : args;
  return rawSpawnSync(cmd, a, opts);
}

const under = (b, abs) => { const rel = path.relative(b, abs); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
const exists = (q) => { try { fs.lstatSync(q); return true; } catch { return false; } };
/** Реалният път след всички symlink-ове; несъществуващата опашка се добавя към реалния път на най-близкия
 *  съществуващ родител. Висящ symlink → null (не знаем къде води — отказ). */
function real(p) {
  let q = path.resolve(p);
  const tail = [];
  while (!exists(q)) { const up = path.dirname(q); if (up === q) break; tail.unshift(path.basename(q)); q = up; }
  try { return path.join(fs.realpathSync(q), ...tail); } catch { return null; }
}
const realUnder = (b, abs) => { const rb = real(b), ra = real(abs); return rb !== null && ra !== null && under(rb, ra); };

/** Абсолютният път на p спрямо base; хвърля, ако излиза извън base — по текста и след symlink-овете. */
export function inside(base, p) {
  const b = path.resolve(base), abs = path.resolve(b, String(p));
  if (!under(b, abs) || !realUnder(b, abs)) throw new Error(`път извън ${b}: ${p}`);
  return abs;
}

/** p спрямо from, но само в една от базите (напр. папката на парчето или самото умение) — и след symlink-овете. */
export function insideAny(bases, from, p) {
  const abs = path.resolve(from, String(p));
  for (const b of bases.map((x) => path.resolve(x))) if (under(b, abs) && realUnder(b, abs)) return abs;
  throw new Error(`път извън ${bases.join(' / ')}: ${p}`);
}

/** Парчето без нито един symlink — проверява се ПРЕДИ всеки запис в него. writeFileSync и ffmpeg -y следват
 *  връзка в последния елемент: renders/audio.wav → ~/.bashrc презаписваше външния файл (повторен опит, Разбивача,
 *  24.11.2026). Истинските файлове и папки минават; връзка където и да е в дървото → отказ. */
export function noLinks(root) {
  const r = path.resolve(root);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) throw new Error(`symlink в парчето — отказ: ${path.relative(r, p)} (само истински файлове и папки)`);
      if (e.isDirectory()) walk(p);
    }
  };
  if (fs.existsSync(r)) walk(r);
  return r;
}

/** Изходен файл по избор (напр. beats.json): не може да е symlink. */
export function outFile(p) {
  try { if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`symlink — отказ: ${p}`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return p;
}

/** Крайно число в [lo, hi]; иначе хвърля — стойността отива във филтъра на ffmpeg. */
export function num(v, dflt, lo, hi, what) {
  const n = v === undefined || v === null || v === '' ? dflt : Number(v);
  if (typeof v === 'string' && v.trim() !== '' && !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(v.trim())) throw new Error(`${what}: не е число (${v})`);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${what}: ${v} е извън [${lo}, ${hi}]`);
  return n;
}

const NAME = /^[a-z0-9][a-z0-9_-]*$/i;
/** Име на стил, ред или кадър — без точки, наклонени черти и интервали. */
export function name(v, what) {
  if (!NAME.test(String(v ?? ''))) throw new Error(`${what}: „${v}“ не е позволено име (букви, цифри, - и _)`);
  return String(v);
}

/** JSON за вграждане в inline <script>: <, >, &, U+2028, U+2029 стават \uXXXX. */
export function jsonForScript(v) {
  return JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

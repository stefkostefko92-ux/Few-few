// safe.mjs — НАШ модул (Carbon Stealth VCC, 24.11.2026), не е от cth9191/animate.
// Общите предпазители на умението animacia по двата прегледа (Кодаджията, Разбивача):
//   playwright()  — Chromium без мрежа: всеки контекст е offline и пуска само file:/data:/blob:/about:
//   spawnSync()   — като node:child_process; за ffmpeg/ffprobe всеки вход -i е само файл или pipe
//   inside()      — пътят остава в базовата папка (piece.json, voice script, --out)
//   num() / name()— числа в граници за филтрите на ffmpeg; kebab имена за стил/ред (без пътища)
//   jsonForScript — JSON, който не може да затвори inline <script>
import { createRequire } from 'node:module';
import { spawnSync as rawSpawnSync } from 'node:child_process';
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

async function lock(ctx) {
  await ctx.route('**/*', (r) => (LOCAL.test(r.request().url()) ? r.continue() : r.abort()));
  if (typeof ctx.routeWebSocket === 'function') await ctx.routeWebSocket(/.*/, (ws) => ws.close());
}

/** Обвивка: launch() връща браузър, чиито newContext/newPage са offline и с мрежова ограда. */
export function offline(chromium) {
  return {
    async launch(opts = {}) {
      const browser = await chromium.launch(opts);
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

/** ffmpeg/ffprobe: преди всеки -i добавя -protocol_whitelist file,pipe (без http:, tcp:, concat:, subfile:). */
export function ffArgs(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i') out.push('-protocol_whitelist', 'file,pipe');
    out.push(args[i]);
  }
  return out;
}

export function spawnSync(cmd, args = [], opts) {
  const a = cmd === 'ffmpeg' || cmd === 'ffprobe' ? ffArgs(args) : args;
  return rawSpawnSync(cmd, a, opts);
}

/** Абсолютният път на p спрямо base; хвърля, ако излиза извън base. */
export function inside(base, p) {
  const b = path.resolve(base), abs = path.resolve(b, String(p));
  const rel = path.relative(b, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`път извън ${b}: ${p}`);
  return abs;
}

/** p спрямо from, но само в една от базите (напр. папката на парчето или самото умение). */
export function insideAny(bases, from, p) {
  const abs = path.resolve(from, String(p));
  for (const b of bases) {
    const rel = path.relative(path.resolve(b), abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return abs;
  }
  throw new Error(`път извън ${bases.join(' / ')}: ${p}`);
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

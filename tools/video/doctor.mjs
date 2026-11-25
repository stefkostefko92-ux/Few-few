#!/usr/bin/env node
// doctor.mjs — готово ли е видео студиото на този компютър? Пуска се след инсталацията (AI Studio го чете
// преди всяка работа, вместо да помни версии). Само чете: нищо не инсталира, нищо не записва.
//
// Проверява: Node ≥ 20 и npm · FFmpeg и ffprobe (енкодерите h264_nvenc, hevc_nvenc, libx264, dnxhd,
// prores_ks, aac и филтъра loudnorm) · Python 3 · Blender · NVIDIA GPU (nvidia-smi) · Audacity и
// DaVinci Resolve (по избор — само дали са инсталирани). Основната цел е Windows + NVIDIA; на macOS/Linux
// пак работи, но ще покаже NVENC и Resolve като липсващи.
//
//   node tools/video/doctor.mjs          # таблица ✓/✗ с какво да направиш
//   node tools/video/doctor.mjs --json   # за агента; изход 1, ако задължително нещо липсва
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_ENCODERS = ["h264_nvenc", "hevc_nvenc", "libx264", "dnxhd", "prores_ks", "aac"];
const REQUIRED_FILTERS = ["loudnorm"];
const MIN_NODE = 20;

/** Версията от първия ред на `--version`/`-version` на всяка програма. */
export function parseVersion(tool, stdout) {
  const s = String(stdout || "");
  const re = {
    node: /^v(\d+\.\d+\.\d+)/m,
    npm: /^(\d+\.\d+\.\d+)/m,
    ffmpeg: /^ffmpeg version n?([0-9][\w.-]*?)(?:-full_build|-essentials_build|-www|\s|$)/m,
    ffprobe: /^ffprobe version n?([0-9][\w.-]*?)(?:-full_build|-essentials_build|-www|\s|$)/m,
    blender: /^Blender (\d+\.\d+(?:\.\d+)?)/m,
    python: /^Python (\d+\.\d+\.\d+)/m,
  }[tool];
  const m = re && s.match(re);
  return m ? m[1] : null;
}

/** Имената от `ffmpeg -encoders` / `ffmpeg -filters` (втората колона след флаговете). */
export function parseCodecList(stdout) {
  const out = new Set();
  for (const line of String(stdout || "").split("\n")) {
    const m = line.match(/^\s*[A-Z.]{3,6}\s+([a-z0-9_]+)\s/);
    if (m && !/^-+$/.test(m[1])) out.add(m[1]);
  }
  return out;
}

export function parseGpu(stdout) {
  const line = String(stdout || "").split("\n").find((l) => l.includes(","));
  if (!line) return null;
  const [name, driver] = line.split(",").map((x) => x.trim());
  return name ? { name, driver } : null;
}

/** „Blender 4.10“ е по-нов от „Blender 4.5“ — сравнение по числа. */
export function newestBlenderDir(names) {
  const v = (n) => (n.match(/^Blender (\d+)\.(\d+)/) || []).slice(1).map(Number);
  const c = names.filter((n) => v(n).length === 2).sort((a, b) => v(b)[0] - v(a)[0] || v(b)[1] - v(a)[1]);
  return c[0] || null;
}

const HINT = {
  node: "winget install OpenJS.NodeJS.LTS (после нов терминал)",
  npm: "идва с Node — преинсталирай Node LTS",
  ffmpeg: "winget install Gyan.FFmpeg (пълната компилация — има NVENC, DNxHR и ProRes)",
  ffprobe: "идва с FFmpeg — провери PATH",
  python: "winget search Python.Python → winget install на най-новия 3.x",
  blender: "winget install BlenderFoundation.Blender",
  gpu: "драйвер на NVIDIA от nvidia.com (без него няма NVENC и OptiX)",
  audacity: "winget install Audacity.Audacity (по избор — ръчна работа с гласа)",
  resolve: "ръчно от blackmagicdesign.com/products/davinciresolve (безплатната версия; по избор — финален монтаж)",
};

/** Присъдата: редове за таблицата + ready (всичко задължително е налице). */
export function assess(found) {
  const rows = [];
  const add = (id, label, required, ok, detail, hint) => rows.push({ id, label, required, ok: !!ok, detail: detail || "—", hint: ok ? "" : hint || HINT[id] });
  const major = (v) => Number(String(v || "").split(".")[0]);
  add("node", "Node.js", true, found.node && major(found.node.version) >= MIN_NODE, found.node?.version,
    found.node ? `Node ${found.node.version} е стар — нужен е ≥ ${MIN_NODE}: ${HINT.node}` : HINT.node);
  add("npm", "npm", true, found.npm, found.npm?.version);
  const f = found.ffmpeg;
  const missingEnc = f ? REQUIRED_ENCODERS.filter((e) => !f.encoders?.has(e)) : REQUIRED_ENCODERS;
  const missingFlt = f ? REQUIRED_FILTERS.filter((e) => !f.filters?.has(e)) : REQUIRED_FILTERS;
  add("ffmpeg", "FFmpeg", true, f && !missingEnc.length && !missingFlt.length,
    f ? `${f.version}${missingEnc.length || missingFlt.length ? ` · липсват: ${[...missingEnc, ...missingFlt].join(", ")}` : " · NVENC, DNxHR, ProRes, loudnorm"}` : null,
    f ? `липсват ${[...missingEnc, ...missingFlt].join(", ")} — ${missingEnc.some((e) => e.endsWith("_nvenc")) ? "NVENC иска NVIDIA GPU и драйвер; " : ""}${HINT.ffmpeg}` : HINT.ffmpeg);
  add("ffprobe", "ffprobe", true, found.ffprobe, found.ffprobe?.version);
  add("python", "Python 3", true, found.python && major(found.python.version) >= 3, found.python?.version,
    found.python ? `Python ${found.python.version} не е 3.x — ${HINT.python}` : HINT.python);
  add("blender", "Blender", true, found.blender, found.blender ? `${found.blender.version}${found.blender.path ? ` · ${found.blender.path}` : ""}` : null);
  add("gpu", "NVIDIA GPU", true, found.gpu, found.gpu ? `${found.gpu.name} · драйвер ${found.gpu.driver}` : null);
  add("audacity", "Audacity", false, found.audacity, found.audacity?.path);
  add("resolve", "DaVinci Resolve", false, found.resolve, found.resolve?.path);
  return { ready: rows.filter((r) => r.required).every((r) => r.ok), rows };
}

// ── Сондите (само тук има достъп до системата) ─────────────────────────────────────────────────────
// Без shell — с едно изключение: npm.cmd на Windows. От Node 18.20.2/20.12.2 (CVE-2024-27980) .cmd без
// shell връща EINVAL и npm винаги излизаше „липсва“ (ревю на Кодаджията 23.11.2026). Аргументите са константи.
const sh = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true, ...extra });
  return r.error || r.status !== 0 ? null : `${r.stdout || ""}${r.stderr || ""}`;
};
const version = (tool, cmd, args, extra) => { const out = sh(cmd, args, extra); const v = out && parseVersion(tool, out); return v ? { version: v } : null; };

function probe() {
  const win = process.platform === "win32";
  const pf = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  const found = {};
  found.node = { version: process.versions.node };
  found.npm = version("npm", win ? "npm.cmd" : "npm", ["--version"], win ? { shell: true } : {});
  const ff = sh("ffmpeg", ["-version"]);
  if (ff) {
    found.ffmpeg = { version: parseVersion("ffmpeg", ff), encoders: parseCodecList(sh("ffmpeg", ["-hide_banner", "-encoders"])), filters: parseCodecList(sh("ffmpeg", ["-hide_banner", "-filters"])) };
  }
  found.ffprobe = version("ffprobe", "ffprobe", ["-version"]);
  found.python = version("python", win ? "py" : "python3", win ? ["-3", "--version"] : ["--version"]) || version("python", "python", ["--version"]);
  let b = version("blender", "blender", ["--version"]);
  if (!b && win) for (const root of pf) {
    const base = join(root, "Blender Foundation");
    const dir = existsSync(base) && newestBlenderDir(readdirSync(base));
    const exe = dir && join(base, dir, "blender.exe");
    if (exe && existsSync(exe)) { b = version("blender", exe, ["--version"]); if (b) { b.path = exe; break; } }
  }
  found.blender = b;
  found.gpu = parseGpu(sh("nvidia-smi", ["--query-gpu=name,driver_version", "--format=csv,noheader"]));
  const firstExisting = (rel) => pf.map((r) => join(r, rel)).find((p) => existsSync(p));
  const aud = firstExisting(join("Audacity", "Audacity.exe")) || (sh("audacity", ["--version"]) ? "audacity (PATH)" : null);
  found.audacity = aud ? { path: aud } : null;
  const res = firstExisting(join("Blackmagic Design", "DaVinci Resolve", "Resolve.exe")) ||
    (existsSync("/Applications/DaVinci Resolve/DaVinci Resolve.app") ? "/Applications/DaVinci Resolve/DaVinci Resolve.app" : null) ||
    (existsSync("/opt/resolve/bin/resolve") ? "/opt/resolve/bin/resolve" : null);
  found.resolve = res ? { path: res } : null;
  return found;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = assess(probe());
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ platform: process.platform, ...a }, null, 2) + "\n");
  } else {
    console.log(`🎬 Видео студио · ${process.platform}`);
    for (const r of a.rows) console.log(`  ${r.ok ? "✓" : r.required ? "✗" : "·"} ${r.label.padEnd(16)} ${r.detail}${r.ok ? "" : `\n      → ${r.hint}`}`);
    console.log(a.ready ? "\nГотово: всичко задължително е налице." : "\nНе е готово: оправи редовете с ✗ и пусни пак.");
  }
  process.exit(a.ready ? 0 : 1);
}

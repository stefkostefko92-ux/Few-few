#!/usr/bin/env node
// presets.mjs — готовите команди за FFmpeg на студиото (AI Studio). Чисти функции → масив аргументи за spawn,
// никога shell низ: път с интервал или „;“ не става команда. Нула зависимости.
//
// Защо (23.11.2026): петте промо линии в репото (cs-revolution, fakturist, scuolabulgara, adblock, rilievi)
// повтаряха настройките на ръка, а 4K/60 за YouTube и мастерът за DaVinci Resolve имат точни изисквания.
// Числата за YouTube са от https://support.google.com/youtube/answer/1722171 (сверено 23.11.2026):
// MP4 + fast start, H.264 High, 2 B-кадъра, затворен GOP = половината кадри, 4:2:0, BT.709,
// 2160p при 48–60 fps SDR → 53–68 Mbps, AAC-LC 48 kHz, стерео 384 kbps.
// Безплатният Resolve чете „8-битови формати до UHD 60 fps“ (blackmagicdesign.com/products/davinciresolve) —
// затова мастерът по подразбиране е DNxHR HQ (8-бита); ProRes 422 HQ е по избор.
//
//   node tools/video/presets.mjs youtube4k60 --in out/master.mov --out out/youtube.mp4 [--encoder libx264] [--fps 60] [--force] [--run]
//   node tools/video/presets.mjs master      --in out/scene.mp4 --out out/master.mov [--codec prores_hq]
//   node tools/video/presets.mjs loudnorm    --in audio/voice.wav --out audio/voice-14.wav [--run]   # два прохода
//   node tools/video/presets.mjs frames      --pattern out/frames/%05d.png --out out/scene.mp4 [--audio audio/mix.wav]
//   node tools/video/presets.mjs vertical916 --in out/youtube.mp4 --out out/short.mp4
// Без --run само печата командата. С --run я пуска (ffmpeg трябва да е в PATH — виж doctor.mjs).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENCODERS = new Set(["h264_nvenc", "hevc_nvenc", "libx264"]);
const FPS = new Set([24, 25, 30, 48, 50, 60]);
const LOUD = { I: -14, TP: -1, LRA: 11 }; // YouTube и повечето платформи нормализират около −14 LUFS
const NUM = /^-?\d+(\.\d+)?$/;

// FFmpeg приема и протоколи (http:, tcp:, pipe:, concat:) на мястото на файл — тук път е само локален файл;
// буквата на устройството в Windows (C:\…) не е протокол (ревю на Кодаджията 23.11.2026).
function path(p, what) {
  if (typeof p !== "string" || !p || p.startsWith("-")) throw new Error(`${what}: нужен е път (не опция, не празно)`);
  if (/^[a-z][a-z0-9+.-]+:/i.test(p) && !/^[a-z]:[\\/]/i.test(p)) throw new Error(`${what}: нужен е път до локален файл, не протокол`);
  return p;
}
// „b.mov“ и „./b.mov“ са един файл — сравнението по низ пускаше --force да презапише входа (ревю 23.11.2026).
const same = (a, b) => (process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));
function io({ input, output, force }) {
  path(input, "вход"); path(output, "изход");
  if (same(input, output)) throw new Error("входът и изходът трябва да са различни файлове");
  return { pre: ["-hide_banner", force ? "-y" : "-n"] };
}
function checkFps(fps) {
  if (!FPS.has(fps)) throw new Error(`кадри в секунда: едно от ${[...FPS].join(", ")}`);
  return fps;
}

/** Видео част за YouTube: енкодер, профил, GOP, цвят. */
function videoArgs(encoder, fps, mbps = 60) {
  if (!ENCODERS.has(encoder)) throw new Error(`енкодер: едно от ${[...ENCODERS].join(", ")}`);
  const rate = ["-b:v", `${mbps}M`, "-maxrate", `${Math.round(mbps * 68 / 60)}M`, "-bufsize", `${mbps * 2}M`];
  const enc = encoder === "libx264"
    ? ["-c:v", "libx264", "-preset", "slow", "-profile:v", "high", ...rate]
    : ["-c:v", encoder, "-preset", "p7", "-tune", "hq", "-rc", "vbr", ...(encoder === "h264_nvenc" ? ["-profile:v", "high"] : ["-profile:v", "main"]), ...rate];
  return [...enc, "-bf", "2", "-g", String(Math.floor(fps / 2)), "-flags", "+cgop", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-r", String(fps)];
}
const audioYoutube = ["-c:a", "aac", "-b:a", "384k", "-ar", "48000"];

export function youtube4k60({ input, output, encoder = "h264_nvenc", fps = 60, force = false }) {
  const { pre } = io({ input, output, force });
  return [...pre, "-i", input, ...videoArgs(encoder, checkFps(fps)), ...audioYoutube, "-movflags", "+faststart", output];
}

export function master({ input, output, codec = "dnxhr_hq", force = false }) {
  const { pre } = io({ input, output, force });
  const v = codec === "dnxhr_hq" ? ["-c:v", "dnxhd", "-profile:v", "dnxhr_hq", "-pix_fmt", "yuv422p"]
    : codec === "prores_hq" ? ["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le"]
    : null;
  if (!v) throw new Error("кодек: dnxhr_hq или prores_hq");
  return [...pre, "-i", input, ...v, "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-c:a", "pcm_s24le", "-ar", "48000", output];
}

export function loudnormMeasure({ input }) {
  path(input, "вход");
  return ["-hide_banner", "-nostats", "-i", input, "-af", `loudnorm=I=${LOUD.I}:TP=${LOUD.TP}:LRA=${LOUD.LRA}:print_format=json`, "-f", "null", "-"];
}

/** Последният JSON блок, който loudnorm печата в stderr → измерените стойности (само числа). */
export function parseLoudnorm(stderr) {
  const m = String(stderr).match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!m) return null;
  try {
    const j = JSON.parse(m[m.length - 1]);
    const out = {};
    for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]) out[k] = String(j[k]);
    return out;
  } catch { return null; }
}

export function loudnormApply({ input, output, measured, force = false }) {
  const { pre } = io({ input, output, force });
  const m = measured || {};
  for (const k of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"])
    if (!NUM.test(String(m[k]))) throw new Error(`измерено ${k} не е число — пусни първо loudnormMeasure`);
  const af = `loudnorm=I=${LOUD.I}:TP=${LOUD.TP}:LRA=${LOUD.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  return [...pre, "-i", input, "-af", af, "-ar", "48000", output];
}

export function frames({ pattern, output, audio, fps = 60, encoder = "h264_nvenc", force = false }) {
  path(pattern, "поредица");
  const { pre } = io({ input: pattern, output, force });
  if (audio && same(path(audio, "звук"), output)) throw new Error("звукът и изходът трябва да са различни файлове");
  const a = audio ? ["-i", audio] : [];
  return [...pre, "-framerate", String(checkFps(fps)), "-i", pattern, ...a, ...videoArgs(encoder, fps),
    ...(audio ? [...audioYoutube, "-shortest"] : []), "-movflags", "+faststart", output];
}

// 30 fps и 12 Mbps — числата на Социалджията за 9:16 (socialdjiyata.md; 60 fps само при бързо движение).
export function vertical916({ input, output, encoder = "h264_nvenc", fps = 30, force = false }) {
  const { pre } = io({ input, output, force });
  return [...pre, "-i", input, "-vf", "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos", ...videoArgs(encoder, checkFps(fps), 12), ...audioYoutube, "-movflags", "+faststart", output];
}

/** Командата, както я вижда човек (кавички около аргументи с интервал или специални знаци). */
export function display(args) {
  return ["ffmpeg", ...args.map((a) => (/[\s"'&|<>^%!;()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))].join(" ");
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────
function cli(argv) {
  const [cmd, ...rest] = argv;
  const val = (f) => { const i = rest.indexOf(f); const v = i >= 0 ? rest[i + 1] : undefined; return v === undefined || v.startsWith("--") ? undefined : v; };
  const opt = { input: val("--in"), output: val("--out"), force: rest.includes("--force") };
  if (val("--fps")) opt.fps = Number(val("--fps"));
  if (val("--encoder")) opt.encoder = val("--encoder");
  const runIt = rest.includes("--run");
  // Прогресът на FFmpeg отива направо в терминала: събран в буфер, дълъг рендер го препълва (ENOBUFS) и
  // детето се убива. Само измерването на loudnorm се чете — то е кратко и е с -nostats.
  const exec = (args, { capture = false } = {}) => {
    console.log(display(args));
    if (!runIt) return { status: 0, stderr: "" };
    const r = spawnSync("ffmpeg", args, capture ? { stdio: ["ignore", "inherit", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } : { stdio: "inherit" });
    if (r.error) { console.error(`ffmpeg не тръгна: ${r.error.code} — пусни node tools/video/doctor.mjs`); process.exit(1); }
    if (capture) process.stderr.write(r.stderr || "");
    if (r.status !== 0) process.exit(r.status ?? 1); // убит със сигнал → status null; exit(null) би дал 0
    return r;
  };
  try {
    if (cmd === "youtube4k60") return exec(youtube4k60(opt));
    if (cmd === "master") return exec(master({ ...opt, codec: val("--codec") || "dnxhr_hq" }));
    if (cmd === "frames") return exec(frames({ ...opt, pattern: val("--pattern"), audio: val("--audio") }));
    if (cmd === "vertical916") return exec(vertical916(opt));
    if (cmd === "loudnorm") {
      const r = exec(loudnormMeasure(opt), { capture: true });
      if (!runIt) { console.log("# вторият проход идва след първия: стойностите се четат от изхода му"); return; }
      const measured = parseLoudnorm(r.stderr);
      if (!measured) { console.error("loudnorm не върна измерване"); process.exit(1); }
      return exec(loudnormApply({ ...opt, measured }));
    }
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(2); }
  console.error("команди: youtube4k60 · master · loudnorm · frames · vertical916 (виж началото на файла)");
  process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) cli(process.argv.slice(2));

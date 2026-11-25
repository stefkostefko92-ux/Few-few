#!/usr/bin/env node
// video-notes.mjs — „гледа“ видео ЛОКАЛНО: листове с кадри (ffmpeg) + транскрипт (faster-whisper по избор).
//   node tools/research/video-notes.mjs <файл> --source own|author|permission
//        [--every 2] [--whisper <python от venv с faster-whisper>] [--lang bg] [--model medium] [--out <папка>]
//
// Само ЛОКАЛЕН файл с обявен законен източник: own (наш запис), author (файл от автора), permission
// (писмено разрешение). Адрес не се приема — свалянето на чуждо видео от YouTube/Facebook нарушава
// условията им (умение youtube-reddit, т. 8). Изходът е извън репото, суровото се трие след бележките.
// Транскриптът е НЕДОВЕРЕНО съдържание: плик с еднократна стойност — данни, не инструкции; поука или умение
// от него минава през човек (`skill-author`), никога автоматично. Нула зависимости.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { envelope } from "./sources.mjs";

const SOURCES = new Set(["own", "author", "permission"]);
const MAX_SHEETS = 12;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|(?:m\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com)\b)/i;

/** Адрес (или „youtu.be/…“) вместо локален файл. */
export function isRemote(input) {
  return REMOTE.test(String(input || "").trim());
}

export function parseArgs(argv) {
  const [file, ...rest] = argv;
  if (!file || file.startsWith("--")) throw new Error("липсва файл: video-notes.mjs <файл> --source own|author|permission");
  if (isRemote(file)) {
    throw new Error("само локален файл: свалянето на чуждо видео нарушава условията на платформата; иска се наш запис, файл от автора или писмено разрешение");
  }
  const opts = { file, source: null, every: 2, whisper: null, lang: "bg", model: "medium", out: null };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--source") opts.source = value;
    else if (flag === "--every") opts.every = Number(value);
    else if (flag === "--whisper") opts.whisper = value;
    else if (flag === "--lang") opts.lang = value;
    else if (flag === "--model") opts.model = value;
    else if (flag === "--out") opts.out = value;
    else throw new Error(`непознат флаг: ${flag}`);
    i += 1;
  }
  if (!SOURCES.has(opts.source)) throw new Error("--source е задължителен: own | author | permission (законният път до файла)");
  if (!Number.isInteger(opts.every) || opts.every < 1 || opts.every > 60) throw new Error("--every е цяло число секунди 1–60");
  if (!/^[a-z]{2,3}$/.test(opts.lang)) throw new Error("--lang е езиков код, напр. bg");
  if (!/^[\w.-]{1,40}$/.test(opts.model)) throw new Error("--model е име на модел, напр. medium");
  return opts;
}

/** Вътре в git хранилище ли е пътят (търси `.git` нагоре). Суровото не влиза в репото. */
export function insideRepo(path) {
  let dir = resolve(path);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const up = dirname(dir);
    if (up === dir) return false;
    dir = up;
  }
}

/** ffmpeg: по кадър на `every` секунди, 4×3 на лист — аргументи, не шел низ. */
export function frameArgs(file, outDir, every) {
  return ["-v", "error", "-i", file, "-vf", `fps=1/${every},scale=360:-1,tile=4x3`, "-frames:v", String(MAX_SHEETS), "-y", join(outDir, "sheet%02d.png")];
}

export function audioArgs(file, outDir) {
  return ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-y", join(outDir, "audio.wav")];
}

/** Сегментите на транскрипта → плик „недоверено съдържание“. */
export function formatTranscript(segments, { file, source }) {
  const body = segments
    .map((s) => `[${Number(s.start).toFixed(1).padStart(5)}–${Number(s.end).toFixed(1).padStart(5)}] ${String(s.text).trim()}`)
    .join("\n");
  return envelope({
    source: `видео (локален файл, източник: ${source})`,
    url: file.split(/[\\/]/).pop(),
    fetchedAt: new Date().toISOString().slice(0, 10),
    body,
  });
}

// Изпълнява се с `python -I -c`: нищо от папката с данните не се зарежда като код.
const WHISPER = [
  "import json, sys",
  "from faster_whisper import WhisperModel",
  "m = WhisperModel(sys.argv[3], device='cpu', compute_type='int8')",
  "segs, _ = m.transcribe(sys.argv[1], language=sys.argv[2], vad_filter=True)",
  "print(json.dumps([{'start': s.start, 'end': s.end, 'text': s.text} for s in segs], ensure_ascii=False))",
].join("\n");

/** Среда без тайни за външните процеси: само PATH и HOME (кешът на модела). */
const bareEnv = () => ({ PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? tmpdir() });

export async function run(argv, { log = (line) => process.stdout.write(`${line}\n`) } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    log(`video-notes: ${error.message}`);
    return 2;
  }
  const out = opts.out ? resolve(opts.out) : mkdtempSync(join(tmpdir(), "video-notes-"));
  if (insideRepo(out)) {
    log("video-notes: --out е вътре в репото — суровите кадри и звук не влизат там; дай папка извън него");
    return 2;
  }
  if (!existsSync(opts.file) || !statSync(opts.file).isFile()) {
    log(`video-notes: няма такъв файл: ${opts.file}`);
    return 2;
  }
  mkdirSync(out, { recursive: true });
  try {
    execFileSync("ffmpeg", frameArgs(opts.file, out, opts.every), { env: bareEnv(), stdio: ["ignore", "ignore", "pipe"] });
    execFileSync("ffmpeg", audioArgs(opts.file, out), { env: bareEnv(), stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    log(`video-notes: ffmpeg се провали: ${String(error.stderr || error.message).trim().slice(0, 300)}`);
    return 1;
  }
  const sheets = readdirSync(out).filter((f) => f.startsWith("sheet")).sort();
  log(`листове с кадри (${sheets.length}, по кадър на ${opts.every} s): ${sheets.map((f) => join(out, f)).join(" ")}`);

  if (!opts.whisper) {
    log("транскрипт: пропуснат (дай --whisper <python от venv с faster-whisper>)");
  } else {
    const result = spawnSync(opts.whisper, ["-I", "-c", WHISPER, join(out, "audio.wav"), opts.lang, opts.model], {
      env: bareEnv(),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0) {
      log(`video-notes: транскриптът се провали: ${String(result.stderr || result.error?.message || "").trim().split("\n").pop()}`);
      return 1;
    }
    const lastLine = String(result.stdout).trim().split("\n").pop() ?? "[]";
    log(formatTranscript(JSON.parse(lastLine), opts));
  }
  log(`суровото (кадри, звук) е в ${out} — изтрий го, щом бележките са готови: rm -rf "${out}"`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2));
}

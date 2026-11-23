// presets.test.mjs — командите за FFmpeg са масиви за spawn (без shell) и следват препоръките на YouTube.
import { test } from "node:test";
import assert from "node:assert/strict";
import { youtube4k60, master, loudnormMeasure, loudnormApply, parseLoudnorm, frames, vertical916, display } from "./presets.mjs";

const pair = (args, k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

test("youtube4k60: H.264 High през NVENC, 2 B-кадъра, затворен GOP = половината кадри, 4:2:0, BT.709, AAC 384k/48k, fast start", () => {
  const a = youtube4k60({ input: "out/master.mov", output: "out/youtube.mp4" });
  assert.ok(Array.isArray(a) && a.every((x) => typeof x === "string"), "масив от низове");
  assert.equal(pair(a, "-c:v"), "h264_nvenc");
  assert.equal(pair(a, "-profile:v"), "high");
  assert.equal(pair(a, "-bf"), "2");
  assert.equal(pair(a, "-g"), "30");
  assert.equal(pair(a, "-flags"), "+cgop");
  assert.equal(pair(a, "-pix_fmt"), "yuv420p");
  assert.equal(pair(a, "-colorspace"), "bt709");
  assert.equal(pair(a, "-r"), "60");
  assert.equal(pair(a, "-c:a"), "aac");
  assert.equal(pair(a, "-b:a"), "384k");
  assert.equal(pair(a, "-ar"), "48000");
  assert.equal(pair(a, "-movflags"), "+faststart");
  const mbps = parseInt(pair(a, "-b:v"), 10);
  assert.ok(mbps >= 53 && mbps <= 68, "битрейтът е в препоръката за 4K60 SDR (53–68 Mbps)");
  assert.ok(a.includes("-n") && !a.includes("-y"), "по подразбиране не презаписва");
  assert.equal(a.at(-1), "out/youtube.mp4");
});

test("youtube4k60: резервен libx264 без NVENC, 30 fps дава GOP 15, --force презаписва", () => {
  const a = youtube4k60({ input: "a.mov", output: "b.mp4", encoder: "libx264", fps: 30, force: true });
  assert.equal(pair(a, "-c:v"), "libx264");
  assert.equal(pair(a, "-g"), "15");
  assert.equal(pair(a, "-r"), "30");
  assert.ok(a.includes("-y") && !a.includes("-n"));
  assert.equal(pair(a, "-preset"), "slow", "x264 не разбира NVENC пресетите p1–p7");
});

test("master: DNxHR HQ (8-бита, чете се от безплатния Resolve) или ProRes 422 HQ, звук PCM 24-bit", () => {
  const d = master({ input: "frames.mp4", output: "out/master.mov" });
  assert.equal(pair(d, "-c:v"), "dnxhd");
  assert.equal(pair(d, "-profile:v"), "dnxhr_hq");
  assert.equal(pair(d, "-pix_fmt"), "yuv422p");
  assert.equal(pair(d, "-c:a"), "pcm_s24le");
  assert.equal(pair(d, "-color_primaries"), "bt709", "мастерът носи цвета, иначе Resolve гадае");
  const p = master({ input: "frames.mp4", output: "out/master.mov", codec: "prores_hq" });
  assert.equal(pair(p, "-c:v"), "prores_ks");
  assert.equal(pair(p, "-profile:v"), "3");
});

test("loudnorm на два прохода: −14 LUFS, −1,5 dBTP; вторият проход ползва измереното", () => {
  const m = loudnormMeasure({ input: "voice.wav" });
  assert.match(pair(m, "-af"), /^loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json$/);
  assert.deepEqual(m.slice(-3), ["-f", "null", "-"]);
  const stderr = `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-23.54",\n\t"input_tp" : "-7.85",\n\t"input_lra" : "5.20",\n\t"input_thresh" : "-33.96",\n\t"output_i" : "-14.02",\n\t"target_offset" : "0.02"\n}\n`;
  const meas = parseLoudnorm(stderr);
  assert.deepEqual(meas, { input_i: "-23.54", input_tp: "-7.85", input_lra: "5.20", input_thresh: "-33.96", target_offset: "0.02" });
  const a = loudnormApply({ input: "voice.wav", output: "audio/voice-14.wav", measured: meas });
  assert.equal(pair(a, "-af"), "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=-23.54:measured_TP=-7.85:measured_LRA=5.20:measured_thresh=-33.96:offset=0.02:linear=true");
  assert.equal(pair(a, "-ar"), "48000");
  assert.equal(parseLoudnorm("няма json тук"), null);
  assert.throws(() => loudnormApply({ input: "a.wav", output: "b.wav", measured: { ...meas, input_i: "-23; rm -rf /" } }), /измерено/);
});

test("frames: PNG поредица → видео с точния брой кадри в секунда и звук по избор", () => {
  const a = frames({ pattern: "out/frames/%05d.png", output: "out/scene.mp4", audio: "audio/mix.wav" });
  assert.equal(pair(a, "-framerate"), "60");
  assert.deepEqual(a.filter((x, i) => a[i - 1] === "-i"), ["out/frames/%05d.png", "audio/mix.wav"]);
  assert.equal(pair(a, "-c:v"), "h264_nvenc");
  assert.ok(a.includes("-shortest"));
});

test("vertical916: 1080×1920 за Социалджията", () => {
  const a = vertical916({ input: "out/youtube.mp4", output: "out/short.mp4" });
  assert.match(pair(a, "-vf"), /crop=ih\*9\/16:ih.*scale=1080:1920/);
  assert.equal(pair(a, "-r"), "30", "числата на Социалджията: 30 fps");
  assert.equal(pair(a, "-b:v"), "12M");
});

test("защити (ревю на Кодаджията 23.11): същият файл под друг низ, URL протокол, Windows път, GOP при 25 fps", () => {
  assert.throws(() => youtube4k60({ input: "b.mov", output: "./b.mov", force: true }), /различ/, "./b.mov е същият файл");
  assert.throws(() => frames({ pattern: "f/%05d.png", output: "mix.wav", audio: "./mix.wav" }), /различ/);
  assert.throws(() => loudnormApply({ input: "a.wav", output: "http://x.example/a.wav", measured: { input_i: "-20", input_tp: "-3", input_lra: "5", input_thresh: "-30", target_offset: "0" } }), /път/);
  assert.throws(() => youtube4k60({ input: "concat:a.mov|b.mov", output: "c.mp4" }), /път/);
  assert.ok(youtube4k60({ input: "C:\\clips\\a.mov", output: "C:\\clips\\b.mp4" }).includes("C:\\clips\\a.mov"), "буквата на устройството не е протокол");
  assert.equal(pair(youtube4k60({ input: "a.mov", output: "b.mp4", fps: 25 }), "-g"), "12");
  assert.ok(loudnormMeasure({ input: "a.wav" }).includes("-nostats"), "без ред статистика на всеки 0,5 s");
});

test("защити: опция на мястото на път, еднакъв вход и изход, непознат енкодер и кадри", () => {
  assert.throws(() => youtube4k60({ input: "-f", output: "b.mp4" }), /път/);
  assert.throws(() => youtube4k60({ input: "a.mp4", output: "a.mp4" }), /различ/);
  assert.throws(() => youtube4k60({ input: "a.mov", output: "b.mp4", encoder: "evil" }), /енкодер/);
  assert.throws(() => youtube4k60({ input: "a.mov", output: "b.mp4", fps: 61 }), /кадри/);
  assert.throws(() => master({ input: "a.mov", output: "b.mov", codec: "x" }), /кодек/);
});

test("display: командата за човека е с кавички около пътища с интервали", () => {
  assert.equal(display(["-i", "my clip.mov", "-n", "out.mp4"]), `ffmpeg -i "my clip.mov" -n out.mp4`);
});

// Решение 23.11.2026 (собственикът: „звука реши ти“): −1,5 dBTP навсякъде. TD1008 дава −1 dBTP като таван на входа на
// кодека; платформите прекодират до AAC, а 4× свръхдискретизацията на true-peak метъра греши до ~0,6 dB. Двата
// инструмента бяха разминати (presets −1, clip.sh −1,5) — този тест не им дава да се разминат пак.
test("един TP навсякъде: presets.mjs и tools/social/clip.sh нормализират до един и същ true peak", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const sh = readFileSync(join(root, "tools", "social", "clip.sh"), "utf8");
  const tps = [...sh.matchAll(/loudnorm=I=-14:TP=(-?[\d.]+)/g)].map((m) => m[1]);
  assert.ok(tps.length >= 2, "clip.sh има двата прохода");
  const ours = pair(loudnormMeasure({ input: "x.wav" }), "-af").match(/TP=(-?[\d.]+)/)[1];
  for (const tp of tps) assert.equal(tp, ours, `clip.sh TP=${tp} ≠ presets.mjs TP=${ours}`);
});

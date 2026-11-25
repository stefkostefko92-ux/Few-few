// doctor.test.mjs — разчитането на версиите, енкодерите и филтрите, и присъдата „готово ли е студиото“.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVersion, parseCodecList, parseGpu, newestBlenderDir, assess, REQUIRED_ENCODERS } from "./doctor.mjs";

test("parseVersion: реалните първи редове на всяка програма", () => {
  assert.equal(parseVersion("node", "v22.11.0\n"), "22.11.0");
  assert.equal(parseVersion("ffmpeg", "ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024 the FFmpeg developers\n"), "7.1");
  assert.equal(parseVersion("ffmpeg", "ffmpeg version n7.1.1 Copyright (c) 2000-2025\n"), "7.1.1");
  assert.equal(parseVersion("ffmpeg", "ffmpeg version 2025-11-20-git-abc123-full_build-www.gyan.dev\n"), "2025-11-20-git-abc123");
  assert.equal(parseVersion("blender", "Blender 4.5.0 LTS\n\tbuild date: 2025-07-15\n"), "4.5.0");
  assert.equal(parseVersion("python", "Python 3.13.1\n"), "3.13.1");
  assert.equal(parseVersion("node", ""), null);
});

test("parseCodecList: имената от ffmpeg -encoders и -filters", () => {
  const enc = ` V..... = Video\n ------\n V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n V....D libx264              libx264 H.264 / AVC (codec h264)\n A....D aac                  AAC (Advanced Audio Coding)\n`;
  assert.deepEqual([...parseCodecList(enc)].sort(), ["aac", "h264_nvenc", "libx264"]);
  const flt = ` T.. = Timeline support\n ------\n ... loudnorm          A->A       EBU R128 loudness normalization\n TSC scale             V->V       Scale the input video size\n`;
  assert.deepEqual([...parseCodecList(flt)].sort(), ["loudnorm", "scale"]);
});

test("parseGpu: nvidia-smi в CSV", () => {
  assert.deepEqual(parseGpu("NVIDIA GeForce RTX 4070, 566.36\n"), { name: "NVIDIA GeForce RTX 4070", driver: "566.36" });
  assert.equal(parseGpu(""), null);
});

test("newestBlenderDir: най-новата папка „Blender X.Y“ по числа, не по азбука", () => {
  assert.equal(newestBlenderDir(["Blender 4.2", "Blender 4.10", "Blender 4.5", "readme.txt"]), "Blender 4.10");
  assert.equal(newestBlenderDir(["readme.txt"]), null);
});

test("assess: задължителните липсват → не е готово, с конкретна стъпка; незадължителните не спират", () => {
  const all = {
    node: { version: "22.11.0" }, npm: { version: "10.9.0" },
    ffmpeg: { version: "7.1", encoders: new Set(REQUIRED_ENCODERS), filters: new Set(["loudnorm"]) }, ffprobe: { version: "7.1" },
    python: { version: "3.13.1" }, blender: { version: "4.5.0" }, gpu: { name: "RTX", driver: "566" },
    audacity: { path: "C:/Program Files/Audacity/Audacity.exe" }, resolve: { path: "C:/x/Resolve.exe" },
  };
  const ok = assess(all);
  assert.equal(ok.ready, true);
  assert.ok(ok.rows.every((r) => r.ok));

  const noNvenc = assess({ ...all, ffmpeg: { ...all.ffmpeg, encoders: new Set(["libx264", "aac", "prores_ks", "dnxhd"]) }, gpu: null, audacity: null, resolve: null });
  assert.equal(noNvenc.ready, false, "без NVENC няма 4K60 за разумно време");
  const row = noNvenc.rows.find((r) => r.id === "ffmpeg");
  assert.match(row.hint, /h264_nvenc/);
  assert.equal(noNvenc.rows.find((r) => r.id === "audacity").required, false);

  assert.equal(assess({ ...all, python: { version: "2.7.18" } }).ready, false, "Python 2 не е Python 3");
  const oldNode = assess({ ...all, node: { version: "18.20.0" } });
  assert.equal(oldNode.ready, false, "нашите инструменти искат Node ≥ 20");
  assert.equal(assess({ ...all, node: null }).rows.find((r) => r.id === "node").hint.includes("winget"), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENE_FS, COMPOSITE_FS, VS } from "../src/shaders.js";
import { GLSL_NOISE } from "../src/glsl-noise.js";
import { GLSL_GALAXY } from "../src/glsl-galaxy.js";

test("hash() в GLSL_NOISE няма тригонометрия (собственикова бележка — sin() бандира на ANGLE/SwiftShader)", () => {
  const hashFn = GLSL_NOISE.match(/float hash\(vec2 p\)\{[^}]*\}/)[0];
  assert.doesNotMatch(hashFn, /\bsin\(/, "hash() трябва да остане fract/dot верига, без sin()");
});

test("SCENE_FS декларира MRT (два color attachment-а)", () => {
  assert.match(SCENE_FS, /layout\(location=0\) out vec4 outScene/);
  assert.match(SCENE_FS, /layout\(location=1\) out vec4 outBright/);
});

test("SCENE_FS носи domain-warp мъглявинно поле (fbm+ridge, не плосък цвят)", () => {
  assert.match(SCENE_FS, /nebCol/);
  assert.match(SCENE_FS, /ridge\(/);
  assert.match(SCENE_FS, /fbm\(/);
});

test("SCENE_FS чете история за TAA-подобно натрупване", () => {
  assert.match(SCENE_FS, /uniform sampler2D uHistory/);
  assert.match(SCENE_FS, /uHistoryMix/);
});

test("GLSL_GALAXY носи диафракционни лъчи само за ярките звезди (праг, не за всички)", () => {
  assert.match(GLSL_GALAXY, /spikeGlow/);
  assert.match(GLSL_GALAXY, /smoothstep\(brightThresh, 1\.0, bMag\)/);
});

test("COMPOSITE_FS прави ACES tonemap + хроматична аберация + зърно", () => {
  assert.match(COMPOSITE_FS, /aces\(/);
  assert.match(COMPOSITE_FS, /uBloom0/);
  assert.match(COMPOSITE_FS, /hash13/);
});

test("нито един GLSL низ не съдържа TODO/FIXME/console", () => {
  for (const src of [VS, SCENE_FS, COMPOSITE_FS, GLSL_NOISE, GLSL_GALAXY]) {
    assert.doesNotMatch(src, /TODO|FIXME/);
    assert.doesNotMatch(src, /console\./);
  }
});

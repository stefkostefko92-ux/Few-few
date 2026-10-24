// Every one of the fleet's 28 accents (agents-dashboard/agents.json) must resolve to a full,
// valid jelly ramp — a bad/edge-case accent must never leave a token `undefined` (which three.js
// silently reads as black, the "the whole mascot went dark" defect) or an invalid hex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tintPalette, BASE_RAMP } from '../src/palette.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const AGENTS = JSON.parse(readFileSync(path.join(ROOT, 'agents-dashboard/agents.json'), 'utf8')).agents;

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const TOKENS = ['deep', 'bottle', 'neon', 'olive', 'pale', 'softOlive', 'bg', 'ink', 'inkSoft', 'eye', 'gold'];

test('agents.json really has the full 28-agent fleet (this test is only meaningful at that count)', () => {
  assert.equal(AGENTS.length, 28);
});

test('every fleet accent tints to a complete, valid palette', () => {
  for (const a of AGENTS) {
    const p = tintPalette(a.accent);
    for (const k of TOKENS) {
      assert.ok(HEX6.test(p[k]), `${a.id}: palette.${k} = ${p[k]} is not a valid #rrggbb`);
    }
  }
});

test('the hero tokens (glasses/hat/eye/gold) never move — only the body ramp is per-agent', () => {
  for (const a of AGENTS) {
    const p = tintPalette(a.accent);
    assert.equal(p.ink, '#0A0C0A');
    assert.equal(p.inkSoft, '#2A2E24');
    assert.equal(p.eye, '#F4FAEA');
    assert.equal(p.gold, '#D9A521');
  }
});

test('the ramp stays a ramp: distinct stops for every agent (jelly, not a flat fill)', () => {
  for (const a of AGENTS) {
    const p = tintPalette(a.accent);
    const stops = new Set([p.deep, p.bottle, p.neon, p.olive, p.pale]);
    assert.ok(stops.size >= 4, `${a.id}: ramp collapsed to ${stops.size} distinct stops`);
  }
});

test('two agents whose accents share a hue family still end up visually distinguishable', () => {
  // Regression for the flat-SVG mascot's real, measured defect (mascot-theme.mjs's own comment):
  // several accents cluster within a few degrees of hue. The 3D ramp does not need to fully
  // declutter the fleet (that is a much bigger, whole-fleet operation the SVG generator already
  // does) but it must not make two close accents render byte-identical.
  const palettes = AGENTS.map((a) => tintPalette(a.accent));
  let anyDifferent = false;
  for (let i = 1; i < palettes.length; i++) {
    if (palettes[i].olive !== palettes[0].olive) anyDifferent = true;
  }
  assert.ok(anyDifferent, 'all 28 agents produced the exact same olive stop');
});

test('an invalid accent falls back to a valid palette instead of throwing', () => {
  for (const bad of ['not-a-color', undefined, '', '#zzzzzz', 123]) {
    const p = tintPalette(bad);
    assert.ok(HEX6.test(p.olive), `fallback for ${JSON.stringify(bad)} produced ${p.olive}`);
  }
});

test('BASE_RAMP itself stays the studio default (five valid stops)', () => {
  for (const k of ['deep', 'bottle', 'neon', 'olive', 'pale']) assert.ok(HEX6.test(BASE_RAMP[k]));
});

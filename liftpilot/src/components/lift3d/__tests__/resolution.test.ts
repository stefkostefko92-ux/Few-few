// The stage's resolution: while moving, the screen's own up to the tier's cap times the governor's scale; a still
// picture sharper (supersampled on a screen of 1 device pixel per CSS pixel); never more pixels than the caps allow at
// full screen, never under half a pixel per CSS pixel.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY, initialQuality } from '../../machine/quality';
import { MOTION_PIXELS, STILL_PIXELS, motionRatio, stillRatio } from '../resolution';

test('risoluzione in movimento: quella dello schermo fino al tetto del livello, per la scala del governatore', () => {
  assert.equal(motionRatio(QUALITY.ultra, 1, 900, 560, 2), 2);
  assert.equal(motionRatio(QUALITY.ultra, 0.7, 900, 560, 2), 1.4);
  assert.equal(motionRatio(QUALITY.high, 1, 900, 560, 2), 1.5);
  assert.equal(motionRatio(QUALITY.ultra, 1, 900, 560, 1), 1);
  // never under half a pixel, whatever the scale
  assert.equal(motionRatio(QUALITY.low, 0.2, 900, 560, 1), 0.5);
  // full screen on a large display: bounded in pixels
  const r = motionRatio(QUALITY.ultra, 1, 2560, 1440, 2);
  assert.ok(Math.abs(2560 * 1440 * r * r - MOTION_PIXELS) < 1, `${r}`);
});

test('immagine ferma: più nitida, sovracampionata sugli schermi a 1 pixel, entro i pixel del 4K', () => {
  assert.equal(stillRatio(QUALITY.ultra, 900, 560), 2);
  assert.equal(stillRatio(QUALITY.low, 390, 700), 1.5);
  const r = stillRatio(QUALITY.ultra, 2560, 1440);
  assert.ok(Math.abs(2560 * 1440 * r * r - STILL_PIXELS) < 1, `${r}`);
  assert.ok(stillRatio(QUALITY.ultra, 1920, 1080) >= motionRatio(QUALITY.ultra, 1, 1920, 1080, 1));
});

test('livello iniziale: telefono leggero, schermo grande alto, con WebGPU sul hardware il più alto', () => {
  assert.equal(initialQuality(true, 1200, true), QUALITY.low);
  assert.equal(initialQuality(false, 600, true), QUALITY.low);
  assert.equal(initialQuality(false, 1080, false), QUALITY.high);
  assert.equal(initialQuality(false, 1080, true), QUALITY.ultra);
});

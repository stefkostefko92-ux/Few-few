import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AXES, seedPoint, shrinkOf, wrinkleOf } from '../client/seed-shape.js';
import { STRAINS, strainOf } from '../client/strains.js';
import { fbm3, wrapFbm } from '../client/noise.js';
import { SEED_KEYS } from '../src/domain/seeds.js';

const fresh = { decay: 0, dead: false, variant: 1 };

test('свежото семе: дължина ~2, по-тънко отколкото широко, по-остро към върха', () => {
  const tip = seedPoint(1, 0, 0, fresh);
  const back = seedPoint(-1, 0, 0, fresh);
  // върхът е точно на 1; отзад шевът (ръбът по контура) издава малко навън
  assert.ok(Math.abs(tip[0] - 1) < 1e-9);
  assert.ok(back[0] <= -1 && back[0] > -1.06);
  const top = seedPoint(0, 1, 0, fresh)[1];
  const side = seedPoint(0, 0, 1, fresh)[2];
  assert.ok(Math.abs(top - DEFAULT_AXES.y) < 1e-9);
  assert.ok(side > top, 'сплеснато: по-широко, отколкото дебело');
  // на същото разстояние от средата върхът е по-тесен от задната част
  const nearTip = seedPoint(0.7, 0, 0.714, fresh)[2];
  const nearBack = seedPoint(-0.7, 0, 0.714, fresh)[2];
  assert.ok(nearTip < nearBack);
});

test('развалянето свива, сплесква и набръчква; изтеклото — най-много', () => {
  assert.equal(wrinkleOf(fresh), 0);
  assert.ok(shrinkOf({ ...fresh, decay: 0.9 }) < shrinkOf(fresh));
  assert.ok(wrinkleOf({ ...fresh, decay: 0.95 }) > wrinkleOf({ ...fresh, decay: 0.6 }));
  assert.ok(wrinkleOf({ decay: 1, dead: true, variant: 1 }) > wrinkleOf({ ...fresh, decay: 1 }));
  const rotten = seedPoint(0, 1, 0, { ...fresh, decay: 0.95 })[1];
  assert.ok(rotten < DEFAULT_AXES.y, 'по-ниско (сплескано)');
  // същото зрънце — същата форма
  assert.deepEqual(
    seedPoint(0.3, 0.4, 0.5, { ...fresh, decay: 0.9 }),
    seedPoint(0.3, 0.4, 0.5, { ...fresh, decay: 0.9 }),
  );
});

test('видовете: всеки има свой облик, а формата следва осите му', () => {
  for (const k of SEED_KEYS) assert.ok(STRAINS[k], k);
  const looks = new Set(
    SEED_KEYS.map((k) => JSON.stringify([strainOf(k).light, strainOf(k).axes])),
  );
  assert.equal(looks.size, SEED_KEYS.length, 'два вида изглеждат еднакво');
  const og = strainOf('ogkush').axes;
  const am = strainOf('amnesia').axes;
  assert.ok(og.z > am.z, 'OG Kush е по-закръглено от Amnesia');
  assert.equal(strainOf('няма-такъв'), STRAINS.amnesia);
  const w = seedPoint(0, 0, 1, { ...fresh, axes: og })[2];
  assert.ok(w > seedPoint(0, 0, 1, { ...fresh, axes: am })[2]);
});

test('шумът: в [0, 1], детерминистичен, безшевен около оста', () => {
  for (let i = 0; i < 50; i++) {
    const v = fbm3(i * 0.37, i * 0.11, i * 0.53, 7);
    assert.ok(v >= 0 && v <= 1);
  }
  assert.equal(fbm3(1.2, 3.4, 5.6, 9), fbm3(1.2, 3.4, 5.6, 9));
  assert.ok(Math.abs(wrapFbm(0, 0.4, 3, 2, 5) - wrapFbm(1, 0.4, 3, 2, 5)) < 1e-9);
});

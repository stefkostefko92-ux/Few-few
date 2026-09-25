// Installed assemblies and the studio stage: every catalogue pairing builds, moves over its whole
// adjustment range, and whatever is staged (part or assembly, either hand) stands centred on the
// floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { CATALOG } from '../src/catalog.js';
import { assemblyFor, partnerOf } from '../src/render/assembly.js';
import { stage } from '../src/render/stage.js';

const M = { part: [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()], hw: new THREE.MeshStandardMaterial(), rail: new THREE.MeshStandardMaterial() };
const paired = CATALOG.filter((i) => partnerOf(i));
const count = (group, test) => {
  let n = 0;
  group.traverse((o) => {
    if (o.isMesh && test(o)) n++;
  });
  return n;
};

test('the catalogue pairings cover the door brackets and the guide supports', () => {
  assert.equal(paired.length, 36);
  for (const item of paired) {
    const p = partnerOf(item);
    assert.ok(CATALOG.includes(p), `${item.code}: partner ${p.code} is a catalogue item`);
    if (item.family === 'door') assert.notEqual(item.code[0], p.code[0], `${item.code} pairs an A with a B`);
    else assert.ok((item.family === 'SG') !== (p.family === 'SG'), `${item.code} pairs a support with a guide bracket`);
  }
  for (const code of ['SG 50 130', 'SG 225 50', 'SN 60 65', 'BRACCIO 160 190']) assert.equal(partnerOf(CATALOG.find((i) => i.code === code)), null);
});

for (const item of paired) {
  test(`${item.code} + ${partnerOf(item).code}: two parts with their hardware over the whole range`, () => {
    const a = assemblyFor(item, M);
    const [lo, hi] = a.range;
    assert.ok(lo < hi && a.value >= lo && a.value <= hi);
    for (let k = 0; k <= 8; k++) {
      a.set(lo + ((hi - lo) * k) / 8);
      assert.equal(count(a.group, (o) => o.material === M.part), 2);
      assert.ok(count(a.group, (o) => o.material === M.hw) >= 8, 'two bolts with washers and nuts at least');
      const size = new THREE.Box3().setFromObject(a.group).getSize(new THREE.Vector3());
      assert.ok(size.x > 50 && size.x < 400 && size.y > 200 && size.y < 400 && size.z > 90 && size.z < 300, `${size.toArray()}`);
    }
  });
}

test('whatever is staged stands centred on the floor, in either hand', () => {
  for (const item of CATALOG) {
    for (const hand of ['DX', 'SX']) {
      for (const mode of partnerOf(item) ? ['part', 'assembly'] : ['part']) {
        const s = stage(item, hand, mode, M);
        assert.equal(Boolean(s.asm), mode === 'assembly');
        const c = s.box.getCenter(new THREE.Vector3());
        assert.ok(Math.abs(s.box.min.y) < 1e-9 && Math.abs(c.x) < 1e-9 && Math.abs(c.z) < 1e-9, `${item.code} ${hand} ${mode}`);
        assert.equal(Math.sign(s.object.scale.x), mode === 'assembly' && s.view.mirror === (hand === 'DX') ? -1 : 1);
      }
    }
  }
});

test('guide assemblies slide over the range printed on their catalogue page', () => {
  for (const [code, range] of [['SU 220 160', [45, 155]], ['SU 220 200', [45, 215]], ['SD 220 160', [50, 155]], ['SC 60 200', [45, 213]], ['SC 80 220', [45, 255]]]) {
    const a = assemblyFor(CATALOG.find((i) => i.code === code), M);
    assert.deepEqual(a.range, range, code);
  }
});

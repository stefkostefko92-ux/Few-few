// Converts the CMU swordplay captures (subject 02, takes 07-09, BVH conversion by B. Hahne) into
// the knights' motion-captured body layer: per frame (30 fps) the pelvis sway, torso twist, lean
// and roll, head motion, hip bob and weight shift, each as motion around a slow baseline, plus an
// activity signal (hand and torso speed) used to align the capture with the choreography.
// CMU terms: "free for use in research and commercial projects worldwide".
// Usage: node bake/mocap.mjs  (fetches the pinned BVH files, writes data/mocap/cmu-swordplay.json)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';

const COMMIT = '09a07f54f3bbb58797325f009282d0b2048a2871';
const SOURCE = `https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/${COMMIT}/data/002/`;
const TAKES = ['02_07', '02_08', '02_09'];
const FPS = 30;
const HIP_HEIGHT = 0.935;
// Baselines: body angles keep motion faster than ~1.2 s, the weight shift keeps its slow drift.
const SIGMA_BODY = 1.2 * FPS;
const SIGMA_FACING = 0.8 * FPS;
const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, '..', 'dist', 'mocap-cache');
const outFile = join(here, '..', 'data', 'mocap', 'cmu-swordplay.json');

async function bvh(take) {
  const cached = join(cacheDir, `${take}.bvh`);
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const res = await fetch(`${SOURCE}${take}.bvh`);
  if (!res.ok) throw new Error(`${take}: HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, text);
  return text;
}

const r4 = (v) => Math.round(v * 10000) / 10000;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function gaussian(xs, sigma) {
  const r = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-(((k - r) / sigma) ** 2) / 2));
  return xs.map((_, i) => {
    let s = 0;
    let t = 0;
    for (let k = -r; k <= r; k++) {
      const j = Math.min(xs.length - 1, Math.max(0, i + k));
      s += xs[j] * w[k + r];
      t += w[k + r];
    }
    return s / t;
  });
}

const unwrap = (xs) => xs.reduce((out, x, i) => (out.push(i ? out[i - 1] + wrap(x - xs[i - 1]) : x), out), []);
const highPass = (xs, sigma) => {
  const low = gaussian(xs, sigma);
  return xs.map((x, i) => x - low[i]);
};
const centred = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.map((x) => x - m);
};

function sampleTake(text) {
  const { skeleton, clip } = new BVHLoader().parse(text);
  const bones = Object.fromEntries(skeleton.bones.map((b) => [b.name, b]));
  const holder = new THREE.Object3D();
  holder.add(skeleton.bones[0]);
  const mixer = new THREE.AnimationMixer(skeleton.bones[0]);
  mixer.clipAction(clip).play();
  const frames = [];
  // Frame 0 of this release is a T-pose; the take starts one sample later.
  for (let t = 2 / 120; t <= clip.duration; t += 1 / FPS) {
    mixer.setTime(t);
    holder.updateMatrixWorld(true);
    const wp = (n) => bones[n].getWorldPosition(new THREE.Vector3());
    const wq = (n) => bones[n].getWorldQuaternion(new THREE.Quaternion());
    frames.push({ hips: wp('Hips'), qHips: wq('Hips'), qChest: wq('Spine1'), qHead: wq('Head'), rh: wp('RightHand'), lf: wp('LeftFoot'), rf: wp('RightFoot') });
  }
  return frames;
}

// Euler angles in the rig's order: yaw about Y, then pitch about X, then roll about Z.
const euler = new THREE.Euler();
const angles = (q) => {
  euler.setFromQuaternion(q, 'YXZ');
  return [euler.y, euler.x, euler.z];
};

function convert(frames) {
  const scale = HIP_HEIGHT / frames[0].hips.y;
  const fwd = new THREE.Vector3();
  const facing = gaussian(unwrap(frames.map((f) => Math.atan2(fwd.set(0, 0, 1).applyQuaternion(f.qHips).x, fwd.z))), SIGMA_FACING);
  const ch = { pelvisYaw: [], pelvisPitch: [], pelvisRoll: [], twist: [], lean: [], side: [], headYaw: [], headPitch: [], headRoll: [], hipY: [], shiftX: [], shiftZ: [], act: [] };
  const qF = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  frames.forEach((f, i) => {
    qF.setFromAxisAngle(up, facing[i]);
    const [py, pp, pr] = angles(q.copy(qF).invert().multiply(f.qHips));
    ch.pelvisYaw.push(py);
    ch.pelvisPitch.push(pp);
    ch.pelvisRoll.push(pr);
    const [ty, tp, tr] = angles(q.copy(f.qHips).invert().multiply(f.qChest));
    ch.twist.push(ty);
    ch.lean.push(tp);
    ch.side.push(tr);
    const [hy, hp, hr] = angles(q.copy(f.qChest).invert().multiply(f.qHead));
    ch.headYaw.push(hy);
    ch.headPitch.push(hp);
    ch.headRoll.push(hr);
    ch.hipY.push(f.hips.y * scale);
    // Pelvis over the feet, in the facing frame (x right, z forward), in metres.
    const shift = new THREE.Vector3().addVectors(f.lf, f.rf).multiplyScalar(-0.5).add(f.hips).setY(0).applyAxisAngle(up, -facing[i]).multiplyScalar(scale);
    ch.shiftX.push(-shift.x);
    ch.shiftZ.push(shift.z);
    const prev = frames[Math.max(0, i - 1)];
    const hand = f.rh.distanceTo(prev.rh) * scale * FPS;
    const turn = Math.abs(wrap(angles(f.qChest)[0] - angles(prev.qChest)[0])) * FPS;
    ch.act.push(hand + 0.35 * turn);
  });
  for (const k of ['pelvisPitch', 'pelvisRoll', 'twist', 'lean', 'side', 'headYaw', 'headPitch', 'headRoll', 'hipY']) ch[k] = highPass(ch[k], SIGMA_BODY);
  ch.pelvisYaw = centred(ch.pelvisYaw);
  ch.shiftX = centred(gaussian(ch.shiftX, 0.25 * FPS));
  ch.shiftZ = centred(gaussian(ch.shiftZ, 0.25 * FPS));
  ch.act = gaussian(ch.act, 0.1 * FPS);
  return { frames: frames.length, ch: Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.map(r4)])) };
}

async function main() {
  const takes = {};
  for (const take of TAKES) {
    takes[take] = convert(sampleTake(await bvh(take)));
    process.stdout.write(`  ${take}: ${takes[take].frames} frames at ${FPS} fps\n`);
  }
  mkdirSync(dirname(outFile), { recursive: true });
  const doc = {
    source: 'CMU Graphics Lab Motion Capture Database, subject 02 (swordplay), BVH conversion by Bruce Hahne',
    url: SOURCE,
    terms: 'CMU: free for use in research and commercial projects worldwide. Acknowledgement: The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.',
    fps: FPS,
    channels: 'radians (angles), metres (hipY, shiftX, shiftZ), activity in m/s-equivalent',
    takes,
  };
  writeFileSync(outFile, `${JSON.stringify(doc)}\n`);
  process.stdout.write(`✓ mocap: ${outFile}\n`);
}

main().catch((err) => {
  process.stderr.write(`mocap failed: ${err?.stack ?? err}\n`);
  process.exit(1);
});

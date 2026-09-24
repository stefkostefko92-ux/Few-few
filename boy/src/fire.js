// Braziers, wall torches and the burning outer bailey. Every flame, ember and smoke plume is an
// instance of one shared draw, and the flame turbulence reads a noise texture instead of
// computing fractal noise per pixel.
import * as THREE from 'three';
import { BRAZIERS, FLAME_Y, GATE_FIRE } from './config.js';
import { lathe, ring, xf, merge, mesh, flatten } from './geo.js';

const shared = {
  uTime: { value: 0 },
  uPxScale: { value: 600 },
  uWind: { value: new THREE.Vector3(0.6, 0, 0.25) },
  tNoise: { value: null },
};

let seedState = 12345;
const rnd = () => {
  seedState = (seedState * 16807) % 2147483647;
  return seedState / 2147483647;
};

function quadGeometry(centred) {
  const q = new THREE.PlaneGeometry(1, 1);
  if (!centred) q.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = q.index;
  g.setAttribute('position', q.attributes.position);
  g.setAttribute('uv', q.attributes.uv);
  return g;
}

// list: [{ pos, w, h, intensity, seed }]
function flames(list) {
  const g = quadGeometry(false);
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((f) => [f.pos.x, f.pos.y, f.pos.z])), 3));
  g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((f) => [f.w, f.h])), 2));
  g.setAttribute('iParam', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((f) => [f.seed, f.intensity])), 2));
  g.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, tNoise: shared.tNoise },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec2 iSize;
      attribute vec2 iParam;
      varying vec2 vUv;
      varying vec2 vParam;
      void main() {
        vUv = uv;
        vParam = iParam;
        vec3 toCam = cameraPosition - iPos;
        toCam.y = 0.0;
        toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 w = iPos + right * position.x * iSize.x + vec3(0.0, position.y * iSize.y, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying vec2 vParam;
      vec3 fireRamp(float h) {
        vec3 c = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.34, 0.05), smoothstep(0.08, 0.42, h));
        c = mix(c, vec3(1.0, 0.7, 0.26), smoothstep(0.42, 0.72, h));
        return mix(c, vec3(1.0, 0.94, 0.8), smoothstep(0.72, 1.0, h));
      }
      void main() {
        float seed = vParam.x;
        float t = uTime + seed * 17.0;
        float x = (vUv.x - 0.5) * 2.0;
        float y = vUv.y;
        float n1 = texture2D(tNoise, vec2(x * 0.3 + seed * 0.37, y * 0.45 - t * 0.55)).r;
        float n2 = texture2D(tNoise, vec2(x * 0.5 - seed * 0.21, y * 0.75 - t * 0.5)).g;
        float taper = mix(0.95, 0.08, pow(y, 0.75));
        float sway = (n1 - 0.5) * 0.7 * y;
        float edge = abs(x + sway) / max(taper * (0.55 + 0.75 * n2), 1e-3);
        float body = 1.0 - smoothstep(0.3, 1.0, edge);
        body *= smoothstep(0.0, 0.07, y) * (1.0 - smoothstep(0.25 + 0.6 * n1, 1.0, y));
        float heat = clamp(body * (0.35 + 1.1 * n2) * (1.2 - y * 0.85), 0.0, 1.0);
        if (heat < 0.004) discard;
        gl_FragColor = vec4(fireRamp(heat) * heat * vParam.y, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}

// emitters: [{ origin, count, radius, height, size }]
function embers(emitters) {
  const total = emitters.reduce((s, e) => s + e.count, 0);
  const pos = new Float32Array(total * 3);
  const seed = new Float32Array(total * 4);
  const param = new Float32Array(total * 3);
  let i = 0;
  for (const e of emitters) {
    for (let k = 0; k < e.count; k++, i++) {
      pos.set([e.origin.x, e.origin.y, e.origin.z], i * 3);
      seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
      param.set([e.radius, e.height, e.size], i * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aParam', new THREE.BufferAttribute(param, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uPxScale: shared.uPxScale, uWind: shared.uWind },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute vec3 aParam;
      uniform float uTime;
      uniform float uPxScale;
      uniform vec3 uWind;
      varying float vHeat;
      void main() {
        float life = fract(uTime * (0.22 + 0.2 * aSeed.w) + aSeed.z);
        float ang = aSeed.x * 6.2831 + life * 3.0 * (aSeed.y - 0.5);
        float rad = aParam.x * (0.25 + 0.75 * aSeed.y) * (1.0 + life * 1.4);
        vec3 p = position;
        p.x += cos(ang) * rad + sin(uTime * 1.3 + aSeed.x * 20.0) * 0.18 * life + uWind.x * life * 1.6;
        p.z += sin(ang) * rad + cos(uTime * 1.1 + aSeed.y * 20.0) * 0.18 * life + uWind.z * life * 1.6;
        p.y += life * aParam.y * (0.6 + 0.4 * aSeed.w);
        vHeat = (1.0 - life) * (0.55 + 0.45 * sin(uTime * 19.0 + aSeed.x * 50.0));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.0, aParam.z * (0.4 + 0.6 * (1.0 - life)) * uPxScale / max(-mv.z, 0.1));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vHeat;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float k = exp(-dot(c, c) * 16.0);
        gl_FragColor = vec4(vec3(1.0, 0.42, 0.1) * vHeat * k * 3.5, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}

// plumes: [{ origin, phase }]
function smoke(plumes) {
  const g = quadGeometry(true);
  g.setAttribute('iOrigin', new THREE.InstancedBufferAttribute(new Float32Array(plumes.flatMap((p) => [p.origin.x, p.origin.y, p.origin.z])), 3));
  g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(plumes.map((p) => p.phase)), 1));
  g.instanceCount = plumes.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, tNoise: shared.tNoise },
    vertexShader: /* glsl */ `
      attribute vec3 iOrigin;
      attribute float iPhase;
      uniform float uTime;
      uniform vec3 uWind;
      varying vec2 vUv;
      varying float vLife;
      varying float vPhase;
      void main() {
        vUv = uv;
        float life = fract(uTime * 0.09 + iPhase);
        vLife = life;
        vPhase = iPhase;
        vec3 c = iOrigin + vec3(uWind.x * life * 3.0, life * 4.5, uWind.z * life * 3.0);
        float size = 0.7 + life * 2.6;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        gl_Position = projectionMatrix * viewMatrix * vec4(c + (right * position.x + up * position.y) * size, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying float vLife;
      varying float vPhase;
      void main() {
        vec2 q = vUv - 0.5;
        float n = texture2D(tNoise, vUv * 0.5 + vec2(vPhase * 3.7, -uTime * 0.04)).r;
        float a = smoothstep(0.5, 0.05, length(q)) * smoothstep(0.3, 0.75, n) * sin(vLife * 3.14159) * 0.35;
        vec3 col = mix(vec3(0.16, 0.065, 0.025), vec3(0.022, 0.022, 0.028), smoothstep(0.0, 0.35, vLife));
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 4;
  return m;
}

function brazierGeometry() {
  const legs = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    legs.push(xf(new THREE.CylinderGeometry(0.022, 0.028, 1.02, 8), [Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]));
  }
  return merge([
    xf(lathe([[0.05, 0.0], [0.3, 0.07], [0.42, 0.2], [0.45, 0.25]], 28), [0, 0.92, 0]),
    xf(ring(0.45, 0.022, Math.PI * 2, 8, 40), [0, 1.17, 0]),
    xf(ring(0.2, 0.02, Math.PI * 2, 8, 24), [0, 0.3, 0]),
    ...legs,
  ]);
}

export function createFires(M, { shadowBrazier, noise }) {
  shared.tNoise.value = noise;
  const group = new THREE.Group();
  const lights = [];
  const flameList = [];
  const emitters = [];
  const plumes = [];
  const statics = new THREE.Group();
  const addLight = (pos, color, intensity, distance, castShadow) => {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.copy(pos);
    l.castShadow = castShadow;
    l.shadow.mapSize.set(512, 512);
    l.shadow.radius = 4;
    l.shadow.bias = -0.002;
    l.shadow.normalBias = 0.03;
    l.shadow.camera.near = 0.3;
    l.shadow.camera.far = 22;
    group.add(l);
    lights.push({ light: l, base: intensity, seed: lights.length * 1.7, home: pos.clone() });
    return l;
  };
  const bGeo = brazierGeometry();
  const coalGeo = merge([
    xf(new THREE.CircleGeometry(0.4, 24), [0, 1.1, 0], [-Math.PI / 2, 0, 0]),
    ...Array.from({ length: 9 }, (_, k) => xf(new THREE.IcosahedronGeometry(0.06 + (k % 3) * 0.02, 0), [Math.cos(k * 2.4) * 0.22 * ((k % 4) / 4 + 0.3), 1.12, Math.sin(k * 2.4) * 0.22 * ((k % 4) / 4 + 0.3)])),
  ]);
  BRAZIERS.forEach((b, i) => {
    const bowl = mesh(bGeo, M.iron);
    bowl.position.copy(b);
    statics.add(bowl);
    const coals = mesh(coalGeo, M.coal, { cast: false });
    coals.position.copy(b);
    statics.add(coals);
    const fp = new THREE.Vector3(b.x, FLAME_Y - 0.28, b.z);
    flameList.push({ pos: fp, w: 1.0, h: 1.55, intensity: 2.4, seed: i * 1.3 }, { pos: fp, w: 0.55, h: 0.95, intensity: 3.4, seed: i * 1.3 + 0.6 });
    emitters.push({ origin: new THREE.Vector3(b.x, FLAME_Y, b.z), count: 70, radius: 0.22, height: 3.2, size: 0.028 });
    for (let k = 0; k < 4; k++) plumes.push({ origin: new THREE.Vector3(b.x, FLAME_Y + 0.7, b.z), phase: k / 4 + i * 0.13 });
    addLight(new THREE.Vector3(b.x, FLAME_Y + 0.25, b.z), 0xff8a3c, 16, 20, i === shadowBrazier);
  });
  [[-1.5, -21.8], [1.7, -21.2], [0.2, -23.6]].forEach(([x, z], k) => {
    const p = new THREE.Vector3(x, -0.1, z);
    flameList.push({ pos: p, w: 3.0, h: 4.2, intensity: 1.9, seed: 7 + k }, { pos: p, w: 1.5, h: 2.5, intensity: 3.0, seed: 9 + k });
  });
  emitters.push({ origin: new THREE.Vector3(0, 2.0, -21.5), count: 380, radius: 1.6, height: 9, size: 0.05 });
  for (let k = 0; k < 6; k++) plumes.push({ origin: new THREE.Vector3((k - 2.5) * 1.2, 4.2, -22), phase: k / 6 });
  addLight(GATE_FIRE, 0xff7424, 55, 34, false);
  const bracket = merge([
    xf(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), [0, -0.12, 0.2], [Math.PI / 3, 0, 0]),
    xf(lathe([[0.02, -0.12], [0.08, 0.0], [0.1, 0.06]], 12), [0, 0, 0.36]),
  ]);
  [[-15.75, 3.2, -6], [-15.75, 3.2, 6.5], [15.75, 3.2, -6], [15.75, 3.2, 6.5], [-6.5, 3.4, -14.75], [6.5, 3.4, -14.75]].forEach(([x, y, z], k) => {
    const side = Math.abs(x) > 15;
    const inward = new THREE.Vector3(side ? -Math.sign(x) : 0, 0, side ? 0 : 1);
    const b = mesh(bracket, M.iron);
    b.position.set(x, y, z);
    b.lookAt(x + inward.x, y, z + inward.z);
    statics.add(b);
    const fp = new THREE.Vector3(x + inward.x * 0.36, y + 0.02, z + inward.z * 0.36);
    flameList.push({ pos: fp, w: 0.32, h: 0.62, intensity: 3.2, seed: 20 + k });
    emitters.push({ origin: fp.clone().setY(y + 0.35), count: 18, radius: 0.06, height: 1.4, size: 0.018 });
  });
  for (const [g, mat] of flatten(statics)) group.add(mesh(g, mat, { cast: mat !== M.coal }));
  const particles = [flames(flameList), embers(emitters), smoke(plumes)];
  particles.forEach((o) => group.add(o));
  return {
    group,
    lights,
    particles,
    uniforms: shared,
    update(t) {
      shared.uTime.value = t;
      for (const L of lights) {
        const f = 0.8 + 0.1 * Math.sin(t * 13.1 + L.seed) + 0.07 * Math.sin(t * 27.3 + L.seed * 2.3) + 0.05 * Math.sin(t * 4.1 + L.seed);
        L.light.intensity = L.base * f;
        L.light.position.set(L.home.x + Math.sin(t * 9.3 + L.seed) * 0.03, L.home.y + Math.sin(t * 7.1) * 0.03, L.home.z + Math.cos(t * 8.7 + L.seed) * 0.03);
      }
    },
  };
}

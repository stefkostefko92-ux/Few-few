// GPU rain: velocity-stretched streaks lit by the fires and the moon, plus ground splashes.
// Driven by story time, so slow motion freezes the drops mid-air.
import * as THREE from 'three';
import { FIRE_GLOWS, MOON_DIR } from './config.js';

const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const firesGLSL = () => {
  const n = FIRE_GLOWS.length;
  const pos = FIRE_GLOWS.map((g) => `vec3(${f(g.pos.x)},${f(g.pos.y)},${f(g.pos.z)})`).join(',');
  return `const int RF_N = ${n};\nconst vec3 RF_POS[${n}] = vec3[${n}](${pos});`;
};

function seeds(count, seed) {
  const s = new Float32Array(count * 4);
  let a = seed;
  for (let i = 0; i < s.length; i++) {
    a = (a * 16807) % 2147483647;
    s[i] = a / 2147483647;
  }
  return s;
}

export function createRain(maxDrops) {
  const box = new THREE.Vector3(26, 14, 26);
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: box },
    uWind: { value: new THREE.Vector3(1.2, 0, 0.5) },
    uStreak: { value: 0.32 },
    uMoon: { value: MOON_DIR.clone() },
    uFlash: { value: 0 },
  };
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(maxDrops, 4242), 4));
  geo.instanceCount = maxDrops;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${firesGLSL()}
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform vec3 uBox;
      uniform vec3 uWind;
      uniform float uStreak;
      uniform vec3 uMoon;
      uniform float uFlash;
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        vUv = uv;
        float speed = 8.5 + 3.5 * aSeed.w;
        vec3 wp;
        wp.y = mod(aSeed.z * uBox.y - uTime * speed, uBox.y);
        vec2 drift = uWind.xz * (uBox.y - wp.y) / speed;
        wp.xz = uCenter.xz + mod(aSeed.xy * uBox.xz + drift - uCenter.xz, uBox.xz) - uBox.xz * 0.5;
        vec3 v = normalize(vec3(uWind.x, -speed, uWind.z));
        vec3 toCam = cameraPosition - wp;
        float dist = length(toCam);
        vec3 side = normalize(cross(v, toCam / max(dist, 1e-3)));
        float width = max(0.0028, dist * 0.0009);
        vec3 p = wp + side * position.x * width + v * (position.y - 0.5) * uStreak;
        vec3 light = vec3(0.05, 0.06, 0.08);
        for (int i = 0; i < RF_N; i++) {
          vec3 d = RF_POS[i] - wp;
          light += vec3(1.0, 0.42, 0.12) * (i == RF_N - 1 ? 1.2 : 0.7) / (1.0 + dot(d, d) * 0.35);
        }
        vec3 viewDir = -toCam / max(dist, 1e-3);
        light += vec3(0.5, 0.6, 0.85) * pow(max(dot(viewDir, uMoon), 0.0), 6.0) * 0.8;
        light += vec3(0.6, 0.68, 0.9) * uFlash * 2.0;
        vCol = light;
        vAlpha = smoothstep(0.25, 1.2, dist) * exp(-dist * 0.045) * (0.6 + 0.4 * aSeed.w) * min(1.0, 0.0035 / width * 1.4);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vAlpha;
      void main() {
        float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * sin(vUv.y * 3.14159) * vAlpha;
        gl_FragColor = vec4(vCol * 0.4, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const drops = new THREE.Mesh(geo, mat);
  drops.frustumCulled = false;
  drops.renderOrder = 8;

  const splashCount = 1400;
  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.index = quad.index;
  sgeo.setAttribute('position', quad.attributes.position);
  sgeo.setAttribute('uv', quad.attributes.uv);
  sgeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(splashCount, 777), 4));
  sgeo.instanceCount = splashCount;
  const smat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${firesGLSL()}
      attribute vec4 aSeed;
      uniform float uTime;
      uniform vec3 uCenter;
      varying vec2 vUv;
      varying float vLife;
      varying vec3 vCol;
      void main() {
        vUv = uv;
        float cycle = uTime * (1.6 + aSeed.w) + aSeed.z * 10.0;
        float life = fract(cycle);
        float gen = floor(cycle);
        vec2 r = fract(aSeed.xy + vec2(gen * 0.618, gen * 0.382));
        vec3 wp = vec3(uCenter.x + (r.x - 0.5) * 24.0, 0.0, uCenter.z + (r.y - 0.5) * 24.0);
        vLife = life;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        float s = 0.05 + 0.07 * aSeed.w;
        vec3 p = wp + right * position.x * s * 2.0 + vec3(0.0, position.y * s * (0.6 + life * 1.6), 0.0);
        vec3 light = vec3(0.05, 0.06, 0.08);
        for (int i = 0; i < RF_N; i++) {
          vec3 d = RF_POS[i] - wp;
          light += vec3(1.0, 0.42, 0.12) * (i == RF_N - 1 ? 1.2 : 0.7) / (1.0 + dot(d, d) * 0.35);
        }
        vCol = light;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vLife;
      varying vec3 vCol;
      void main() {
        vec2 q = vUv - vec2(0.5, 0.0);
        float crown = exp(-pow(abs(q.x) - vLife * 0.32, 2.0) * 260.0) * smoothstep(0.9, 0.0, vUv.y);
        float stem = exp(-q.x * q.x * 420.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
        float a = (crown + stem * (1.0 - vLife)) * (1.0 - vLife) * 0.9;
        gl_FragColor = vec4(vCol * 0.32, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const splashes = new THREE.Mesh(sgeo, smat);
  splashes.frustumCulled = false;
  splashes.renderOrder = 7;

  const group = new THREE.Group();
  group.add(drops, splashes);
  return {
    group,
    uniforms,
    setCount(n) {
      geo.instanceCount = Math.min(maxDrops, n);
    },
  };
}

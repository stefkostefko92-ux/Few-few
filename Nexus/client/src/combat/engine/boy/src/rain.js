// GPU rain: velocity-stretched streaks lit by the fires and the moon, plus ground splashes.
// Driven by story time, so slow motion freezes the drops mid-air. The box follows the camera.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uniform, varying, vec2, vec3, vec4, float, mod, normalize, cross, length, max, min, pow, exp, dot, abs, sin, fract, floor, smoothstep, uv, positionGeometry, cameraPosition, cameraProjectionMatrix, cameraViewMatrix } from 'three/tsl';
import { MOON_DIR } from './config.js';
import { U, fireLight } from './tsl.js';

function seeds(count, seed) {
  const s = new Float32Array(count * 4);
  let a = seed;
  for (let i = 0; i < s.length; i++) {
    a = (a * 16807) % 2147483647;
    s[i] = a / 2147483647;
  }
  return s;
}

function instancedQuad(count, seed) {
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  g.setAttribute('uv', quad.attributes.uv);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(count, seed), 4));
  g.instanceCount = count;
  return g;
}

const additive = (name) => new THREE.MeshBasicNodeMaterial({ name, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const toClip = (p) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(p, 1));

export function createRain(maxDrops) {
  const box = vec3(26, 14, 26);
  const streak = uniform(0.32);
  const seed = attribute('aSeed', 'vec4');
  const wind = U.wind.mul(2);

  const drops = additive('rain');
  const vCol = varying(vec3(), 'vRainCol');
  const vAlpha = varying(float(), 'vRainAlpha');
  drops.vertexNode = Fn(() => {
    const speed = seed.w.mul(3.5).add(8.5);
    const y = mod(seed.z.mul(box.y).sub(U.time.mul(speed)), box.y);
    const drift = wind.xz.mul(box.y.sub(y)).div(speed);
    const xz = cameraPosition.xz.add(mod(seed.xy.mul(box.xz).add(drift).sub(cameraPosition.xz), box.xz)).sub(box.xz.mul(0.5));
    const wp = vec3(xz.x, y, xz.y).toVar();
    const v = normalize(vec3(wind.x, speed.negate(), wind.z));
    const toCam = cameraPosition.sub(wp);
    const dist = length(toCam).toVar();
    const side = normalize(cross(v, toCam.div(max(dist, 1e-3))));
    const width = max(0.0028, dist.mul(0.0009));
    const p = wp.add(side.mul(positionGeometry.x).mul(width)).add(v.mul(positionGeometry.y.sub(0.5)).mul(streak));
    const viewDir = toCam.negate().div(max(dist, 1e-3));
    const moon = pow(max(dot(viewDir, vec3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z)), 0), 6).mul(0.8);
    vCol.assign(fireLight(wp).add(vec3(0.5, 0.6, 0.85).mul(moon)).add(vec3(0.6, 0.68, 0.9).mul(U.flash).mul(2)));
    vAlpha.assign(smoothstep(0.25, 1.2, dist).mul(exp(dist.mul(-0.045))).mul(seed.w.mul(0.4).add(0.6)).mul(min(1, float(0.0049).div(width))));
    return toClip(p);
  })();
  drops.colorNode = vCol.mul(0.4);
  drops.opacityNode = abs(uv().x.sub(0.5)).mul(2).oneMinus().mul(sin(uv().y.mul(Math.PI))).mul(vAlpha);
  const geo = instancedQuad(maxDrops, 4242);
  const dropMesh = new THREE.Mesh(geo, drops);
  dropMesh.frustumCulled = false;
  dropMesh.renderOrder = 8;

  const splashCount = 1400;
  const splash = additive('splash');
  const vLife = varying(float(), 'vSplashLife');
  const vSCol = varying(vec3(), 'vSplashCol');
  splash.vertexNode = Fn(() => {
    const cycle = U.time.mul(seed.w.add(1.6)).add(seed.z.mul(10));
    const life = fract(cycle);
    const gen = floor(cycle);
    const r = fract(seed.xy.add(vec2(gen.mul(0.618), gen.mul(0.382))));
    const wp = vec3(cameraPosition.x.add(r.x.sub(0.5).mul(24)), 0, cameraPosition.z.add(r.y.sub(0.5).mul(24))).toVar();
    const right = vec3(cameraViewMatrix[0].x, cameraViewMatrix[1].x, cameraViewMatrix[2].x);
    const s = seed.w.mul(0.07).add(0.05);
    const p = wp.add(right.mul(positionGeometry.x).mul(s).mul(2)).add(vec3(0, positionGeometry.y.mul(s).mul(life.mul(1.6).add(0.6)), 0));
    vLife.assign(life);
    vSCol.assign(fireLight(wp));
    return toClip(p);
  })();
  splash.colorNode = vSCol.mul(0.32);
  splash.opacityNode = Fn(() => {
    const q = uv().sub(vec2(0.5, 0));
    const crown = exp(pow(abs(q.x).sub(vLife.mul(0.32)), 2).mul(-260)).mul(smoothstep(0, 0.9, uv().y).oneMinus());
    const stem = exp(q.x.mul(q.x).mul(-420)).mul(smoothstep(0, 0.3, uv().y)).mul(smoothstep(0.4, 1, uv().y).oneMinus());
    return crown.add(stem.mul(vLife.oneMinus())).mul(vLife.oneMinus()).mul(0.9);
  })();
  const splashes = new THREE.Mesh(instancedQuad(splashCount, 777), splash);
  splashes.frustumCulled = false;
  splashes.renderOrder = 7;

  const group = new THREE.Group();
  group.add(dropMesh, splashes);
  return {
    group,
    streak,
    setCount(n) {
      geo.instanceCount = Math.min(maxDrops, n);
    },
  };
}

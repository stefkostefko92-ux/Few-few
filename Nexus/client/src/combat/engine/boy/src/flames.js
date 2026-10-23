// Fire particles, each system one instanced draw: licking flame sheets with domain-warped
// turbulence and a blackbody ramp, embers stretched along their flight, and smoke plumes.
// Turbulence reads the shared noise texture; everything fades into the fog with distance.
import * as THREE from 'three/webgpu';
import { Fn, attribute, varying, vec2, vec3, vec4, float, normalize, cross, length, max, pow, exp, dot, abs, sin, cos, fract, mix, select, smoothstep, clamp, uv, positionGeometry, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, Discard, If } from 'three/tsl';
import { U, noise } from './tsl.js';
import { fogTransmittance } from './fog.js';

const toClip = (p) => cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(p, 1));
const inst = (arr, n) => new THREE.InstancedBufferAttribute(new Float32Array(arr), n);

function quadGeometry(centred, count, attrs) {
  const q = new THREE.PlaneGeometry(1, 1);
  if (!centred) q.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = q.index;
  g.setAttribute('position', q.attributes.position);
  g.setAttribute('uv', q.attributes.uv);
  for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, a);
  g.instanceCount = count;
  return g;
}

function meshOf(g, mat, order) {
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

// Blackbody-ish ramp: deep red at the fringe, orange body, yellow-white core.
const fireRamp = (h) => {
  const c = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.34, 0.05), smoothstep(0.08, 0.42, h));
  return mix(mix(c, vec3(1.0, 0.7, 0.26), smoothstep(0.42, 0.72, h)), vec3(1.0, 0.94, 0.8), smoothstep(0.72, 1.0, h));
};

// list: [{ pos, w, h, intensity, seed }] — camera-facing around the vertical axis.
export function flames(list) {
  const g = quadGeometry(false, list.length, {
    iPos: inst(list.flatMap((f) => [f.pos.x, f.pos.y, f.pos.z]), 3),
    iSize: inst(list.flatMap((f) => [f.w, f.h]), 2),
    iParam: inst(list.flatMap((f) => [f.seed, f.intensity]), 2),
  });
  const pos = attribute('iPos', 'vec3');
  const size = attribute('iSize', 'vec2');
  const param = varying(attribute('iParam', 'vec2'), 'vFlame');
  const mat = new THREE.MeshBasicNodeMaterial({ name: 'flames', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  mat.vertexNode = Fn(() => {
    const toCam = normalize(vec3(cameraPosition.x.sub(pos.x), 0, cameraPosition.z.sub(pos.z)).add(vec3(1e-4, 0, 0)));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    return toClip(pos.add(right.mul(positionGeometry.x).mul(size.x)).add(vec3(0, positionGeometry.y.mul(size.y), 0)));
  })();
  const fade = fogTransmittance();
  mat.colorNode = Fn(() => {
    const seed = param.x;
    const t = U.time.add(seed.mul(17));
    const x = uv().x.sub(0.5).mul(2);
    const y = uv().y;
    // Domain warp: a slow large swirl bends the fast licking detail.
    const warp = noise(vec2(x.mul(0.18).add(seed.mul(0.61)), y.mul(0.22).sub(t.mul(0.21)))).b.sub(0.5).mul(0.5);
    const n1 = noise(vec2(x.mul(0.3).add(seed.mul(0.37)).add(warp), y.mul(0.45).sub(t.mul(0.55)))).r;
    const n2 = noise(vec2(x.mul(0.5).sub(seed.mul(0.21)), y.mul(0.75).sub(t.mul(0.5)).add(warp))).g;
    const n3 = noise(vec2(x.mul(1.3).add(seed), y.mul(1.6).sub(t.mul(1.3)))).a;
    const taper = mix(float(0.95), float(0.08), pow(y, 0.75));
    const sway = n1.sub(0.5).mul(0.7).mul(y).add(warp.mul(y));
    const edge = abs(x.add(sway)).div(max(taper.mul(n2.mul(0.75).add(0.55)), 1e-3));
    const body = smoothstep(0.3, 1.0, edge).oneMinus()
      .mul(smoothstep(0, 0.07, y))
      .mul(smoothstep(n1.mul(0.6).add(0.25), 1.0, y).oneMinus());
    const heat = clamp(body.mul(n2.mul(1.1).add(0.35)).mul(y.mul(-0.85).add(1.2)).mul(n3.mul(0.5).add(0.75)), 0, 1).toVar();
    If(heat.lessThan(0.004), () => {
      Discard();
    });
    return fireRamp(heat).mul(heat).mul(param.y).mul(fade);
  })();
  return meshOf(g, mat, 5);
}

// emitters: [{ origin, count, radius, height, size }] — hot sparks streaking up in the draught.
export function embers(emitters, rnd) {
  const origin = [];
  const seed = [];
  const param = [];
  for (const e of emitters) {
    for (let k = 0; k < e.count; k++) {
      origin.push(e.origin.x, e.origin.y, e.origin.z);
      seed.push(rnd(), rnd(), rnd(), rnd());
      param.push(e.radius, e.height, e.size);
    }
  }
  const count = origin.length / 3;
  const g = quadGeometry(true, count, { iOrigin: inst(origin, 3), iSeed: inst(seed, 4), iParam: inst(param, 3) });
  const o = attribute('iOrigin', 'vec3');
  const s = attribute('iSeed', 'vec4');
  const P = attribute('iParam', 'vec3');
  const rate = s.w.mul(0.2).add(0.22);
  const at = (t) => {
    const life = fract(t.mul(rate).add(s.z));
    const ang = s.x.mul(6.2831).add(life.mul(3).mul(s.y.sub(0.5)));
    const rad = P.x.mul(s.y.mul(0.75).add(0.25)).mul(life.mul(1.4).add(1));
    const x = cos(ang).mul(rad).add(sin(t.mul(1.3).add(s.x.mul(20))).mul(0.18).mul(life)).add(U.wind.x.mul(life).mul(1.6));
    const z = sin(ang).mul(rad).add(cos(t.mul(1.1).add(s.y.mul(20))).mul(0.18).mul(life)).add(U.wind.z.mul(life).mul(1.6));
    return { p: o.add(vec3(x, life.mul(P.y).mul(s.w.mul(0.4).add(0.6)), z)), life };
  };
  const vHeat = varying(float(), 'vEmberHeat');
  const mat = new THREE.MeshBasicNodeMaterial({ name: 'embers', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  mat.vertexNode = Fn(() => {
    const now = at(U.time);
    const before = at(U.time.sub(0.035));
    const trail = select(now.life.greaterThan(before.life), now.p.sub(before.p), vec3(0, 1e-4, 0));
    const len = length(trail).toVar();
    const w = P.z.mul(now.life.oneMinus().mul(0.6).add(0.4));
    const mid = now.p.sub(trail.mul(0.5));
    const dir = trail.div(max(len, 1e-5));
    const side = normalize(cross(dir, normalize(cameraPosition.sub(mid))).add(vec3(1e-5)));
    vHeat.assign(now.life.oneMinus().mul(sin(U.time.mul(19).add(s.x.mul(50))).mul(0.45).add(0.55)));
    return toClip(mid.add(dir.mul(positionGeometry.y).mul(max(len, w))).add(side.mul(positionGeometry.x).mul(w)));
  })();
  const fade = fogTransmittance();
  mat.colorNode = Fn(() => {
    const q = uv().sub(0.5).mul(vec2(2, 1));
    return vec3(1.0, 0.42, 0.1).mul(vHeat).mul(exp(dot(q, q).mul(-6))).mul(3.5).mul(fade);
  })();
  return meshOf(g, mat, 6);
}

// plumes: [{ origin, phase }] — smoke lit from below by the fire it rises from.
export function smoke(plumes) {
  const g = quadGeometry(true, plumes.length, {
    iOrigin: inst(plumes.flatMap((p) => [p.origin.x, p.origin.y, p.origin.z]), 3),
    iPhase: inst(plumes.map((p) => p.phase), 1),
  });
  const o = attribute('iOrigin', 'vec3');
  const phase = varying(attribute('iPhase', 'float'), 'vSmokePhase');
  const vLife = varying(float(), 'vSmokeLife');
  const mat = new THREE.MeshBasicNodeMaterial({ name: 'smoke', transparent: true, depthWrite: false, fog: false });
  mat.vertexNode = Fn(() => {
    const life = fract(U.time.mul(0.09).add(phase));
    vLife.assign(life);
    const c = o.add(vec3(U.wind.x.mul(life).mul(3), life.mul(4.5), U.wind.z.mul(life).mul(3)));
    const mv = cameraViewMatrix.mul(vec4(c, 1));
    const size = life.mul(2.6).add(0.7);
    return cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(size)), mv.z, 1));
  })();
  const fade = fogTransmittance();
  mat.colorNode = mix(vec3(0.16, 0.065, 0.025), vec3(0.022, 0.022, 0.028), smoothstep(0, 0.35, vLife));
  mat.opacityNode = Fn(() => {
    const q = uv().sub(0.5);
    const n = noise(uv().mul(0.5).add(vec2(phase.mul(3.7), U.time.mul(-0.04)))).r;
    return smoothstep(0.05, 0.5, length(q)).oneMinus().mul(smoothstep(0.3, 0.75, n)).mul(sin(vLife.mul(Math.PI))).mul(0.35).mul(fade);
  })();
  return meshOf(g, mat, 4);
}

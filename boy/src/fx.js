// Impact effects: spark streaks (hot steel) and water droplets on a CPU pool drawn as GPU
// instances, a flash light, cross-shaped lens glints and faint motion trails behind the blades.
import * as THREE from 'three';
import { Trail } from './trails.js';

const MAX = 2600;

function sparkSystem() {
  const P = new Float32Array(MAX * 3);
  const Vv = new Float32Array(MAX * 3);
  const L = new Float32Array(MAX);
  const S = new Float32Array(MAX);
  const K = new Float32Array(MAX);
  let count = 0;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iVel = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos);
  geo.setAttribute('iVel', iVel);
  geo.setAttribute('iData', iData);
  geo.instanceCount = 0;
  const uniforms = { uStreak: { value: 0.02 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute vec3 iVel;
      attribute vec2 iData;
      uniform float uStreak;
      varying float vLife;
      varying float vKind;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vLife = iData.x;
        vKind = iData.y;
        vec3 tail = iPos - iVel * uStreak * (vKind > 0.5 ? 0.5 : 1.0);
        vec3 axis = iPos - tail;
        float len = length(axis);
        vec3 dir = len > 1e-5 ? axis / len : vec3(0.0, 1.0, 0.0);
        vec3 mid = (iPos + tail) * 0.5;
        vec3 side = normalize(cross(dir, normalize(cameraPosition - mid)) + vec3(1e-5));
        float w = (vKind > 0.5 ? 0.007 : 0.0042) * (0.55 + 0.45 * vLife);
        vec3 p = mid + dir * position.y * max(len, w * 2.5) + side * position.x * w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vLife;
      varying float vKind;
      varying vec2 vUv;
      void main() {
        float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * mix(0.25, 1.0, vUv.y);
        vec3 hot = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.32), smoothstep(0.25, 0.75, vLife));
        hot = mix(hot, vec3(1.0, 0.95, 0.85), smoothstep(0.85, 1.0, vLife));
        vec3 col = vKind > 0.5 ? vec3(0.5, 0.55, 0.62) * 0.7 : hot * (1.6 + 9.0 * vLife * vLife);
        gl_FragColor = vec4(col, a * (vKind > 0.5 ? 0.6 * vLife : 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const meshObj = new THREE.Mesh(geo, mat);
  meshObj.frustumCulled = false;
  meshObj.renderOrder = 9;

  function spawn(p, dir, n, speed, spread, kind = 0, lifeMul = 1) {
    for (let k = 0; k < n && count < MAX; k++) {
      const i = count++;
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const m = Math.hypot(x, y, z) || 1;
      x = dir.x + (x / m) * spread;
      y = dir.y + (y / m) * spread + 0.25;
      z = dir.z + (z / m) * spread;
      const m2 = Math.hypot(x, y, z) || 1;
      const sp = speed * (0.35 + Math.random() * 0.9);
      P[i * 3] = p.x;
      P[i * 3 + 1] = p.y;
      P[i * 3 + 2] = p.z;
      Vv[i * 3] = (x / m2) * sp;
      Vv[i * 3 + 1] = (y / m2) * sp;
      Vv[i * 3 + 2] = (z / m2) * sp;
      S[i] = (0.3 + Math.random() * 0.85) * lifeMul;
      L[i] = 1;
      K[i] = kind;
    }
  }

  function update(dt) {
    let i = 0;
    while (i < count) {
      L[i] -= dt / S[i];
      if (L[i] <= 0) {
        const j = --count;
        P.copyWithin(i * 3, j * 3, j * 3 + 3);
        Vv.copyWithin(i * 3, j * 3, j * 3 + 3);
        L[i] = L[j];
        S[i] = S[j];
        K[i] = K[j];
        continue;
      }
      const drag = 1 - Math.min(1, (K[i] ? 0.6 : 1.4) * dt);
      Vv[i * 3] *= drag;
      Vv[i * 3 + 1] = Vv[i * 3 + 1] * drag - 9.81 * dt;
      Vv[i * 3 + 2] *= drag;
      P[i * 3] += Vv[i * 3] * dt;
      P[i * 3 + 1] += Vv[i * 3 + 1] * dt;
      P[i * 3 + 2] += Vv[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.012) {
        P[i * 3 + 1] = 0.012;
        Vv[i * 3 + 1] *= -0.3;
        Vv[i * 3] *= 0.55;
        Vv[i * 3 + 2] *= 0.55;
        if (K[i]) L[i] = 0;
        else L[i] *= 0.85;
      }
      i++;
    }
    iPos.array.set(P.subarray(0, count * 3));
    iVel.array.set(Vv.subarray(0, count * 3));
    for (let k = 0; k < count; k++) {
      iData.array[k * 2] = L[k];
      iData.array[k * 2 + 1] = K[k];
    }
    iPos.addUpdateRange(0, count * 3);
    iVel.addUpdateRange(0, count * 3);
    iData.addUpdateRange(0, count * 2);
    iPos.needsUpdate = true;
    iVel.needsUpdate = true;
    iData.needsUpdate = true;
    geo.instanceCount = count;
  }

  return { mesh: meshObj, spawn, update, uniforms, clear: () => (count = 0) };
}

function glints() {
  const pool = [];
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(1, 1);
  for (let k = 0; k < 6; k++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 1 }, uSize: { value: 0.5 } },
      vertexShader: /* glsl */ `
        uniform float uSize;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          gl_Position = projectionMatrix * viewMatrix * vec4(c + (right * position.x + up * position.y) * uSize, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAge;
        varying vec2 vUv;
        void main() {
          vec2 q = (vUv - 0.5) * 2.0;
          float core = exp(-dot(q, q) * 40.0);
          float rays = exp(-abs(q.y) * 70.0) * exp(-abs(q.x) * 3.5) + exp(-abs(q.x) * 70.0) * exp(-abs(q.y) * 3.5) * 0.6;
          float k = (1.0 - uAge) * (1.0 - uAge);
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.55) * (core * 7.0 + rays * 2.6) * k, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const m = new THREE.Mesh(quad, mat);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 20;
    group.add(m);
    pool.push({ m, age: 1, dur: 0.18 });
  }
  let next = 0;
  return {
    group,
    fire(p, size, dur) {
      const g = pool[next++ % pool.length];
      g.m.position.copy(p);
      g.m.material.uniforms.uSize.value = size;
      g.age = 0;
      g.dur = dur;
      g.m.visible = true;
    },
    update(dt) {
      for (const g of pool) {
        if (!g.m.visible) continue;
        g.age += dt / g.dur;
        g.m.material.uniforms.uAge.value = Math.min(1, g.age);
        if (g.age >= 1) g.m.visible = false;
      }
    },
  };
}

export function createFX() {
  const group = new THREE.Group();
  const sparks = sparkSystem();
  const glint = glints();
  const flash = new THREE.PointLight(0xffc68a, 0, 9, 2);
  group.add(sparks.mesh, glint.group, flash);
  const trails = [new Trail(0xcfd8ff), new Trail(0xffc8b0)];
  trails.forEach((t) => group.add(t.mesh));
  let flashE = 0;
  const _d = new THREE.Vector3();
  return {
    group,
    trails,
    // Screen-space overlays that should not appear in the puddle reflections.
    overlays: [glint.group, ...trails.map((t) => t.mesh)],
    impact(p, normal, power, kind = 'steel') {
      if (kind === 'water') {
        sparks.spawn(p, _d.set(0, 1, 0), Math.round(40 * power), 2.6 * power + 0.8, 0.9, 1, 0.8);
        return;
      }
      const n = Math.round((kind === 'scrape' ? 5 : 55) * power);
      sparks.spawn(p, normal, n, kind === 'scrape' ? 3.5 : 5 + 3 * power, kind === 'scrape' ? 0.8 : 0.95);
      if (kind !== 'scrape') {
        flash.position.copy(p);
        flashE = Math.max(flashE, 9 * power);
        glint.fire(p, 0.18 + 0.18 * power, 0.12 + 0.08 * power);
      } else {
        flash.position.copy(p);
        flashE = Math.max(flashE, 1.5 * power);
      }
    },
    update(dt, frameStreak, dtReal) {
      sparks.uniforms.uStreak.value = frameStreak;
      sparks.update(dt);
      glint.update(dtReal);
      flashE *= Math.exp(-dtReal * 18);
      flash.intensity = flashE;
    },
    clear() {
      sparks.clear();
      flashE = 0;
    },
  };
}

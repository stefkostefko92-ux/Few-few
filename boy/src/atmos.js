// Breath vapour: each exhale leaves a small warm-lit puff at the mouth.
import * as THREE from 'three/webgpu';
import { Fn, attribute, varying, vec3, vec4, float, length, smoothstep, uv, positionGeometry, cameraProjectionMatrix, cameraViewMatrix, Discard, If } from 'three/tsl';
import { noise } from './tsl.js';

const MAX = 24;

export function createBreath() {
  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(1);
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index;
  g.setAttribute('position', q.attributes.position);
  g.setAttribute('uv', q.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iAge = new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iPos', iPos);
  g.setAttribute('iAge', iAge);
  g.instanceCount = MAX;
  const vAge = varying(float(), 'vBreathAge');
  const mat = new THREE.MeshBasicNodeMaterial({ name: 'breath', transparent: true, depthWrite: false, fog: false });
  mat.vertexNode = Fn(() => {
    const a = attribute('iAge', 'float');
    vAge.assign(a);
    const mv = cameraViewMatrix.mul(vec4(attribute('iPos', 'vec3'), 1));
    return cameraProjectionMatrix.mul(vec4(mv.xy.add(positionGeometry.xy.mul(a.mul(0.42).add(0.08))), mv.z, 1));
  })();
  mat.colorNode = vec3(0.21, 0.18, 0.16);
  mat.opacityNode = Fn(() => {
    If(vAge.greaterThanEqual(1), () => {
      Discard();
    });
    const n = noise(uv().mul(0.6).add(vAge.mul(0.3))).g;
    return smoothstep(0, 0.5, length(uv().sub(0.5))).oneMinus().mul(smoothstep(0.25, 0.7, n)).mul(vAge.oneMinus()).mul(smoothstep(0, 0.08, vAge)).mul(0.22);
  })();
  const meshObj = new THREE.Mesh(g, mat);
  meshObj.frustumCulled = false;
  meshObj.renderOrder = 11;
  let next = 0;
  return {
    mesh: meshObj,
    emit(p, dir) {
      const i = next++ % MAX;
      pos.set([p.x, p.y, p.z], i * 3);
      vel.set([dir.x * 0.35, 0.06 + dir.y * 0.35, dir.z * 0.35], i * 3);
      age[i] = 0;
    },
    update(dt, wind) {
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= 1) continue;
        age[i] = Math.min(1, age[i] + dt / 1.7);
        const k = i * 3;
        vel[k] = vel[k] * 0.97 + wind.x * 0.02 * dt;
        vel[k + 2] = vel[k + 2] * 0.97 + wind.z * 0.02 * dt;
        pos[k] += vel[k] * dt;
        pos[k + 1] += vel[k + 1] * dt;
        pos[k + 2] += vel[k + 2] * dt;
      }
      iPos.array.set(pos);
      iAge.array.set(age);
      iPos.needsUpdate = true;
      iAge.needsUpdate = true;
    },
    clear() {
      age.fill(1);
    },
  };
}

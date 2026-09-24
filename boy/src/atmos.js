// Breath vapour: each exhale leaves a small warm-lit puff at the helmet's breaths.
import * as THREE from 'three';

const MAX = 24;

export function createBreath(noise) {
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
  const mat = new THREE.ShaderMaterial({
    uniforms: { tNoise: { value: noise } },
    vertexShader: /* glsl */ `
      attribute vec3 iPos;
      attribute float iAge;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        vUv = uv;
        vAge = iAge;
        float size = 0.08 + iAge * 0.42;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        gl_Position = projectionMatrix * viewMatrix * vec4(iPos + (right * position.x + up * position.y) * size, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tNoise;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        if (vAge >= 1.0) discard;
        float n = texture2D(tNoise, vUv * 0.6 + vAge * 0.3).g;
        float a = smoothstep(0.5, 0.0, length(vUv - 0.5)) * smoothstep(0.25, 0.7, n) * (1.0 - vAge) * smoothstep(0.0, 0.08, vAge) * 0.22;
        gl_FragColor = vec4(vec3(0.21, 0.18, 0.16), a);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
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

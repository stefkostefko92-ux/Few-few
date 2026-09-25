// Night sky dome: drifting storm clouds, a veiled moon and the orange glow of the burning bailey.
import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, max, pow, exp, dot, mix, smoothstep, normalize, positionLocal, cameraProjectionMatrix, modelViewMatrix } from 'three/tsl';
import { MOON_DIR } from './config.js';
import { U, noise } from './tsl.js';

export function createSky() {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  // Drawn on the far plane, wherever the camera (or its mirror in the puddles) stands.
  mat.vertexNode = Fn(() => {
    const p = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1));
    return vec4(p.x, p.y, p.w.mul(0.999999), p.w);
  })();
  mat.colorNode = Fn(() => {
    const d = normalize(positionLocal).toVar();
    const h = d.y;
    const moon = vec3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z);
    const col = mix(vec3(0.032, 0.037, 0.05), vec3(0.005, 0.008, 0.018), smoothstep(-0.02, 0.55, h)).toVar();
    const hd = normalize(d.xz.add(1e-5));
    const gate = pow(max(hd.y.negate(), 0), 5).mul(exp(max(h, 0).mul(-8))).toVar();
    col.addAssign(vec3(0.55, 0.17, 0.04).mul(gate).mul(0.4));
    const md = dot(d, moon).toVar();
    col.addAssign(vec3(1.0, 0.96, 0.88).mul(smoothstep(0.99955, 0.99972, md)).mul(16));
    col.addAssign(vec3(0.45, 0.55, 0.85).mul(pow(max(md, 0), 220).mul(1.4).add(pow(max(md, 0), 14).mul(0.1))));
    const uv = d.xz.div(max(h.add(0.2), 0.02));
    const t = U.time.mul(0.014);
    const c0 = noise(uv.mul(0.31).add(vec2(t, t.mul(0.35)).mul(0.25))).r;
    const c = smoothstep(0.38, 0.78, c0.add(noise(uv.mul(0.5).sub(t.mul(0.21))).g.sub(0.5).mul(0.16))).toVar();
    const lit = pow(max(md, 0), 7);
    const cloud = mix(vec3(0.011, 0.013, 0.02), vec3(0.1, 0.11, 0.14), lit)
      .add(vec3(0.3, 0.1, 0.025).mul(gate))
      .add(vec3(0.55, 0.62, 0.9).mul(U.flash).mul(c.mul(0.65).add(0.35)));
    col.assign(mix(col, cloud, c.mul(smoothstep(-0.06, 0.14, h)).mul(0.96)));
    return mix(vec3(0.016, 0.019, 0.026), col, smoothstep(-0.14, 0.02, h));
  })();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  return { mesh: sky };
}

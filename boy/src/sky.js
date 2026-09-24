// Night sky dome: drifting storm clouds, a veiled moon and the orange glow of the burning bailey.
import * as THREE from 'three';
import { MOON_DIR } from './config.js';

export function createSky(noise) {
  const uniforms = {
    tNoise: { value: noise },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uMoonDir: { value: MOON_DIR.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        p.z = p.w * 0.999999;
        gl_Position = p;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlash;
      uniform vec3 uMoonDir;
      uniform sampler2D tNoise;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(vec3(0.032, 0.037, 0.05), vec3(0.005, 0.008, 0.018), smoothstep(-0.02, 0.55, h));
        vec2 hd = normalize(vec2(d.x, d.z) + 1e-5);
        float gate = pow(max(-hd.y, 0.0), 5.0) * exp(-max(h, 0.0) * 8.0);
        col += vec3(0.55, 0.17, 0.04) * gate * 0.4;
        float md = dot(d, uMoonDir);
        col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99955, 0.99972, md) * 16.0;
        col += vec3(0.45, 0.55, 0.85) * (pow(max(md, 0.0), 220.0) * 1.4 + pow(max(md, 0.0), 14.0) * 0.1);
        if (h > -0.06) {
          vec2 uv = d.xz / (h + 0.2);
          float t = uTime * 0.014;
          float c = texture2D(tNoise, uv * 0.31 + vec2(t, t * 0.35) * 0.25).r;
          c = smoothstep(0.38, 0.78, c + 0.16 * (texture2D(tNoise, uv * 0.5 - t * 0.21).g - 0.5));
          float lit = pow(max(md, 0.0), 7.0);
          vec3 cloud = mix(vec3(0.011, 0.013, 0.02), vec3(0.1, 0.11, 0.14), lit) + vec3(0.3, 0.1, 0.025) * gate;
          cloud += vec3(0.55, 0.62, 0.9) * uFlash * (0.35 + 0.65 * c);
          col = mix(col, cloud, c * smoothstep(-0.06, 0.14, h) * 0.96);
        }
        col = mix(vec3(0.016, 0.019, 0.026), col, smoothstep(-0.14, 0.02, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  sky.onBeforeRender = (renderer, scene, camera) => {
    sky.position.setFromMatrixPosition(camera.matrixWorld);
    sky.updateMatrixWorld();
  };
  return { mesh: sky, uniforms };
}

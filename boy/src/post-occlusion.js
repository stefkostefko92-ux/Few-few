// Ambient occlusion from the depth buffer and its depth-aware blur (both at half resolution).
import * as THREE from 'three';
import { DEPTH, pass, depthUniforms } from './post-common.js';

// Normal-oriented hemisphere occlusion from the depth buffer, 12 taps, rotated per pixel.
export function aoMaterial() {
  return pass({ ...depthUniforms(), uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.45 } }, /* glsl */ `
    uniform sampler2D tDepth;
    uniform mat4 uProj;
    uniform mat4 uInvProj;
    uniform vec2 uTexel;
    uniform float uRadius;
    varying vec2 vUv;
    vec3 viewPos(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    void main() {
      if (texture2D(tDepth, vUv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPos(vUv);
      vec3 pr = viewPos(vUv + vec2(uTexel.x, 0.0)) - p;
      vec3 pl = p - viewPos(vUv - vec2(uTexel.x, 0.0));
      vec3 pu = viewPos(vUv + vec2(0.0, uTexel.y)) - p;
      vec3 pd = p - viewPos(vUv - vec2(0.0, uTexel.y));
      vec3 n = normalize(cross(abs(pr.z) < abs(pl.z) ? pr : pl, abs(pu.z) < abs(pd.z) ? pu : pd));
      if (dot(n, p) > 0.0) n = -n;
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 b = cross(n, t);
      float occ = 0.0;
      for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float r = (fi + 0.5) / 12.0;
        float a = ign * 6.2831853 + fi * 2.39996323;
        vec3 dir = (t * cos(a) + b * sin(a)) * sqrt(r) + n * sqrt(1.0 - r);
        vec3 s = p + dir * uRadius * mix(0.2, 1.0, r * r);
        vec4 clip = uProj * vec4(s, 1.0);
        float sz = viewPos(clip.xy / clip.w * 0.5 + 0.5).z;
        float range = smoothstep(0.0, 1.0, uRadius / max(abs(p.z - sz), 1e-3));
        occ += step(s.z + 0.03, sz) * range;
      }
      float ao = clamp(1.0 - occ / 12.0, 0.0, 1.0);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`);
}

export function aoBlurMaterial() {
  return pass({ ...depthUniforms(), tAO: { value: null }, uTexel: { value: new THREE.Vector2() } }, /* glsl */ `
    ${DEPTH}
    uniform sampler2D tAO;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float cz = viewZAt(vUv);
      float sum = 0.0;
      float wsum = 0.0;
      for (int y = -2; y <= 1; y++) {
        for (int x = -2; x <= 1; x++) {
          vec2 o = (vec2(float(x), float(y)) + 0.5) * uTexel;
          float w = exp(-abs(viewZAt(vUv + o) - cz) / max(abs(cz) * 0.04, 0.02));
          sum += texture2D(tAO, vUv + o).r * w;
          wsum += w;
        }
      }
      float ao = sum / max(wsum, 1e-4);
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }`);
}

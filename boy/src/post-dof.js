// Bokeh depth of field at half resolution and the full-resolution composite (AO + DOF).
import * as THREE from 'three';
import { DEPTH, LUMA, pass, depthUniforms } from './post-common.js';

// Half-resolution colour with the signed circle of confusion in alpha (negative = near field).
export function dofPrefilterMaterial() {
  return pass({ ...depthUniforms(), tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 5 }, uCoc: { value: 5 }, uMaxBlur: { value: 8 } }, /* glsl */ `
    ${DEPTH}
    ${LUMA}
    uniform sampler2D tColor;
    uniform vec2 uTexel;
    uniform float uFocus;
    uniform float uCoc;
    uniform float uMaxBlur;
    varying vec2 vUv;
    float cocAt(float d) { return clamp(uCoc * (1.0 - uFocus / max(d, 1e-3)), -uMaxBlur, uMaxBlur); }
    void main() {
      vec2 o = uTexel * 0.5;
      vec2 uv0 = vUv + vec2(-o.x, -o.y);
      vec2 uv1 = vUv + vec2(o.x, -o.y);
      vec2 uv2 = vUv + vec2(-o.x, o.y);
      vec2 uv3 = vUv + vec2(o.x, o.y);
      vec3 c0 = texture2D(tColor, uv0).rgb;
      vec3 c1 = texture2D(tColor, uv1).rgb;
      vec3 c2 = texture2D(tColor, uv2).rgb;
      vec3 c3 = texture2D(tColor, uv3).rgb;
      float w0 = 1.0 / (1.0 + dot(c0, LUMA));
      float w1 = 1.0 / (1.0 + dot(c1, LUMA));
      float w2 = 1.0 / (1.0 + dot(c2, LUMA));
      float w3 = 1.0 / (1.0 + dot(c3, LUMA));
      vec3 col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / (w0 + w1 + w2 + w3);
      float d = min(min(-viewZAt(uv0), -viewZAt(uv1)), min(-viewZAt(uv2), -viewZAt(uv3)));
      gl_FragColor = vec4(col, cocAt(d));
    }`);
}

// Scatter-as-gather bokeh on a golden-angle spiral; bright samples weigh more so highlights bloom into discs.
export function dofGatherMaterial(taps) {
  return pass({ tHalf: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxBlur: { value: 8 } }, /* glsl */ `
    ${LUMA}
    uniform sampler2D tHalf;
    uniform vec2 uTexel;
    uniform float uMaxBlur;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tHalf, vUv);
      float cc = abs(c.a);
      vec3 acc = c.rgb;
      float tot = 1.0;
      float near = 0.0;
      float ang = 0.0;
      for (int i = 0; i < TAPS; i++) {
        ang += 2.39996323;
        float r = uMaxBlur * sqrt((float(i) + 0.5) / float(TAPS));
        vec4 s = texture2D(tHalf, vUv + vec2(cos(ang), sin(ang)) * uTexel * r);
        float sc = abs(s.a);
        if (s.a > c.a) sc = min(sc, cc * 2.0);
        float m = smoothstep(r - 1.0, r + 1.0, sc);
        float w = m * (1.0 + min(dot(s.rgb, LUMA), 6.0) * 0.25);
        acc += s.rgb * w;
        tot += w;
        if (s.a < -0.5) near += m;
      }
      gl_FragColor = vec4(acc / tot, clamp(near / float(TAPS) * 2.5, 0.0, 1.0));
    }`, { TAPS: taps });
}

export function compositeMaterial() {
  return pass({ ...depthUniforms(), tColor: { value: null }, tDof: { value: null }, tAO: { value: null }, uFocus: { value: 5 }, uCoc: { value: 5 }, uAO: { value: 0 }, uDof: { value: 0 } }, /* glsl */ `
    ${DEPTH}
    ${LUMA}
    uniform sampler2D tColor;
    uniform sampler2D tDof;
    uniform sampler2D tAO;
    uniform float uFocus;
    uniform float uCoc;
    uniform float uAO;
    uniform float uDof;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      if (uAO > 0.0) {
        float ao = texture2D(tAO, vUv).r;
        col *= mix(1.0, mix(ao, 1.0, smoothstep(0.8, 3.0, dot(col, LUMA))), uAO);
      }
      if (uDof > 0.0) {
        float coc = abs(uCoc * (1.0 - uFocus / max(-viewZAt(vUv), 1e-3)));
        vec4 b = texture2D(tDof, vUv);
        col = mix(col, b.rgb, max(smoothstep(0.75, 2.5, coc), b.a));
      }
      gl_FragColor = vec4(col, 1.0);
    }`);
}

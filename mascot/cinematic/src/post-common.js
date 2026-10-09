// Shared pieces of the post-processing shaders. Vendored copy of boy/src/post-common.js —
// generic full-screen-quad/depth-unpack plumbing, no domain content.
import * as THREE from 'three';

export const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
export const DEPTH = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float uNear;
  uniform float uFar;
  float viewZAt(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
`;
export const LUMA = 'const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);';

export const pass = (uniforms, fragmentShader, defines = {}) =>
  new THREE.ShaderMaterial({ uniforms, defines, vertexShader: VERT, fragmentShader, depthWrite: false, depthTest: false });
export const depthUniforms = () => ({ tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 300 } });

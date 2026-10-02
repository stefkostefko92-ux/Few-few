// How a frame of the 3D view is made. While the camera moves: one sample (MSAA, ambient occlusion, shadows).
// When it rests, the view keeps refining for a moment: every new sample shifts the camera by a fraction of a pixel
// and moves the key light within its disc, and the samples are averaged before tone mapping — clean edges,
// smooth occlusion and soft shadows with a real penumbra. Nothing is drawn once the image is done.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { halton } from './viewer-studio.js';

const AVERAGE = {
  uniforms: { tDiffuse: { value: null }, weight: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float weight;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, weight);
    }`,
};

export class Pipeline {
  constructor(renderer, scene, camera, { samples = 32 } = {}) {
    this.renderer = renderer;
    this.camera = camera;
    this.maxSamples = samples;
    this.count = 0;
    this.size = new THREE.Vector2(1, 1);
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.renderToScreen = false;
    this.composer.addPass(new RenderPass(scene, camera));
    // occlusion within ~a hand's width: corners of the carcass, under shelves, behind the legs, on the floor
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({
      radius: 0.22,
      distanceExponent: 1.6,
      thickness: 1.2,
      scale: 1.1,
      samples: 16,
    });
    this.ao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      rings: 2,
      samples: 12,
    });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.acc = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.average = new FullScreenQuad(
      new THREE.ShaderMaterial({
        ...AVERAGE,
        uniforms: THREE.UniformsUtils.clone(AVERAGE.uniforms),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        // the weight rides in alpha for the colour blend; the stored alpha stays 1 (the canvas has an alpha channel)
        blendEquationAlpha: THREE.MaxEquation,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneFactor,
      }),
    );
    this.output = new OutputPass();
    this.output.renderToScreen = true;
  }

  setSize(width, height, ratio) {
    // the jitter is in drawing-buffer pixels
    this.size.set(Math.round(width * ratio), Math.round(height * ratio));
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.acc.setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.output.setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.reset();
  }

  reset() {
    this.count = 0;
  }

  get done() {
    return this.count >= this.maxSamples;
  }

  // One more sample. `light(k)` moves the key light for sample k (0 = its resting place).
  render(light) {
    const k = this.count;
    const { x: w, y: h } = this.size;
    if (k > 0) {
      const jx = halton(k + 1, 2) - 0.5;
      const jy = halton(k + 1, 3) - 0.5;
      this.camera.setViewOffset(w, h, jx, jy, w, h);
    }
    light?.(k);
    this.composer.render();
    if (k > 0) this.camera.clearViewOffset();
    const r = this.renderer;
    this.average.material.uniforms.tDiffuse.value = this.composer.readBuffer.texture;
    this.average.material.uniforms.weight.value = 1 / (k + 1);
    r.setRenderTarget(this.acc);
    const clear = r.autoClear;
    r.autoClear = false; // blend onto the running average
    this.average.render(r);
    r.autoClear = clear;
    this.output.render(r, null, this.acc);
    this.count = k + 1;
  }

  dispose() {
    this.composer.dispose();
    this.ao.dispose();
    this.acc.dispose();
    this.average.dispose();
    this.output.dispose();
  }
}

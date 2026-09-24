// Film pipeline at a dynamic internal resolution: HDR scene (MSAA + depth) -> half-res ambient
// occlusion -> half-res bokeh DOF (macro/toy-camera aperture) -> full-res composite -> bloom
// with halation -> CAS-sharpened upscale -> ACES -> grade -> grain.
// Adapted from boy/src/post.js: same orchestration, tuned defaults for a small studio subject
// instead of a wide medieval courtyard (tighter bloom radius, warmer/greener tint, no streaks by default).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { aoMaterial, aoBlurMaterial } from './post-occlusion.js';
import { dofPrefilterMaterial, dofGatherMaterial, compositeMaterial } from './post-dof.js';
import { streakMaterial, finalMaterial } from './post-final.js';

const halfFloat = (w, h, extra = {}) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, ...extra });

export class Post {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.q = quality;
    this.fsq = new FullScreenQuad();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.45, 1.95);
    this.bloom.bloomTintColors = [
      new THREE.Vector3(0.62, 1.0, 0.48),
      new THREE.Vector3(0.76, 1.0, 0.6),
      new THREE.Vector3(0.9, 1.0, 0.82),
      new THREE.Vector3(1.0, 1.0, 0.96),
      new THREE.Vector3(0.96, 1.0, 1.0),
    ];
    this.ao = aoMaterial();
    this.aoBlur = aoBlurMaterial();
    this.dofPre = dofPrefilterMaterial();
    this.dofGather = dofGatherMaterial(Math.max(1, quality.dofTaps));
    this.comp = compositeMaterial();
    this.streak = streakMaterial();
    this.final = finalMaterial();
    this.w = 2;
    this.h = 2;
    this.outW = 2;
    this.outH = 2;
    this.targets();
  }

  targets() {
    for (const t of [this.sceneRT, this.aoRT, this.aoBlurRT, this.dofHalf, this.dofBlur, this.compRT, this.streakA, this.streakB]) t?.dispose();
    const { w, h } = this;
    const hw = Math.max(2, w >> 1);
    const hh = Math.max(2, h >> 1);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.q.msaa, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    this.aoRT = new THREE.WebGLRenderTarget(hw, hh, { depthBuffer: false });
    this.aoBlurRT = new THREE.WebGLRenderTarget(hw, hh, { depthBuffer: false });
    this.dofHalf = halfFloat(hw, hh);
    this.dofBlur = halfFloat(hw, hh);
    this.compRT = halfFloat(w, h);
    this.streakA = halfFloat(Math.max(8, w >> 2), Math.max(8, h >> 3));
    this.streakB = halfFloat(Math.max(8, w >> 2), Math.max(8, h >> 3));
    this.bloom.setSize(w, h);
  }

  setQuality(q) {
    const msaa = q.msaa !== this.q.msaa;
    const taps = q.dofTaps !== this.q.dofTaps;
    this.q = q;
    if (taps) {
      this.dofGather.defines.TAPS = Math.max(1, q.dofTaps);
      this.dofGather.needsUpdate = true;
    }
    if (msaa) this.targets();
  }

  // Internal render size (dynamic resolution) and the display size it is upscaled to.
  setSize(w, h, outW, outH) {
    this.outW = outW;
    this.outH = outH;
    this.final.uniforms.uAspect.value = outW / outH;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.targets();
  }

  run(mat, target) {
    this.fsq.material = mat;
    this.renderer.setRenderTarget(target);
    this.fsq.render(this.renderer);
  }

  render(scene, camera, p) {
    const r = this.renderer;
    const q = this.q;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    let src = this.sceneRT;
    const useAO = q.ao;
    const useDof = q.dofTaps > 0 && p.maxBlur > 0.5;
    const depth = this.sceneRT.depthTexture;
    const half = new THREE.Vector2(1 / Math.max(2, this.w >> 1), 1 / Math.max(2, this.h >> 1));
    for (const m of [this.ao, this.aoBlur, this.dofPre, this.comp]) {
      m.uniforms.tDepth.value = depth;
      m.uniforms.uNear.value = camera.near;
      m.uniforms.uFar.value = camera.far;
    }
    if (useAO || useDof) {
      if (useAO) {
        const a = this.ao.uniforms;
        a.uProj.value.copy(camera.projectionMatrix);
        a.uInvProj.value.copy(camera.projectionMatrixInverse);
        a.uTexel.value.set(1 / this.w, 1 / this.h);
        this.run(this.ao, this.aoRT);
        this.aoBlur.uniforms.tAO.value = this.aoRT.texture;
        this.aoBlur.uniforms.uTexel.value.copy(half);
        this.run(this.aoBlur, this.aoBlurRT);
      }
      if (useDof) {
        const d = this.dofPre.uniforms;
        d.tColor.value = this.sceneRT.texture;
        d.uTexel.value.set(1 / this.w, 1 / this.h);
        d.uFocus.value = p.focus;
        d.uCoc.value = p.coc * 0.5;
        d.uMaxBlur.value = p.maxBlur * 0.5;
        this.run(this.dofPre, this.dofHalf);
        const g = this.dofGather.uniforms;
        g.tHalf.value = this.dofHalf.texture;
        g.uTexel.value.copy(half);
        g.uMaxBlur.value = p.maxBlur * 0.5;
        this.run(this.dofGather, this.dofBlur);
      }
      const c = this.comp.uniforms;
      c.tColor.value = this.sceneRT.texture;
      c.tDof.value = this.dofBlur.texture;
      c.tAO.value = this.aoBlurRT.texture;
      c.uFocus.value = p.focus;
      c.uCoc.value = p.coc;
      c.uAO.value = useAO ? p.ao : 0;
      c.uDof.value = useDof ? 1 : 0;
      this.run(this.comp, this.compRT);
      src = this.compRT;
    }
    this.bloom.strength = p.bloom;
    this.bloom.render(r, null, src, 0, false);
    const f = this.final.uniforms;
    if (q.streaks) {
      const su = this.streak.uniforms;
      su.tInput.value = this.bloom.renderTargetBright.texture;
      su.uTexel.value.set(1 / this.streakA.width, 1 / this.streakA.height);
      su.uSpread.value = 1;
      this.run(this.streak, this.streakA);
      su.tInput.value = this.streakA.texture;
      su.uSpread.value = 3;
      this.run(this.streak, this.streakB);
      f.uStreak.value = p.streak;
    } else f.uStreak.value = 0;
    f.tStreak.value = this.streakB.texture;
    f.tInput.value = src.texture;
    f.uInTexel.value.set(1 / this.w, 1 / this.h);
    f.uSharp.value = this.w < this.outW * 0.98 ? 0.22 : 0.12;
    f.uExposure.value = p.exposure;
    f.uTime.value = p.time;
    f.uGrain.value = p.grain;
    f.uBars.value = p.bars ?? 0;
    f.uFade.value = p.fade ?? 0;
    this.run(this.final, null);
  }

  // Only the embed path (mascot/cinematic/src/embed.js) ever tears a Post instance down mid-session
  // — the standalone showcase page (main.js) lives for the tab's whole lifetime and never calls this.
  dispose() {
    for (const t of [this.sceneRT, this.aoRT, this.aoBlurRT, this.dofHalf, this.dofBlur, this.compRT, this.streakA, this.streakB]) t?.dispose();
    for (const m of [this.ao, this.aoBlur, this.dofPre, this.dofGather, this.comp, this.streak, this.final]) m?.dispose();
    this.bloom.dispose();
    this.fsq.dispose();
  }
}

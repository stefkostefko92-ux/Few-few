// Frame pipeline: scene (HDR + normals + velocity) → GTAO contact occlusion → TRAA (interactive)
// → gentle bloom → Neutral tone mapping (keeps the pale backdrop and the zinc neutral) → sRGB.
// The photo path renders the same HDR composite into a half-float target and averages jittered
// frames (camera sub-pixel offsets, key light moved across its softbox, rotating AO noise).
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, velocity, packNormalToRGB, unpackRGBToNormal, sample, screenUV, screenCoordinate, vec3, vec4, float, uniform, Fn, texture, mix, clamp, max, fract, dot, neutralToneMapping, sRGBTransferOETF } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export function lookUniforms() {
  return { exposure: uniform(1), ao: uniform(1), bloom: uniform(0.12), showAO: uniform(0) };
}

const hash12 = (p) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
};

// HDR → display-referred sRGB with ±½ LSB dither against banding on the smooth backdrop.
export const toDisplay = (hdr, P) =>
  Fn(() => {
    const c = max(hdr.rgb, 0).toVar();
    const mapped = neutralToneMapping(c, P.exposure);
    const srgb = sRGBTransferOETF(clamp(mapped, 0, 1)).toVar();
    srgb.addAssign(hash12(screenCoordinate.xy).sub(0.5).div(255));
    return vec4(clamp(srgb, 0, 1), 1);
  })();

// Scene pass with the G-buffer the screen-space passes need; returns the AO-lit HDR image.
function sceneGraph(scene, camera, P, keep) {
  const scenePass = keep(pass(scene, camera, { samples: 0 }));
  scenePass.setMRT(mrt({ output, normal: vec4(packNormalToRGB(normalView), 1), velocity: vec4(velocity, 0, 1) }));
  scenePass.getTexture('normal').type = THREE.UnsignedByteType;
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const packed = scenePass.getTextureNode('normal');
  const normal = sample((st) => unpackRGBToNormal(packed.sample(st).rgb));
  const occ = keep(ao(depth, normal, camera));
  occ.radius.value = 0.07;
  occ.distanceExponent.value = 1;
  occ.thickness.value = 1;
  occ.scale.value = 1.8;
  occ.samples.value = 16;
  occ.useTemporalFiltering = true;
  // GTAO rotates its noise by frameId, but frameId advances once per renderer.render() call (a
  // pipeline makes several), so the pattern would repeat. It gets its own counter, advanced once
  // per displayed or accumulated frame.
  let tick = 0;
  const update = occ.updateBefore.bind(occ);
  occ.updateBefore = (frame) => {
    const id = frame.frameId;
    frame.frameId = tick;
    const r = update(frame);
    frame.frameId = id;
    return r;
  };
  // Edge-aware denoise of the raw GTAO (depth, normal and luma stops keep the contact lines).
  const clean = keep(denoise(occ.getTextureNode(), depth, normal, camera));
  clean.radius.value = 6;
  clean.depthPhi.value = 8;
  clean.normalPhi.value = 6;
  const aoValue = clean.r;
  const shade = mix(float(1), aoValue, P.ao);
  // showAO = 1 displays the occlusion buffer alone (tuning aid).
  const lit = mix(vec4(color.rgb.mul(shade), color.a), vec4(vec3(aoValue), 1), P.showAO);
  return { lit, depth, velocity: scenePass.getTextureNode('velocity'), advance: () => tick++ };
}

// Real-time view: TRAA converges the image whenever the camera rests.
export function createInteractive(renderer, scene, camera, P) {
  const owned = [];
  const keep = (n) => (owned.push(n), n);
  const g = sceneGraph(scene, camera, P, keep);
  const aa = keep(traa(g.lit, g.depth, g.velocity, camera));
  const img = aa.getTextureNode();
  const glow = keep(bloom(img, 1, 0.45, 0.9));
  const pipe = new THREE.RenderPipeline(renderer);
  pipe.outputColorTransform = false;
  pipe.outputNode = toDisplay(img.add(glow.mul(P.bloom)), P);
  return {
    render() {
      g.advance();
      pipe.render();
    },
    dispose() {
      owned.forEach((n) => n.dispose());
      pipe.dispose();
    },
  };
}

// WebGPU pads read-back rows to 256 bytes; callers always get tightly packed RGBA rows.
function packRows(px, w, h) {
  const row = w * 4;
  if (px.length === row * h) return px;
  const stride = (px.length - row) / (h - 1);
  const out = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) out.set(px.subarray(y * stride, y * stride + row), y * row);
  return out;
}

// Stills: frames average in batches of 16 (a running mean stays inside half-float precision),
// batches average into the result. onFrame(i) lets the caller jitter camera and light.
export function createPhoto(renderer, scene, camera, P) {
  const owned = [];
  const keep = (n) => (owned.push(n), n);
  const g = sceneGraph(scene, camera, P, keep);
  const pipe = new THREE.RenderPipeline(renderer);
  pipe.outputColorTransform = false;
  pipe.outputNode = g.lit;

  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const hdr = () => new THREE.RenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
  const frame = hdr();
  const batch = [hdr(), hdr()];
  const total = [hdr(), hdr()];
  const out = new THREE.RenderTarget(size.x, size.y, { type: THREE.UnsignedByteType, depthBuffer: false });
  const w = uniform(1);
  const src = texture(frame.texture);
  const prev = texture(batch[0].texture);
  const mixMat = new THREE.NodeMaterial();
  mixMat.fragmentNode = mix(prev, src, w);
  const quad = new THREE.QuadMesh(mixMat);
  const shown = texture(total[0].texture);
  const glow = keep(bloom(shown, 1, 0.45, 0.9));
  const showMat = new THREE.NodeMaterial();
  showMat.fragmentNode = toDisplay(shown.add(glow.mul(P.bloom)), P);
  const showQuad = new THREE.QuadMesh(showMat);

  // Blends `from` into `pp[0]` with weight wv and swaps, so pp[0] always holds the mean.
  function blend(pp, from, wv) {
    src.value = from.texture;
    prev.value = pp[0].texture;
    w.value = wv;
    renderer.setRenderTarget(pp[1]);
    quad.render(renderer);
    pp.reverse();
  }

  return {
    // Renders `frames` (a multiple of 16) jittered frames and returns display RGBA8 pixels.
    async shoot(frames, onFrame) {
      const batches = Math.max(1, Math.round(frames / 16));
      for (let b = 0; b < batches; b++) {
        for (let i = 0; i < 16; i++) {
          await onFrame(b * 16 + i);
          g.advance();
          renderer.setRenderTarget(frame);
          pipe.render();
          blend(batch, frame, 1 / (i + 1));
        }
        blend(total, batch[0], 1 / (b + 1));
      }
      shown.value = total[0].texture;
      renderer.setRenderTarget(out);
      showQuad.render(renderer);
      const px = await renderer.readRenderTargetPixelsAsync(out, 0, 0, size.x, size.y);
      renderer.setRenderTarget(null);
      return { width: size.x, height: size.y, pixels: packRows(px, size.x, size.y) };
    },
    dispose() {
      owned.forEach((n) => n.dispose());
      pipe.dispose();
      for (const t of [frame, ...batch, ...total, out]) t.dispose();
      mixMat.dispose();
      showMat.dispose();
    },
  };
}

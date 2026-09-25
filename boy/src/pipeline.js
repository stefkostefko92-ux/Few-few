// Film pipeline on three's RenderPipeline, at the governed internal resolution:
// scene (HDR + G-buffer MRT) → SSGI or GTAO, SSR, fire god rays → TRAA → RCAS sharpening →
// thin-lens bokeh DOF → reconstruction motion blur → bloom + anamorphic streaks → grade.
// Contact shadows (ultra) come from a depth pre-pass and shade the moonlight inside the scene pass.
import * as THREE from 'three/webgpu';
import { pass, depthPass, passTexture, texture, sample, unpackRGBToNormal, uniform, vec3, vec4, float, screenUV, builtinShadowContext } from 'three/tsl';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { sss } from 'three/addons/tsl/display/SSSNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { sceneMRT } from './tsl.js';
import { motionBlur } from './post-motion.js';
import { grade } from './post-grade.js';
import { lensGlow, anamorphic, thinLensViewZ } from './post-lens.js';

// Per-frame look parameters (set by main.js through `params`).
function frameUniforms() {
  return {
    focus: uniform(5), coc: uniform(4), maxBlur: uniform(8), exposure: uniform(1.15), time: uniform(0),
    grain: uniform(0.04), bars: uniform(0), fade: uniform(1), bloom: uniform(0.42), streak: uniform(0.35),
    aspect: uniform(16 / 9), sharp: uniform(0.8), ca: uniform(0.0025), vignette: uniform(0.45),
  };
}

// A texture node that keeps its producer in the graph (DOF's own getTextureNode() does not,
// so the effect would never render).
const producedBy = (node) => passTexture(node, node.getTextureNode().value);

// Screen-space contact shadows for the moonlight, from a depth pre-pass. The pre-pass renders
// with its own camera (kept in sync, jitter included): it is triggered from inside the scene
// pass, and the same scene + camera pair would share (and clobber) one render list.
function contactShadows(scene, camera, moon, sky, keep) {
  const preCamera = camera.clone();
  const pre = keep(depthPass(scene, preCamera, { samples: 0 }));
  pre.transparent = false;
  pre.overrideMaterial = new THREE.MeshBasicNodeMaterial({ colorWrite: false });
  const render = pre.updateBefore.bind(pre);
  pre.updateBefore = (frame) => {
    preCamera.position.copy(camera.position);
    preCamera.quaternion.copy(camera.quaternion);
    preCamera.near = camera.near;
    preCamera.far = camera.far;
    preCamera.updateMatrixWorld();
    preCamera.projectionMatrix.copy(camera.projectionMatrix);
    preCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    preCamera.layers.mask = camera.layers.mask;
    // The sky dome hugs the camera; drawn with the override material it would read as a wall.
    sky.visible = false;
    const result = render(frame);
    sky.visible = true;
    return result;
  };
  const contact = keep(sss(pre.getTextureNode('depth'), camera, moon));
  contact.maxDistance.value = 0.25;
  contact.thickness.value = 0.02;
  contact.useTemporalFiltering = true;
  return builtinShadowContext(contact.getTextureNode().sample(screenUV).r, moon);
}

export function createPipeline(renderer, W) {
  const { scene, camera } = W;
  const P = frameUniforms();
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  let owned = [];
  let blur = null;
  const keep = (n) => (owned.push(n), n);

  function build(q) {
    owned.forEach((n) => n.dispose());
    owned = [];
    const normals = q.gtao || q.ssgi || q.ssr;
    const scenePass = keep(pass(scene, camera, { samples: 0 }));
    scenePass.setMRT(sceneMRT({ normals, material: q.ssr || q.ssgi }));
    for (const name of ['normal', 'material']) if (scenePass.getMRT().has(name)) scenePass.getTexture(name).type = THREE.UnsignedByteType;
    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const velocity = scenePass.getTextureNode('velocity');
    const packed = normals ? scenePass.getTextureNode('normal') : null;
    const normal = normals ? sample((st) => unpackRGBToNormal(packed.sample(st).rgb)) : null;
    if (q.contact) scenePass.contextNode = contactShadows(scene, camera, W.moon, W.sky.mesh, keep);

    let lit = color;
    if (q.ssgi) {
      const gi = keep(ssgi(color, depth, normal, camera));
      gi.sliceCount.value = 2;
      gi.stepCount.value = 8;
      gi.radius.value = 4;
      gi.giIntensity.value = 6;
      const albedo = scenePass.getTextureNode('material');
      lit = vec4(color.rgb.mul(gi.getAONode().r).add(albedo.rgb.mul(gi.getGINode().rgb)), color.a);
    } else if (q.gtao) {
      const occ = keep(ao(depth, normal, camera));
      occ.resolutionScale = 0.5;
      occ.radius.value = 0.35;
      occ.samples.value = 12;
      occ.useTemporalFiltering = true;
      lit = vec4(color.rgb.mul(occ.getTextureNode().sample(screenUV).r.mul(0.75).add(0.25)), color.a);
    }
    if (q.ssr) {
      const material = scenePass.getTextureNode('material');
      const refl = keep(ssr(color, depth, normal, { metalnessNode: material.a, roughnessNode: packed.a, camera }));
      refl.maxDistance.value = 2.5;
      refl.thickness.value = 0.04;
      refl.quality.value = 0.45;
      refl.intensity.value = 0.55;
      refl.resolutionScale = 0.5;
      lit = lit.add(vec4(refl.rgb, 0));
    }
    if (q.godrays && W.gateLight.castShadow) {
      const rays = keep(godrays(depth, camera, W.gateLight));
      rays.raymarchSteps.value = 48;
      rays.density.value = 0.5;
      rays.maxDensity.value = 0.45;
      const soft = keep(bilateralBlur(rays.getTextureNode()));
      lit = lit.add(vec4(vec3(1.0, 0.45, 0.14).mul(soft.getTextureNode().sample(screenUV).r).mul(0.8), 0));
    }

    const aa = keep(traa(lit, depth, velocity, camera));
    let image = keep(sharpen(aa.getTextureNode(), P.sharp)).getTextureNode();
    // three's DOF samples its input inside a TSL Loop without registering it as a dependency, so
    // the producer chain (TRAA → composite → SSGI) would be set up inside that loop's stack and
    // grow it without end. DOF reads the raw texture; the grade primes the producer first.
    const primes = [image];
    if (q.dof) image = producedBy(keep(dof(texture(image.value), thinLensViewZ(scenePass, camera, P), float(1), float(1), P.maxBlur.mul(0.5))));
    blur = null;
    if (q.motionBlur > 0) {
      blur = keep(motionBlur(image, velocity, depth, camera, q.motionBlur));
      image = blur.getTextureNode();
    }
    const glow = keep(lensGlow(image, P));
    const streak = q.streaks ? keep(anamorphic(image)) : null;
    pipeline.outputNode = grade(image, glow, streak, P, primes);
    pipeline.needsUpdate = true;
  }

  return {
    P,
    setQuality: build,
    // p: { focus, coc, maxBlur, exposure, time, grain, bars, fade, bloom, streak, aspect, sharp, shutter }
    render(p) {
      for (const [k, v] of Object.entries(p)) if (P[k]) P[k].value = v;
      if (blur) blur.shutter.value = p.shutter ?? 0.5;
      pipeline.render();
    },
  };
}

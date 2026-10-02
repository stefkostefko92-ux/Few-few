// The photorealistic view: the same scene, path traced (three-gpu-pathtracer). Light bounces between the boards,
// the key light is a real round soft box, shadows and reflections come out as a camera would see them. The image
// refines while the camera rests; moving the camera shows the normal view until it rests again. This module is
// loaded only when the user turns the view on.
import * as THREE from 'three';
import { WebGLPathTracer, ShapedAreaLight } from 'three-gpu-pathtracer';
import { studioScene, disposeScene, KEY, KEY_DIR } from './viewer-studio.js';

export const TARGET_SAMPLES = 360;
const BOX = 1.8; // diameter of the key soft box, m
const REST_MS = 220; // the camera must rest this long before path tracing starts
// The bounce light of the studio corner, which the normal view folds into its environment map, comes on top here:
// measured on a front (Egger H1145), the path traced image was a third brighter. All light a quarter down keeps the
// decors at their catalogue colour, as in the normal view.
const LIGHT = 0.75;

export function photoSupported(renderer) {
  return renderer.extensions.has('EXT_color_buffer_float');
}

export class PhotoRenderer {
  constructor(viewer) {
    this.v = viewer;
    const pt = new WebGLPathTracer(viewer.renderer);
    pt.renderDelay = 0;
    pt.minSamples = 1;
    pt.fadeDuration = 250;
    pt.dynamicLowRes = false;
    pt.rasterizeScene = true;
    pt.bounces = 6;
    pt.transmissiveBounces = 2;
    pt.filterGlossyFactor = 0.35;
    pt.multipleImportanceSampling = true;
    pt.tiles.set(2, 2);
    // until the first sample: the normal (raster) view of the viewer
    pt.rasterizeSceneCallback = () => viewer.pipeline.render((k) => viewer.stage.jitter(k));
    this.pt = pt;
    // the studio for the path tracer: the same soft boxes, as a cube map
    this.envTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const env = studioScene();
    new THREE.CubeCamera(0.1, 100, this.envTarget).update(viewer.renderer, env);
    disposeScene(env);
    this.area = new ShapedAreaLight(0xffffff, 1, BOX, BOX);
    this.area.isCircular = true;
    this.active = false;
    this.restAt = 0;
  }

  // Hands the scene to the path tracer (again after any change of model, room or theme). The path tracer reads the
  // lights and the environment only here, so its soft box and cube map are switched on just for the hand-over and
  // the normal view keeps its own key light, shadows and fog.
  start() {
    const { scene, stage, camera } = this.v;
    const target = stage.key.target.position;
    const d = (stage.radius ?? 1) * 4 + 1;
    this.area.position.copy(target).addScaledVector(KEY_DIR, d);
    this.area.lookAt(target);
    // as bright as the key light on the furniture: E = L · A / d²
    this.area.intensity = (LIGHT * KEY * d * d) / ((Math.PI / 4) * BOX * BOX);
    if (!this.area.parent) scene.add(this.area);
    const saved = {
      environment: scene.environment,
      intensity: scene.environmentIntensity,
      fog: scene.fog,
    };
    scene.environment = this.envTarget.texture;
    scene.environmentIntensity = saved.intensity * LIGHT;
    scene.fog = null;
    stage.key.visible = false;
    this.area.visible = true;
    scene.updateMatrixWorld(true);
    // the path tracer keeps every texture in one array: full size only for a few, to spare GPU memory
    this.pt.textureSize.setScalar(countTextures(scene) > 6 ? 1024 : 2048);
    try {
      this.pt.setScene(scene, camera);
    } finally {
      scene.environment = saved.environment;
      scene.environmentIntensity = saved.intensity;
      scene.fog = saved.fog;
      stage.key.visible = true;
      this.area.visible = false;
    }
    this.pt.pausePathTracing = false;
    this.active = true;
    this.restAt = performance.now();
  }

  stop() {
    this.area.removeFromParent();
    this.active = false;
  }

  moved() {
    this.restAt = performance.now();
    this.pt.updateCamera();
  }

  get samples() {
    return this.pt.samples;
  }

  get done() {
    return this.pt.samples >= TARGET_SAMPLES;
  }

  // One frame: the raster view while the camera moves, otherwise one more slice of path tracing.
  render() {
    if (performance.now() - this.restAt < REST_MS) {
      if (!this.v.pipeline.done) this.v.pipeline.render((k) => this.v.stage.jitter(k));
      return false;
    }
    if (this.done) return false;
    this.pt.renderSample();
    return true;
  }

  // Draw the current image once more and hand it out as PNG (the canvas keeps no copy between frames).
  snapshot() {
    this.pt.renderSample();
    return new Promise((resolve) => this.v.renderer.domElement.toBlob(resolve, 'image/png'));
  }

  // pt.dispose() frees only its own targets and quad; the scene it uploaded (BVH, attribute, material and light
  // textures, the texture array, the environment) and the low resolution tracer stay on the GPU, and garbage
  // collection does not see GPU memory. Private fields of three-gpu-pathtracer 0.0.26 (the version is pinned).
  dispose() {
    this.stop();
    const pt = this.pt;
    const materials = new Set([pt._pathTracer?.material, pt._lowResPathTracer?.material]);
    pt.dispose();
    pt._lowResPathTracer?.dispose();
    // the background it makes from the scene's colour
    pt._colorBackground?.dispose();
    pt._internalBackground?.dispose();
    for (const m of materials) if (m) freeMaterial(m, this.v.renderer);
    this.envTarget.dispose();
  }
}

// The texture arrays (the scene's textures, IES profiles) are linked to their render target only through the setter
// they carry: three r186 does not set texture.renderTarget on an array target, and dispose() on the texture alone
// never reaches the GPU (72 MB left until garbage collection). Shrinking the target frees it, as a resize does.
function freeMaterial(material, renderer) {
  for (const { value } of Object.values(material.uniforms ?? {})) {
    if (!value || typeof value !== 'object') continue;
    if (value.isTexture && value.renderTarget) value.renderTarget.dispose();
    else if (typeof value.setTextures === 'function') {
      value.setTextures(renderer, [], 1, 1);
      value.dispose();
    } else if (typeof value.dispose === 'function') value.dispose();
    else if (value.tex?.isTexture) value.tex.dispose();
  }
  material.dispose();
}

function countTextures(scene) {
  const set = new Set();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'])
        if (m?.[key]) set.add(m[key]);
  });
  return set.size;
}

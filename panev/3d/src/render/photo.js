// Print-quality stills of the current view: the camera re-framed at the photo's aspect, `frames`
// jittered frames (sub-pixel camera offsets, key light moved across its softbox for soft shadows,
// rotating AO noise) averaged into display-ready RGBA8 pixels.
import * as THREE from 'three/webgpu';
import { frame, silhouette } from './framing.js';
import { createPhoto } from './pipeline.js';
import { aimKey, aimRoom } from './studio.js';
import { halton } from './sampling.js';

// ctx: { renderer, scene, camera, controls, P, studio, state, pause } — pause() stops the live
// view and returns the function that restarts it.
export function createStills(ctx) {
  const { renderer, scene, camera, controls, P, studio, state } = ctx;
  return async function photo({ width = 1600, height = 1200, frames = 48, softness = 0.4 } = {}) {
    const resume = ctx.pause();
    const keep = { pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), aspect: camera.aspect, pos: camera.position.clone(), room: scene.environmentRotation.clone() };
    // Framed on the pose on show: an assembly's live box excludes the rest of its adjustment range.
    const box = new THREE.Box3().setFromObject(state.object);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const dir = camera.position.clone().sub(controls.target);
    const az = aimRoom(scene, dir);
    let shot = null;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      frame(camera, silhouette(state.object), dir, { fill: 0.8 });
      shot = createPhoto(renderer, scene, camera, P);
      return await shot.shoot(frames, async (i) => {
        const [jx, jy] = halton(i + 1);
        camera.setViewOffset(width, height, jx - 0.5, jy - 0.5, width, height);
        const [lx, ly] = halton(i + 7, 5, 7);
        aimKey(studio.key, center, radius, az, [(lx - 0.5) * softness * 2, (ly - 0.5) * softness]);
      });
    } finally {
      shot?.dispose();
      camera.clearViewOffset();
      scene.environmentRotation.copy(keep.room);
      aimKey(studio.key, state.box.getCenter(new THREE.Vector3()), state.radius, state.azimuth);
      renderer.setPixelRatio(keep.pr);
      renderer.setSize(keep.size.x, keep.size.y, false);
      camera.aspect = keep.aspect;
      camera.position.copy(keep.pos);
      camera.lookAt(controls.target);
      camera.updateProjectionMatrix();
      resume();
    }
  };
}

// Photo pixels → canvas. WebGL reads rows bottom-up, WebGPU top-down.
export function photoCanvas({ width, height, pixels }, bottomUp) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const img = new ImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const from = (bottomUp ? height - 1 - y : y) * row;
    img.data.set(pixels.subarray(from, from + row), y * row);
  }
  canvas.getContext('2d').putImageData(img, 0, 0);
  return canvas;
}

// Product framing: places a long-lens camera along a view direction so the part's bounding box
// fills the frame with a margin, centred on its projected extent (like a packshot).
import * as THREE from 'three/webgpu';

const corners = (box) => {
  const out = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

// dir: vector from the part towards the camera. fill: fraction of the frame height/width used.
export function frame(camera, box, dir, { fill = 0.78, aspect = camera.aspect } = {}) {
  const d = dir.clone().normalize();
  const up = Math.abs(d.y) > 0.98 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, d).normalize();
  const camUp = new THREE.Vector3().crossVectors(d, right).normalize();
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * fill;
  const th = tv * aspect;
  const target = box.getCenter(new THREE.Vector3());
  const pts = corners(box).map((p) => p.sub(target)); // relative to the current target
  let dist = 0;
  for (let pass = 0; pass < 3; pass++) {
    dist = 0;
    for (const p of pts) {
      const f = p.dot(d);
      dist = Math.max(dist, f + Math.abs(p.dot(right)) / th, f + Math.abs(p.dot(camUp)) / tv);
    }
    // Projected extent (tangent units) of the corners seen from target + d·dist.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const z = dist - p.dot(d);
      minX = Math.min(minX, p.dot(right) / z);
      maxX = Math.max(maxX, p.dot(right) / z);
      minY = Math.min(minY, p.dot(camUp) / z);
      maxY = Math.max(maxY, p.dot(camUp) / z);
    }
    const shift = new THREE.Vector3().addScaledVector(right, ((minX + maxX) / 2) * dist).addScaledVector(camUp, ((minY + maxY) / 2) * dist);
    target.add(shift);
    for (const p of pts) p.sub(shift);
  }
  camera.position.copy(target).addScaledVector(d, dist);
  // World up keeps the orbit controls roll-free; camUp only for a camera looking straight down.
  camera.up.copy(Math.abs(d.y) > 0.98 ? camUp : new THREE.Vector3(0, 1, 0));
  camera.lookAt(target);
  camera.near = Math.max(0.005, dist * 0.05);
  camera.far = dist * 20 + 5;
  camera.updateProjectionMatrix();
  return { target, dist };
}

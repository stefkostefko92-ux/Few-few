import * as THREE from 'three';

/**
 * Stylised "Zelda BotW / Toy Story" toon helpers for the combat stage.
 *
 *   - `createCelGradient` builds a 3-step black→grey→white DataTexture
 *     that MeshToonMaterial samples as its diffuse ramp, giving the
 *     hard-band cel shading look.
 *   - `applyToon` walks a loaded glTF, lifts the base albedo + map from
 *     each PBR material, and swaps in MeshToonMaterial wired to the
 *     shared ramp. Class tint is multiplied into the diffuse so the same
 *     rig can dress every class.
 *   - `addOutline` clones every Mesh under the model, inflates each
 *     vertex along its normal, and re-fronts the clone as a BackSide
 *     basic-black material. This is the classic "back-face hull"
 *     cartoon outline — works through EffectComposer, doesn't need an
 *     extra render pass, and stays cheap.
 *   - `fitToHeight` auto-scales a model so its world-space bounding-box
 *     height matches `targetHeight` (so Soldier.glb and RobotExpressive
 *     can sit in the same scene without manual tuning).
 *
 * The whole module is dependency-free so it lives alongside the rest of
 * the combat client without touching the gameplay loop.
 */

let cachedRamp: THREE.DataTexture | null = null;

/** Build (and cache) a 3-band cel diffuse ramp. */
export function createCelGradient(): THREE.DataTexture {
  if (cachedRamp) return cachedRamp;
  // 3 cel steps: shadow, midtone, lit. Pixel values picked to keep the
  // shadow plate readable under the photoreal IBL backdrop.
  const data = new Uint8Array([60, 60, 60, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cachedRamp = tex;
  return tex;
}

interface ToonOpts {
  tint?: THREE.Color | string | number;
  /** Multiply the base albedo by `tintStrength` so the original texture still reads. 0..1 */
  tintStrength?: number;
}

/** Replace every material in a loaded model with MeshToonMaterial. */
export function applyToon(root: THREE.Object3D, opts: ToonOpts = {}): void {
  const ramp = createCelGradient();
  const tint = opts.tint != null ? new THREE.Color(opts.tint as any) : null;
  const strength = opts.tintStrength ?? 0.65;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const newMats = oldMats.map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      const base = (src.color ? src.color.clone() : new THREE.Color('#cfcfcf'));
      if (tint) {
        // Lerp toward tint so we don't completely override the source colour.
        base.lerp(tint, strength);
      }
      const toon = new THREE.MeshToonMaterial({
        color: base,
        map: (src.map as THREE.Texture) || null,
        gradientMap: ramp,
        transparent: src.transparent === true,
        opacity: src.opacity ?? 1,
        side: src.side ?? THREE.FrontSide,
      });
      // Preserve skinning + vertex colours when the source declared them.
      if ((src as any).skinning !== undefined) (toon as any).skinning = (src as any).skinning;
      if ((src as any).morphTargets !== undefined) (toon as any).morphTargets = (src as any).morphTargets;
      if (src.vertexColors) toon.vertexColors = true;
      // Free the previous material so we don't double its GPU footprint.
      src.dispose?.();
      return toon;
    });
    mesh.material = newMats.length === 1 ? newMats[0] : newMats;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/** Inflate every mesh under `root` and add a black back-face shell as an outline. */
export function addOutline(root: THREE.Object3D, thickness = 0.025, color: THREE.ColorRepresentation = '#0b0b10'): THREE.Object3D[] {
  const shells: THREE.Object3D[] = [];
  const outlineMat = new THREE.MeshBasicMaterial({
    color, side: THREE.BackSide, depthWrite: true, transparent: false,
  });
  // Collect first so we don't iterate into newly added shells.
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry) meshes.push(m);
  });
  for (const mesh of meshes) {
    const shell = new THREE.Mesh(mesh.geometry, outlineMat);
    // Copy skinning so the outline follows the rig's bones.
    const skinned = mesh as unknown as THREE.SkinnedMesh;
    if ((skinned as any).isSkinnedMesh && skinned.skeleton) {
      const skinShell = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
      skinShell.bind(skinned.skeleton, skinned.bindMatrix);
      skinShell.scale.setScalar(1 + thickness);
      // Mount the shell as a child of the original mesh's parent so its
      // world transform follows the source through any rig animation.
      mesh.parent?.add(skinShell);
      shells.push(skinShell);
      continue;
    }
    shell.scale.setScalar(1 + thickness);
    mesh.add(shell);
    shells.push(shell);
  }
  return shells;
}

/** Uniformly scale `model` so its bounding-box height matches `targetHeight` world units. */
export function fitToHeight(model: THREE.Object3D, targetHeight: number): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y <= 1e-6) return;
  const scale = targetHeight / size.y;
  model.scale.multiplyScalar(scale);
  // Re-floor on the ground plane after scaling.
  const rescaled = new THREE.Box3().setFromObject(model);
  model.position.y -= rescaled.min.y;
}

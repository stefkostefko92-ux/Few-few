import { PerspectiveCamera } from "three";
import { TABLE } from "@aso/shared";

/** Rail thickness (world units) — also sets the 3D canvas aspect. */
export const RAIL = 0.085;
/** Canvas height : width of the 3D table. */
export const SCENE_RATIO = (TABLE.h + 2 * RAIL) / (TABLE.w + 2 * RAIL);

/**
 * The 3D table's camera. Closer + lower than a plain top-down view (balls
 * occupy real pixels, the phenolic clearcoat reads), gently tilted toward the
 * near (−Z) long rail so the balls gain height/parallax while the whole table
 * stays readable for aiming. Felt (x, y) maps to scene (x − w/2, ·, y − h/2),
 * so from here the picture is the 2D table turned 180° — the pocket buttons
 * account for it (see `pocketForSlot`). Shared with the unit test that pins
 * that mapping to this exact camera.
 */
export function makeCueCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(34, 1 / SCENE_RATIO, 0.05, 60);
  camera.position.set(0, 2.35, -1.5);
  camera.lookAt(0, 0, 0.04);
  camera.updateMatrixWorld(); // project/unproject are valid before the first frame
  return camera;
}

import type { Object3D, Raycaster } from "three";

/** Пул на дъската (`userData.tk` на групата му в 3D сцената). */
export interface LudoToken {
  seat: number;
  token: number;
}

/**
 * Пулът, през който минава лъчът. Без `prefer` — най-близкият до камерата.
 * С `prefer` (напр. „мой и може да се мести“) — първият по лъча, който го
 * изпълнява, иначе най-близкият: на общо (защитено) поле чужд пул пред моя
 * поглъщаше клика и моят пул не можеше да се избере.
 */
export function pickToken(ray: Raycaster, layer: Object3D, prefer?: (tk: LudoToken) => boolean): LudoToken | null {
  let nearest: LudoToken | null = null;
  for (const hit of ray.intersectObjects(layer.children, true)) {
    let o: Object3D | null = hit.object;
    while (o && !o.userData.tk) o = o.parent;
    if (!o) continue;
    const tk = o.userData.tk as LudoToken;
    if (!prefer || prefer(tk)) return tk;
    nearest ??= tk;
  }
  return nearest;
}

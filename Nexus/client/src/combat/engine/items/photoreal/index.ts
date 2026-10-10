// Фотореалистичен материален пакет за един предмет: същите ключове като boy createMaterials()
// (steelA/steelB/goldB/brass/blade/bladeDark/iron/mail/leather/wood/gambeson/capeA/capeB/…) —
// така boy builders (шлем, оръжия, брони) се обличат в наши материали без промяна на геометрията.
import * as THREE from 'three/webgpu';
import { getBoyMaterials, type BoyMaterials } from '../boy-materials';
import type { CatalogEntry } from '../theme';
import { proceduralSets, type PbrSets } from './pbrSets';
import { planFor, type Plan } from './plan';
import { lacquer, vesselMaterials, type VesselMaterials, gemMaterial, mailMaterial, surfaceMaterial, woodMaterial } from './materials';
import { U } from './nodes';

/** Привързва плътността на карти/жили към реалния размер на предмета (най-дългата страна, м). */
export function fitTextureScale(obj: THREE.Object3D): void {
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  const d = Math.max(0.06, Math.max(size.x, size.y, size.z));
  U.texScale.value = 0.6 / d;
  U.veinScale.value = 14 / d;
}

export interface PhotoMaterials {
  M: BoyMaterials;
  plan: Plan;
  sets: PbrSets;
  gem: THREE.MeshPhysicalNodeMaterial;
  vessel: () => VesselMaterials;
  dispose(): void;
}

/** `sizeM` — характерният размер на предмета (м); тайловете на текстурите се мащабират спрямо него. */
export async function photoMaterials(entry: CatalogEntry, sizeM = 0.6): Promise<PhotoMaterials> {
  const base = await getBoyMaterials();
  const sets = proceduralSets();
  const plan = planFor(entry);
  U.texScale.value = 0.6 / sizeM;
  U.veinScale.value = 14 / sizeM;
  const own: THREE.Material[] = [];
  const mk = (m: THREE.MeshPhysicalNodeMaterial): THREE.MeshPhysicalNodeMaterial => { own.push(m); return m; };
  const leatherPlan = { ...plan.plate, kind: 'leather' as const, color: plan.leatherColor, rough: 0.6, coat: 0 };
  const cape = (): THREE.MeshPhysicalNodeMaterial => mk(surfaceMaterial(sets, { ...plan.plate, kind: 'cloth', color: plan.clothColor }, plan));
  const gem = mk(gemMaterial(plan));
  const M = {
    ...base,
    steelA: mk(surfaceMaterial(sets, plan.plate, plan)),
    steelB: mk(surfaceMaterial(sets, plan.plateDark, plan, 0.7)),
    goldB: mk(surfaceMaterial(sets, plan.trim, plan, 0)),
    brass: mk(surfaceMaterial(sets, plan.trimAlt, plan, 0)),
    blade: mk(surfaceMaterial(sets, plan.blade, plan)),
    bladeDark: mk(surfaceMaterial(sets, plan.bladeDark, plan)),
    iron: mk(surfaceMaterial(sets, plan.iron, plan, 0)),
    mail: mk(mailMaterial(sets, plan)),
    leather: mk(surfaceMaterial(sets, leatherPlan, plan, 0)),
    wood: mk(woodMaterial(sets, plan)),
    shieldFace: mk(lacquer(sets, new THREE.Color(entry.theme.primary), plan)),
    gambeson: mk(surfaceMaterial(sets, { ...plan.plate, kind: 'cloth', color: plan.leatherColor }, plan)),
    gem,
    clay: mk(new THREE.MeshPhysicalNodeMaterial({ color: 0x232a35, roughness: 0.8, sheen: 0.7, sheenColor: new THREE.Color(0x4a5a72), sheenRoughness: 0.5 })),
    capeA: cape(),
    capeB: cape(),
  } as unknown as BoyMaterials;
  const vessel = (): VesselMaterials => { const v = vesselMaterials(plan); own.push(v.glass, v.liquid, v.cork, v.wax); return v; };
  return { M, plan, sets, gem, vessel, dispose: () => own.forEach((m) => m.dispose()) };
}

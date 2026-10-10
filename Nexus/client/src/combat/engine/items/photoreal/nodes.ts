// TSL градивни блокове за фотореалистичните материали: триплан­арно семплиране на процедурните
// карти (не зависи от UV-то на геометрията — шлем, остриe и дръжка получават еднаква плътност на
// детайла) и 3D жили/руни за светещите завършеци. Плътността е относителна към размера на
// предмета (`U.texScale`), така че драскотини/пори се четат еднакво на пръстен и на меч.
import { float, vec3, normalLocal, positionLocal, texture, triplanarTexture, transformNormalToView, mx_fractal_noise_float, mx_noise_float, smoothstep, abs, Fn, uniform } from 'three/tsl';
import type * as THREE from 'three/webgpu';

/** Глобални за предмета униформи (споделени между материалите му — без прекомпилиране на шейдъри). */
export const U = {
  /** Мултипликатор на тайловете спрямо размера на предмета (1 / bbox диагонал в метри × базов фактор). */
  texScale: uniform(1),
  /** Мащаб на жилите/руните (честота в 1/метър на локалното пространство). */
  veinScale: uniform(30),
};

export function triSample(map: THREE.Texture, tile: number): ReturnType<typeof triplanarTexture> {
  return triplanarTexture(texture(map), null, null, U.texScale.div(tile), positionLocal, normalLocal);
}

/** Триплана́рна нормална карта (UDN смесване) → нормала в изглед-пространство. `strength` ~ 0.3–1.5. */
export const triNormal = (map: THREE.Texture, tile: number, strength: number) => Fn(() => {
  const p = positionLocal.mul(U.texScale.div(tile));
  const n = normalLocal;
  const w = n.abs().pow(4).toVar();
  const wn = w.div(w.x.add(w.y).add(w.z));
  const sx = texture(map, p.yz).xy.mul(2).sub(1);
  const sy = texture(map, p.zx).xy.mul(2).sub(1);
  const sz = texture(map, p.xy).xy.mul(2).sub(1);
  const dn = vec3(0, sx.x, sx.y).mul(wn.x).add(vec3(sy.y, 0, sy.x).mul(wn.y)).add(vec3(sz.x, sz.y, 0).mul(wn.z));
  return transformNormalToView(n.add(dn.mul(strength)).normalize());
})();

/** Мрежа от тънки светещи жили (нули на 3D шум) — [0..1], 1 в центъра на жилата. */
export const veinMask = (thickness = 0.06) => Fn(() => {
  const p = positionLocal.mul(U.veinScale);
  const a = abs(mx_fractal_noise_float(p, 3, 2, 0.5));
  const b = abs(mx_noise_float(p.mul(1.7).add(vec3(7.3, 1.1, 4.2))));
  const line = float(1).sub(smoothstep(float(0), float(thickness), a));
  const line2 = float(1).sub(smoothstep(float(0), float(thickness * 0.7), b)).mul(0.6);
  return line.add(line2).clamp(0, 1);
})();

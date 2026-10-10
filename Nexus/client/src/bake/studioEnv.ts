// Студийна HDR среда за продуктов рендер: тъмна стая с няколко софтбокса (ключ, два контурни
// ленти, горна лента, заливка, топъл отскок отдолу). Отраженията по метала са дълги, чисти
// светли ленти — типичният „продуктов кадър", а не плоска RoomEnvironment кутия. Всичко е
// излъчващи мрежи → PMREM, нула текстури.
import * as THREE from 'three/webgpu';

interface Box { pos: [number, number, number]; size: [number, number]; rgb: [number, number, number]; power: number }

// Координати в метри около предмета; камерата гледа от +Z/+Y. Светлините са HDR (power > 1).
const BOXES: Box[] = [
  { pos: [-3.2, 3.4, 3.0], size: [3.6, 3.0], rgb: [1.0, 0.9, 0.76], power: 9 },      // ключ: топъл, голям, горе-ляво-отпред
  { pos: [4.4, 1.4, -1.8], size: [0.9, 5.0], rgb: [0.55, 0.86, 1.0], power: 16 },    // контур дясно-назад (студен, циан)
  { pos: [-4.4, 0.8, -2.2], size: [0.9, 5.0], rgb: [1.0, 0.82, 0.58], power: 11 },   // контур ляво-назад (топъл, златен)
  { pos: [0, 5.2, 0.2], size: [4.5, 1.1], rgb: [0.95, 0.97, 1.0], power: 7 },         // горна лента
  { pos: [3.6, 0.6, 3.6], size: [3.0, 3.0], rgb: [0.85, 0.9, 1.0], power: 3.2 },      // заливка отпред-дясно
  { pos: [0.4, 1.2, 6.5], size: [9, 6.5], rgb: [0.8, 0.86, 1.0], power: 1.1 },       // голям мек заливащ панел зад камерата
  { pos: [0, -3.6, 1.0], size: [6, 3.0], rgb: [0.78, 0.6, 0.38], power: 0.9 },       // топъл отскок отдолу
];

export function buildStudioEnvScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.062, 0.08), side: THREE.BackSide }));
  scene.add(room);
  for (const b of BOXES) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(b.rgb[0] * b.power, b.rgb[1] * b.power, b.rgb[2] * b.power), side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.size[0], b.size[1]), mat);
    m.position.set(...b.pos);
    m.lookAt(0, 0.4, 0);
    scene.add(m);
  }
  return scene;
}

export async function buildStudioEnvMap(renderer: THREE.WebGPURenderer): Promise<THREE.Texture> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = await (pmrem as unknown as { fromSceneAsync(s: THREE.Scene, sigma: number): Promise<THREE.WebGLRenderTarget> }).fromSceneAsync(buildStudioEnvScene(), 0.02);
  return rt.texture;
}

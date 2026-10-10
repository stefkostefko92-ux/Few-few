// Студийната сцена за изпичане: HDR среда от софтбоксове + ключова насочена светлина със
// сенки (само за самосянка — отражението носи средата) + камера, кадрирана по проектирания
// bbox. Предметът се върти по диагонал (роля около оста на камерата) за вертикалните оръжия.
import * as THREE from 'three/webgpu';
import { frameCamera, VIEW_DIR } from '../combat/engine/items/renderScene';

export interface BakeStudio {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dispose(): void;
}

export function buildBakeStudio(object: THREE.Object3D, envMap: THREE.Texture, opts: { tiltDeg: number; margin: number; envIntensity?: number }): BakeStudio {
  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = opts.envIntensity ?? 1.0;

  const pivot = new THREE.Group();
  pivot.add(object);
  scene.add(pivot);

  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  pivot.position.copy(center);
  if (opts.tiltDeg) pivot.quaternion.setFromAxisAngle(VIEW_DIR, THREE.MathUtils.degToRad(opts.tiltDeg));
  pivot.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.01, 40);
  frameCamera(camera, pivot, opts.margin);

  // Ключ със сенки: пасва на обема на предмета (ортографска сянка), мека ръба (radius).
  const sphere = new THREE.Box3().setFromObject(pivot).getBoundingSphere(new THREE.Sphere());
  const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
  key.position.copy(sphere.center).add(new THREE.Vector3(-2.2, 3.0, 2.4).normalize().multiplyScalar(sphere.radius * 6));
  key.target.position.copy(sphere.center);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -sphere.radius * 1.3; sc.right = sphere.radius * 1.3; sc.top = sphere.radius * 1.3; sc.bottom = -sphere.radius * 1.3;
  sc.near = sphere.radius * 3; sc.far = sphere.radius * 9;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = sphere.radius * 0.01;
  scene.add(key, key.target);

  return { scene, camera, dispose: () => { key.dispose(); } };
}

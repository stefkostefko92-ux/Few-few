import { Vector2, Vector3, type Camera } from "three";

/**
 * Екран ↔ сцена за 3D дъските. Едно и също съответствие „правоъгълник на
 * платното ↔ NDC“ и за избора с клик (raycast), и за тестовата кука
 * `screenPoint` — така точката, която тестът кликва, е точно полето, което
 * сцената ще разпознае.
 */

/** Client координати (напр. от PointerEvent) → NDC (−1..1) спрямо платното. */
export function clientToNdc(clientX: number, clientY: number, rect: DOMRect): Vector2 {
  return new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
}

/** Точка от света → client координати върху платното, или null извън кадър. */
export function worldToClient(point: Vector3, camera: Camera, rect: DOMRect): { x: number; y: number } | null {
  camera.updateMatrixWorld();
  const v = point.clone().project(camera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

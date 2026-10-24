import { describe, expect, it } from "vitest";
import { OrthographicCamera, Plane, Raycaster, Vector3 } from "three";
import { clientToNdc, worldToClient } from "./projection";

/** Камера като на дъските: ортографска, отгоре под ъгъл. */
function boardCamera(): OrthographicCamera {
  const cam = new OrthographicCamera(-5.6, 5.6, 4.6, -4.6, 0.1, 200);
  cam.position.set(0, 8, 8);
  cam.lookAt(0, -0.3, 0);
  return cam;
}

const rect = { left: 120, top: 260, width: 553, height: 453 } as DOMRect;

describe("projection (тестовата кука screenPoint ↔ избор с клик)", () => {
  it("точка от дъската → екран → лъч → пак същата точка (всички 64 полета)", () => {
    const cam = boardCamera();
    const plane = new Plane(new Vector3(0, 1, 0), -0.18);
    const ray = new Raycaster();
    for (let i = 0; i < 64; i++) {
      const world = new Vector3((i % 8) - 3.5, 0.18, Math.floor(i / 8) - 3.5);
      const p = worldToClient(world, cam, rect)!;
      expect(p).not.toBeNull();
      expect(p.x).toBeGreaterThanOrEqual(rect.left);
      expect(p.x).toBeLessThanOrEqual(rect.left + rect.width);
      ray.setFromCamera(clientToNdc(p.x, p.y, rect), cam);
      const hit = new Vector3();
      expect(ray.ray.intersectPlane(plane, hit)).not.toBeNull();
      expect(hit.x).toBeCloseTo(world.x, 6);
      expect(hit.z).toBeCloseTo(world.z, 6);
    }
  });

  it("точка извън кадъра → null (тестът не кликва на сляпо)", () => {
    expect(worldToClient(new Vector3(40, 0, 0), boardCamera(), rect)).toBeNull();
  });

  it("clientToNdc: ъглите на платното са ±1", () => {
    const tl = clientToNdc(rect.left, rect.top, rect);
    const br = clientToNdc(rect.left + rect.width, rect.top + rect.height, rect);
    expect([tl.x, tl.y]).toEqual([-1, 1]);
    expect([br.x, br.y]).toEqual([1, -1]);
  });
});

import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Vector2 } from "three";
import { pickToken } from "./pickToken";

/** Пул като в сцената: група с userData.tk и тяло-дете. */
function pawn(seat: number, token: number, z: number): Group {
  const g = new Group();
  g.userData.tk = { seat, token };
  const body = new Mesh(new BoxGeometry(0.6, 0.8, 0.6), new MeshBasicMaterial());
  body.position.y = 0.4;
  g.add(body);
  g.position.set(0, 0, z);
  return g;
}

function rayThroughCentre(): Raycaster {
  // Камерата е откъм +z: пулът на z=0.3 стои ПРЕД пула на z=0.
  const cam = new OrthographicCamera(-3, 3, 3, -3, 0.1, 50);
  cam.position.set(0, 0.4, 10);
  cam.lookAt(0, 0.4, 0);
  cam.updateMatrixWorld();
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(0, 0), cam);
  return ray;
}

describe("pickToken (Не се сърди човече, клик по 3D пул)", () => {
  const layer = new Group();
  layer.add(pawn(1, 0, 0.3)); // чужд пул отпред
  layer.add(pawn(0, 2, 0)); // моят пул зад него, на същото поле
  layer.updateMatrixWorld(true);
  const ray = rayThroughCentre();

  it("без предпочитание връща най-близкия пул", () => {
    expect(pickToken(ray, layer)).toEqual({ seat: 1, token: 0 });
  });

  it("моят пул, който може да се мести, печели пред чуждия пред него", () => {
    expect(pickToken(ray, layer, (tk) => tk.seat === 0 && tk.token === 2)).toEqual({ seat: 0, token: 2 });
  });

  it("никой не отговаря на предпочитанието → най-близкият (не null)", () => {
    expect(pickToken(ray, layer, () => false)).toEqual({ seat: 1, token: 0 });
  });

  it("лъч покрай всички пулове → null", () => {
    const miss = new Raycaster();
    const cam = new OrthographicCamera(-3, 3, 3, -3, 0.1, 50);
    cam.position.set(0, 0.4, 10);
    cam.lookAt(0, 0.4, 0);
    cam.updateMatrixWorld();
    miss.setFromCamera(new Vector2(0.9, 0.9), cam);
    expect(pickToken(miss, layer)).toBeNull();
  });
});

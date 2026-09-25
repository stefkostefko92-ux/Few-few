import { BackSide, BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, Scene } from "three";

/**
 * Рейвънхолд image-based lighting: a procedural night hall PMREM-filtered into
 * `scene.environment` for every 3D board (replacing the neutral studio room).
 * Marble, obsidian, brass and lacquer now mirror what the players "sit" in —
 * two wall torches, a candle chandelier overhead and tall moonlit windows —
 * so the 3D pieces carry the same firelight as the hall drawn behind them.
 *
 * Built like three's RoomEnvironment: a dark stone box lit by emissive panels
 * (MeshBasicMaterial colours scaled above 1 act as area lights for PMREM).
 */
function emitter(r: number, g: number, b: number, k: number): MeshBasicMaterial {
  const m = new MeshBasicMaterial();
  m.color.setRGB(r * k, g * k, b * k);
  return m;
}

export class HallEnvironment extends Scene {
  constructor() {
    super();
    this.name = "RavenholdHall";
    const box = new BoxGeometry();
    box.deleteAttribute("uv");

    // The hall itself: rough dark stone, barely lit.
    const room = new Mesh(box, new MeshStandardMaterial({ side: BackSide, color: 0x3b342d, roughness: 1 }));
    room.position.set(0, 10, 0);
    room.scale.set(34, 26, 34);
    this.add(room);
    // A low warm key so the stone walls read in the reflections.
    const fill = new PointLight(0xffb070, 260, 34, 2);
    fill.position.set(0, 14, 0);
    this.add(fill);

    const warm: [number, number, number] = [1.0, 0.46, 0.16];
    const moon: [number, number, number] = [0.36, 0.5, 0.85];
    // Two wall torches (left/right), the strongest, warmest sources.
    for (const [x, z] of [[-16, 3], [16, -3]] as const) {
      const torch = new Mesh(box, emitter(...warm, 70));
      torch.position.set(x, 6, z);
      torch.scale.set(0.12, 1.4, 1.1);
      this.add(torch);
    }
    // Candle chandelier overhead: a ring of warm points for top highlights.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = new Mesh(box, emitter(1.0, 0.62, 0.3, 34));
      c.position.set(Math.cos(a) * 3.2, 21, Math.sin(a) * 3.2);
      c.scale.set(0.35, 0.5, 0.35);
      this.add(c);
    }
    // Tall moonlit windows on the far wall: long cold rim lights.
    for (const x of [-7, 7]) {
      const w = new Mesh(box, emitter(...moon, 9));
      w.position.set(x, 13, -16.8);
      w.scale.set(2.6, 9, 0.1);
      this.add(w);
    }
  }

  dispose(): void {
    const res = new Set<{ dispose: () => void }>();
    this.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        res.add(m.geometry);
        res.add(m.material as MeshBasicMaterial);
      }
    });
    for (const r of res) r.dispose();
  }
}

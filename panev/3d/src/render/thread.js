// Rolled ISO metric thread, M10 × 1.5 (6g): the 60° profile with its flat crest and round root,
// swept along the helix; a 45° chamfer at the end of the bolt and the run-out into the blank
// diameter (about the pitch diameter, as a rolled thread leaves it) before the head. A mirrored
// assembly gets the left-hand sweep, so the thread still reads right-handed on screen.
// Millimetres along +Y; indexed strip with smoothed normals and UVs in millimetres.
import * as THREE from 'three/webgpu';

const TAN60 = Math.sqrt(3);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// One pitch of the external profile, [axial mm from a crest centre, radius]: crest flat P/8, flanks
// at 60°, a root arc tangent to both flanks at the minor diameter (ISO 68-1, 965-1: d3 = 8.160).
export function threadProfile({ P = 1.5, major = 9.9, minor = 8.16 } = {}) {
  const R = major / 2;
  const R3 = minor / 2;
  const ch = P / 16;
  const rho = TAN60 * (P / 2 - ch) - (R - R3);
  const pts = [[0, R], [ch, R]];
  for (let i = 0; i <= 6; i++) {
    const phi = ((-150 + 20 * i) * Math.PI) / 180;
    pts.push([P / 2 + rho * Math.cos(phi), R3 + rho + rho * Math.sin(phi)]);
  }
  pts.push([P - ch, R], [P, R]);
  return { pts, R, R3, rho };
}

// Thread from y = `from` (the bolt's end) to y = `to` (where the run-out has reached `blank`).
export function externalThread({ P = 1.5, from, to, left = false, segments = 40, blank = 4.52, runout = 2.4, tip = 3.9 }) {
  const { pts, R } = threadProfile({ P });
  const rows = pts.length;
  const turns = Math.ceil((to - from) / P) + 2;
  const cols = turns * segments + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const sign = left ? -1 : 1;
  for (let c = 0; c < cols; c++) {
    const t = (c / segments) * Math.PI * 2;
    const base = from - P + (P * c) / segments;
    for (let j = 0; j < rows; j++) {
      let y = base + pts[j][0];
      let r = pts[j][1];
      r += (blank - r) * smooth(to - runout, to, y);
      r = Math.min(r, tip + Math.max(0, y - from));
      if (y < from) y = from;
      if (y > to) {
        y = to;
        r = blank;
      }
      const k = c * rows + j;
      pos[k * 3] = sign * r * Math.sin(t);
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = r * Math.cos(t);
      uv[k * 2] = t * R;
      uv[k * 2 + 1] = y;
    }
  }
  const index = [];
  for (let c = 0; c < cols - 1; c++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = c * rows + j;
      const b = (c + 1) * rows + j;
      // Outward-facing for the right-hand sweep; the mirrored sweep turns the other way round.
      if (left) index.push(a, a + 1, b, b, a + 1, b + 1);
      else index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

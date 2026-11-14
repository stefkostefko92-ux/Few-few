// Furniture along several walls (a Г or П kitchen) is built wall by wall, each wall a straight row in its own
// coordinates — the run: x along the wall, left to right as one faces it, y up, z out of the wall into the room — and
// model.runs says where each run stands in the room: turned a quarter at a time about the vertical (as three.js turns a
// group, rotation.y = turn · 90°) and moved by (dx, dz). The parts, groups and symbols stay in their run's coordinates
// and carry its id: what the shop cuts and drills is the same on any wall, the 3D draws each run in a group turned into
// place, the elevations of the walls are drawn from the run as it is. What needs the room — the plan, the checks that
// two walls do not run into each other — takes the world from here. A model without runs is already in the room.

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];
const quarter = (turn) => ((turn % 4) + 4) % 4;

// A point of a run in the room. +0 keeps a turned zero a plain zero.
export function turnPoint([x, y, z], { turn = 0, dx = 0, dz = 0 } = {}) {
  const k = quarter(turn);
  return [x * COS[k] + z * SIN[k] + dx + 0, y, -x * SIN[k] + z * COS[k] + dz + 0];
}

// A direction ('+x' … '-z') of a run in the room.
export function turnDir(dir, turn) {
  const v = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[dir[1]].map((c) => (dir[0] === '-' ? -c : c));
  const [x, y, z] = turnPoint(v, { turn });
  const axis = x ? 'x' : y ? 'y' : 'z';
  return `${(x || y || z) > 0 ? '+' : '-'}${axis}`;
}

export function worldBox(box, run) {
  if (!run) return box;
  const a = turnPoint(box.min, run);
  const b = turnPoint(box.max, run);
  return { min: a.map((v, i) => Math.min(v, b[i])), max: a.map((v, i) => Math.max(v, b[i])) };
}

export const runOf = (model, id) => (id === undefined ? null : model.runs?.find((r) => r.id === id) ?? null);

// The parts with their boxes in the room (copies; the parts themselves when the model has no runs).
export function worldParts(model) {
  if (!model.runs?.length) return model.parts;
  return model.parts.map((p) => (p.run === undefined ? p : { ...p, box: worldBox(p.box, runOf(model, p.run)) }));
}

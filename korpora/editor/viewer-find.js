// Finding a board of the model by where it stands, for what the 3D hangs on it (the fixed member of a drawer slide).
// In a Г or П kitchen every wall has its own coordinates (engine/transform.js): the same x and y on another wall is
// another cabinet, so the search stays in the wall — the run — of what it is for.

// The carcass side or partition with a face at x (mm) that reaches the height y, in the run `run`.
export function panelAt(model, x, y, run) {
  return (
    model.parts.find(
      (q) =>
        q.run === run &&
        (q.role === 'side' || q.role === 'partition') &&
        (Math.abs(q.box.max[0] - x) < 1 || Math.abs(q.box.min[0] - x) < 1) &&
        y >= q.box.min[1] &&
        y <= q.box.max[1],
    ) ?? null
  );
}

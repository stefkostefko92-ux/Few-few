// What going back (or forth) to `step` gives, from the spec now: a step of the constructor ('grid') gives back its
// grid alone — what the rail changed since stays; any other step ('spec': the type, „reset“, „Персонализирай“) its
// whole spec.
export const restored = (step, now) =>
  step.kind === 'grid' && step.spec.type === 'custom' && now.type === 'custom'
    ? { ...now, grid: step.spec.grid }
    : step.spec;

// Undo and redo: steps { spec, kind } — the spec before the step and what kind of step it was — at most `limit` back.
// undo(current) returns the step to go back to and keeps `current` (with that step's kind) for redo; a new step
// forgets what could be redone; drop() forgets the last step (one the engine could not build).
export function createHistory(limit = 100) {
  const back = [];
  const ahead = [];
  return {
    push(step) {
      back.push(step);
      if (back.length > limit) back.shift();
      ahead.length = 0;
    },
    undo(current) {
      const step = back.pop();
      if (!step) return null;
      ahead.push({ spec: current, kind: step.kind });
      return step;
    },
    redo(current) {
      const step = ahead.pop();
      if (!step) return null;
      back.push({ spec: current, kind: step.kind });
      return step;
    },
    drop() {
      back.pop();
    },
    get canUndo() {
      return back.length > 0;
    },
    get canRedo() {
      return ahead.length > 0;
    },
  };
}

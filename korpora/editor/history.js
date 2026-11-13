// Undo and redo for the constructor: snapshots of the spec, at most `limit` steps back. undo(current) returns the
// snapshot to go back to and keeps `current` for redo; any new step forgets what could be redone.
export function createHistory(limit = 100) {
  const back = [];
  const ahead = [];
  return {
    push(snapshot) {
      back.push(snapshot);
      if (back.length > limit) back.shift();
      ahead.length = 0;
    },
    undo(current) {
      if (!back.length) return null;
      ahead.push(current);
      return back.pop();
    },
    redo(current) {
      if (!ahead.length) return null;
      back.push(current);
      return ahead.pop();
    },
    get canUndo() {
      return back.length > 0;
    },
    get canRedo() {
      return ahead.length > 0;
    },
  };
}

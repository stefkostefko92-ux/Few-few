/**
 * Untrusted-input guard for game actions (dependency-free so it is unit-testable).
 */
/** Real actions are shallow (a cue shot is ~2 levels); anything deeper is abuse. */
export const MAX_ACTION_DEPTH = 16;
/** …and small in node count (the socket cap is bytes, not structure). */
const MAX_ACTION_NODES = 512;

/**
 * Iterative (no recursion → cannot overflow the stack) bound on an untrusted
 * client action's nesting depth and size. A 6 KB `[[[…]]]` payload used to make
 * `stable()` recurse ~3000 frames deep and throw RangeError synchronously in the
 * socket listener → uncaughtException → process.exit(1), killing every live
 * match on the node. Checked BEFORE the action touches any engine code.
 */
export function actionShapeOk(v: unknown): boolean {
  const stack: Array<[unknown, number]> = [[v, 1]];
  let nodes = 0;
  while (stack.length > 0) {
    const [cur, depth] = stack.pop()!;
    if (++nodes > MAX_ACTION_NODES) return false;
    if (cur === null || typeof cur !== "object") continue;
    if (depth > MAX_ACTION_DEPTH) return false;
    for (const child of Array.isArray(cur) ? cur : Object.values(cur as Record<string, unknown>)) {
      stack.push([child, depth + 1]);
    }
  }
  return true;
}

// walk-skip.mjs — папки, в които инструмент, обхождащ дървото, не влиза.
//
// Защо (21.11.2026): `.claude/worktrees/` държи работните копия на агентите (git worktree, в .gitignore) —
// всяко е цяло репо, а със зависимости и 11 GB. review-check и discord-lint обхождат и папки с точка и
// влизаха в тях: 40 s вместо секунди, тестът „жив и четим“ (таван 90 s) падаше. Копията не са наш код.
import { basename } from "node:path";

/** Работните копия на агентите: `<…>/.claude/worktrees`. */
export function isAgentWorktrees(parentDir, name) {
  return name === "worktrees" && basename(parentDir) === ".claude";
}

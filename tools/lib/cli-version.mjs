// cli-version.mjs — минималната версия на Claude Code, под която агентският слой не тръгва.
//
// 2.1.319 (06.11.2026, https://code.claude.com/docs/en/changelog.md): „Fixed a sandbox escape when creating a
// worktree“ и „Fixed a case where a `sed` command could skip the permission check in accept-edits and auto
// mode“. Живият гейт и вълните пускат агенти в отделни worktree-та — под тази версия изолацията им е дупка.
// Вдига се само с източник от changelog-а; договорът е в tools/agents/harness-contracts.json.
export const MIN_CLI = "2.1.319";

export function parseCliVersion(out) {
  const m = String(out || "").match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? m[0] : null;
}

export function cliAtLeast(v, min = MIN_CLI) {
  const a = String(v).split(".").map(Number), b = String(min).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}

/** "" = наред; иначе причината (за съобщение и отказ). Неизвестна версия също е отказ — fail-closed. */
export function minCliProblem(versionOutput, min = MIN_CLI) {
  const v = parseCliVersion(versionOutput);
  if (!v) return `неизвестна версия на Claude Code („${String(versionOutput).trim().slice(0, 40)}“) — нужна е ≥ ${min}`;
  if (!cliAtLeast(v, min)) return `Claude Code ${v} < ${min}: под нея създаването на worktree може да избяга от sandbox-а — обнови (claude update)`;
  return "";
}

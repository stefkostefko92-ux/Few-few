// frontmatter-fields.mjs — позволените полета и стойности във frontmatter на субагент.
//
// Защо (проучване 31.10.2026, AI-джията): грешно изписано поле (`omitClaudeMD`, `efort`) харнесът
// пропуска тихо — пише го само в debug лога като „does not recognize or apply“
// (https://code.claude.com/docs/en/sub-agents, таблицата „Supported frontmatter fields“). Агентът
// тръгва с подразбиране, а ние мислим, че е настроен. oversee го прави твърда грешка.
// anthropic-watch следи страницата; ново поле в доковете → тук.

export const KNOWN_FIELDS = new Set([
  "name", "description", "tools", "disallowedTools", "model", "permissionMode", "maxTurns", "autoCompactWindow",
  "skills", "mcpServers", "hooks", "memory", "background", "omitClaudeMd", "effort", "isolation", "color",
  "initialPrompt", "experimental",
]);

const ENUM = {
  effort: /^(low|medium|high|xhigh|max|\d+)$/,
  model: /^(sonnet|opus|haiku|fable|inherit|claude-[a-z0-9.-]+)$/,
  permissionMode: /^(default|acceptEdits|auto|dontAsk|bypassPermissions|plan)$/,
  memory: /^(user|project|local)$/,
  isolation: /^worktree$/,
  background: /^(true|false)$/,
  omitClaudeMd: /^(true|false)$/,
  maxTurns: /^[1-9]\d*$/,
};

/** Проблеми във frontmatter блока (без разделителите ---). */
export function frontmatterIssues(fmBlock) {
  const issues = [];
  for (const m of String(fmBlock).matchAll(/^([A-Za-z][\w-]*):[ \t]*(.*)$/gm)) {
    const [, key, raw] = m;
    const val = raw.trim().replace(/^["']|["']$/g, "");
    if (!KNOWN_FIELDS.has(key)) { issues.push(`непознато поле „${key}“ — харнесът го пропуска тихо`); continue; }
    if (ENUM[key] && val && !ENUM[key].test(val)) issues.push(`„${key}: ${val}“ — невалидна стойност`);
    if (key === "autoCompactWindow" && val) {
      // `200k` харнесът чете като 200 и тихо игнорира (sub-agents.md); само цяло число 100000–1000000.
      const n = /^\d+$/.test(val) ? Number(val) : NaN;
      if (!(n >= 100000 && n <= 1000000)) issues.push(`„autoCompactWindow: ${val}“ — цяло число от 100000 до 1000000`);
    }
  }
  return issues;
}

#!/usr/bin/env node
// guard-dangerous.mjs — PreToolUse(Bash) предпазител. Блокира САМО еднозначно катастрофални команди
// (трият системата/диска). Всичко останало минава — не пречим на нормалната работа. **Fail-open:**
// всяка вътрешна грешка → разрешаваме (хук-бъг никога не спира работата).
//
// Договор (Claude Code): stdin = JSON с {tool_name, tool_input:{command}}. За блок → exit 2 + причина
// на stderr. Разрешаване → exit 0. Регистриран в settings.json като PreToolUse matcher "Bash".

// Катастрофални, near-zero-FP шаблони (не хващат обикновени git/node/npm/rm на конкретен файл).
export const CATASTROPHIC = [
  { re: /rm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(-{2}no-preserve-root\s+)?["']?(\/(\s|$|\*|["'])|~(\s|\/|$|["']))/i, why: "rm -rf на корен/дом" },
  { re: /rm\s+-[a-z]*\s+--no-preserve-root/i, why: "rm --no-preserve-root" },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: "fork bomb" },
  { re: /\bmkfs(\.\w+)?\b/i, why: "форматиране на файлова система (mkfs)" },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|vd|hd|disk)/i, why: "dd върху суров диск" },
  { re: />\s*\/dev\/(sd|nvme|vd|hd)[a-z0-9]/i, why: "запис върху суров диск" },
  { re: /chmod\s+-[a-z]*R[a-z]*\s+0*777\s+\/(\s|$)/i, why: "chmod -R 777 на корен" },
  { re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba)?sh\b/i, why: "изтегляне и изпълнение на отдалечен скрипт (curl|sh)" },
  { re: /\bgit\b[^\n]*\bpush\b[^\n]*--force\b(?![^\n]*--force-with-lease)[^\n]*\b(origin\s+)?(main|master)\b/i, why: "git push --force към main (ползвай --force-with-lease към feature клон)" },
];

export function isCatastrophic(cmd) {
  const s = String(cmd || "");
  for (const p of CATASTROPHIC) if (p.re.test(s)) return p.why;
  return null;
}

// CLI (fail-open навсякъде)
if (import.meta.url === `file://${process.argv[1]}`) {
  let buf = "";
  process.stdin.on("data", (d) => (buf += d));
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(buf || "{}");
      const cmd = payload?.tool_input?.command;
      if (!cmd) process.exit(0);
      const why = isCatastrophic(cmd);
      if (why) {
        process.stderr.write(`⛔ Блокирано от guard-dangerous: ${why}. Ако наистина искаш това — направи го ръчно извън агента.\n`);
        process.exit(2);
      }
      process.exit(0);
    } catch {
      process.exit(0); // fail-open — не чупим работата заради хук-грешка
    }
  });
  process.stdin.on("error", () => process.exit(0));
}

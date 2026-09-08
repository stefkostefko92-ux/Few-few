#!/usr/bin/env node
// guard-dangerous.mjs — PreToolUse(Bash) предпазител. Блокира САМО еднозначно катастрофални команди
// (трият системата/диска). Всичко останало минава — не пречим на нормалната работа. **Fail-open:**
// всяка вътрешна грешка → разрешаваме (хук-бъг никога не спира работата).
//
// Договор (Claude Code): stdin = JSON с {tool_name, tool_input:{command}}. За блок → exit 2 + причина
// на stderr. Разрешаване → exit 0. Регистриран в settings.json като PreToolUse matcher "Bash".

import { sanitize } from "./guard-secrets.mjs"; // невидими знаци не крият команда (red-team 2026-09-08)

// Катастрофални, near-zero-FP шаблони (не хващат обикновени git/node/npm/rm на конкретен файл).
export const CATASTROPHIC = [
  { re: /rm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(-{2}no-preserve-root\s+)?["']?(\/(\s|$|\*|["'])|(?:~|\$\{?HOME\}?)\/?(\s|$|\*|["']))/i, why: "rm -rf на корен/дом" },
  { re: /rm\s+-[a-z]*\s+--no-preserve-root/i, why: "rm --no-preserve-root" },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: "fork bomb" },
  { re: /\bmkfs(\.\w+)?\b/i, why: "форматиране на файлова система (mkfs)" },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|vd|hd|disk)/i, why: "dd върху суров диск" },
  { re: />\s*\/dev\/(sd|nvme|vd|hd)[a-z0-9]/i, why: "запис върху суров диск" },
  { re: /chmod\s+-[a-z]*R[a-z]*\s+0*777\s+\/(\s|$)/i, why: "chmod -R 777 на корен" },
  // Red-team F1: `[^\n|]*` забраняваше МЕЖДИНЕН pipe, затова `curl … | base64 -d | sh` минаваше.
  // Разширено и по обвивка/интерпретатор, и по варианта БЕЗ pipe (`-o файл && sh файл`).
  { re: /\b(curl|wget)\b[^\n]*\|\s*[^\n]*\b(sudo\s+)?((ba|z|k|da|a)?sh|python3?|node|perl|ruby|php)\b/i, why: "изтегляне и изпълнение на отдалечен скрипт (curl|sh)" },
  // `-so` е комбинирани флагове — затова `(-o|-O)` с интервал не хващаше най-честия вариант.
  { re: /\b(curl|wget)\b[^\n]*\s-[a-zA-Z]*[oO]\s*\S+[^\n]*(&&|;|\|\|)\s*(sudo\s+)?((ba|z|k|da|a)?sh|python3?|node|perl|ruby|php)\b/i, why: "изтегляне във файл и изпълнението му (curl -o … && sh)" },
  // Red-team 2026-07-30 (F5b): шаблонът искаше ДЪЛГИЯ флаг `--force`, затова най-краткият и най-често
  // писан вариант `git push -f origin main` минаваше необезпокоявано. Сега и `-f`, и `--force`.
  // КОМАНДНА ПОЗИЦИЯ (същият урок като FOREIGN_PUSH в guard-exfil): без котва шаблонът съвпада и когато
  // командата е само СПОМЕНАТА в текстов аргумент. Хванато на живо 2026-09-08 — записът в дневника на
  // грешките, чието описание цитираше „git push origin +main", беше блокиран от самия предпазител.
  { re: /(?:^|[;&|]\s*|\n\s*)(?:sudo\s+)?git\b[^\n;&|]*\bpush\b[^\n;&|]*(--force\b|\s-[a-zA-Z]*f\b)(?![^\n;&|]*--force-with-lease)[^\n;&|]*\b(origin\s+)?(main|master)\b/i, why: "git push --force/-f към main (ползвай --force-with-lease към feature клон)" },
  // Red-team 2026-09-08: третият правопис на force push — `+` пред refspec-а (`git push origin +main`,
  // `+HEAD:main`, `+refs/heads/main`) е force по git спецификация, без нито един флаг. Минаваше.
  { re: /(?:^|[;&|]\s*|\n\s*)(?:sudo\s+)?git\b[^\n;&|]*\bpush\b[^\n;&|]*\s\+(refs\/heads\/|[\w/.-]+:)?(main|master)\b/i, why: "git push с +refspec към main (това е force push без флаг)" },
  // Red-team 2026-09-08: `find / -delete` (и `find / … -exec rm`) изтрива системата също толкова
  // сигурно, колкото `rm -rf /`, но без нито един `rm -rf`. Само от КОРЕНА — `find ./build -delete` е нормално.
  { re: /\bfind\s+\/\s[^\n]*(-delete\b|-exec\s+rm\b)/i, why: "find от корена с -delete/-exec rm (изтрива системата)" },
  // Red-team 2026-09-08: унищожаване на диск без dd/mkfs — wipefs, shred, blkdiscard, sgdisk --zap-all,
  // parted mklabel. Изискваме суров /dev/ диск: `shred файл.txt` е нормално.
  { re: /\b(wipefs|shred|blkdiscard|sgdisk\s+(-Z|--zap-all)|parted\s+\S+\s+mklabel|nvme\s+format)\b[^\n]*\/dev\/(sd|nvme|vd|hd|disk|mmcblk)/i, why: "унищожаване на суров диск (wipefs/shred/blkdiscard/sgdisk)" },
];

// Red-team 2026-07-30 (F5a): `rm -rf /` се хващаше, но `rm -r -f /` — НЕ, защото шаблонът искаше r и f
// в ЕДНА флагова група. Разделените флагове са също толкова катастрофални и се пишат също толкова лесно.
// Затова флаговете се събират от ВСИЧКИ групи и се проверяват заедно (регекс за целта + логика за флагове).
// Red-team 2026-09-08: домът има ТРИ правописа — `~`, `$HOME` и `${HOME}` (с или без кавички).
// Шаблонът знаеше само `~`, затова `rm -rf $HOME` и `rm -rf "$HOME"/` минаваха с изход 0.
export function isCatastrophicRm(cmd) {
  // Домът е САМИЯТ дом (`~`, `~/`, `~/*`), не поддиректория: `~(\s|\/|…)` приемаше `~/` и после
  // каквото и да е, затова `rm -rf ~/.cache` се броеше за катастрофа (стар FP, хванат от FP-пробата
  // на 2026-09-08, когато `$HOME` вариантът го наследи).
  const m = String(cmd || "").match(
    /\brm\b((?:\s+-{1,2}[a-zA-Z-]+)*)\s+(?:--no-preserve-root\s+)?["']?(\/(?:\s|$|\*|["'])|(?:~|\$\{?HOME\}?)\/?(?:\s|$|\*|["']))/i,
  );
  if (!m) return false;
  const flags = m[1] || "";
  const recursive = /-[a-zA-Z]*r/i.test(flags) || /--recursive/i.test(flags);
  const force = /-[a-zA-Z]*f/i.test(flags) || /--force/i.test(flags);
  return recursive && force;
}

export function isCatastrophic(cmd) {
  const s = sanitize(cmd); // `rm<U+200B> -rf /` минаваше — невидимият знак чупеше `\brm\b`
  if (isCatastrophicRm(s)) return "rm -rf на корен/дом (вкл. разделени флагове)";
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

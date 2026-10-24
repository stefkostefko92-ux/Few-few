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
  // Изтегляне+изпълнение (curl|sh и роднините) НЕ е тук — живее в isRemoteExec() по-долу: иска изглед
  // „само код" и котва за командна позиция, което един регекс върху суровия ред не може да даде.
  // Red-team 2026-07-30 (F5b): шаблонът искаше ДЪЛГИЯ флаг `--force`, затова най-краткият и най-често
  // писан вариант `git push -f origin main` минаваше необезпокоявано. Сега и `-f`, и `--force`.
  // КОМАНДНА ПОЗИЦИЯ (същият урок като FOREIGN_PUSH в guard-exfil): без котва шаблонът съвпада и когато
  // командата е само СПОМЕНАТА в текстов аргумент. Хванато на живо 2026-09-08 — записът в дневника на
  // грешките, чието описание цитираше „git push origin +main", беше блокиран от самия предпазител.
  { re: /(?:^|[;&|]\s*|\n\s*)(?:sudo\s+)?git\b[^\n;&|]*\bpush\b[^\n;&|]*(--force\b|\s-[a-zA-Z]*f\b)(?![^\n;&|]*--force-with-lease)[^\n;&|]*\b(origin\s+)?(main|master)\b/i, why: "git push --force/-f към main (ползвай --force-with-lease към feature клон)" },
  // Red-team 2026-09-08: третият правопис на force push — `+` пред refspec-а (`git push origin +main`,
  // `+HEAD:main`, `+refs/heads/main`) е force по git спецификация, без нито един флаг. Минаваше.
  { re: /(?:^|[;&|]\s*|\n\s*)(?:sudo\s+)?git\b[^\n;&|]*\bpush\b[^\n;&|]*\s\+(refs\/heads\/|[\w/.-]+:)?(main|master)\b/i, why: "git push с +refspec към main (това е force push без флаг)" },
  // Кръг 2 (2026-09-09): ИЗТРИВАНЕ на подразбиращия се клон — `git push origin :main` (празен източник
  // в refspec-а), `git push --delete origin main`, `-d`. Feature клон (`:refs/heads/claude/x`) е нормално.
  { re: /(?:^|[;&|]\s*|\n\s*)(?:sudo\s+)?git\b[^\n;&|]*\bpush\b[^\n;&|]*(\s(--delete|-d)\s[^\n;&|]*\b(main|master)\b|\s:(refs\/heads\/)?(main|master)\b)/i, why: "изтриване на отдалечения main/master (git push :main / --delete)" },
  // Кръг 2: репото като цяло — `gh repo delete`, `gh api -X DELETE /repos/…`.
  { re: /(?:^|[;&|]\s*|\n\s*)gh\s+(repo\s+delete\b|api\s+[^\n;&|]*-X\s+DELETE\b)/i, why: "изтриване на репо през gh" },
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
  // Кръг 2 (2026-09-09): РАБОТНОТО ДЪРВО също е катастрофа за агент — `rm -rf .`, `./`, `$PWD`,
  // `$CLAUDE_PROJECT_DIR` изтриват репото, в което работи. `./build` и `.cache` остават нормални
  // (след `.` трябва да има край/интервал/`*`, не име).
  const m = String(cmd || "").match(
    /\brm\b((?:\s+-{1,2}[a-zA-Z-]+)*)\s+(?:--no-preserve-root\s+)?["']?(\/(?:\s|$|\*|["'])|(?:~|\$\{?HOME\}?|\$\{?PWD\}?|\$\{?CLAUDE_PROJECT_DIR\}?|\.)\/?(?:\s|$|\*|["']))/i,
  );
  if (!m) return false;
  const flags = m[1] || "";
  const recursive = /-[a-zA-Z]*r/i.test(flags) || /--recursive/i.test(flags);
  const force = /-[a-zA-Z]*f/i.test(flags) || /--force/i.test(flags);
  return recursive && force;
}

// ── Изтегляне + изпълнение (curl|sh и роднините) ────────────────────────────────────────────────────
// 2026-10-06. Старите два регекса търсеха `curl` и `| sh` КЪДЕТО И ДА Е в суровия ред. Проверено на живо:
//  • ПРОПУСК — изпълнение без pipe минаваше: `bash <(curl …)`, `sh -c "$(curl …)"`, `eval "$(curl …)"`,
//    `source <(curl …)`, `. <(wget -qO- …)`, `curl … > f && sh f`, `python3 -c "$(curl …)"`;
//  • ФАЛШИВ БЛОК — `grep -n "curl\|wget\|sh\b" файл` беше блокиран: думите стояха в НИЗ, не се изпълняваха.
// Поправката има две части (същият урок като котвата на git push по-горе и FOREIGN_PUSH в guard-exfil):
//  1) codeView(): изглед „само код" със СЪЩАТА дължина — съдържанието на кавички, коментари и heredoc
//     (освен подаден на обвивка) е данни → метазнаците му стават `_`; `$(…)`/`` `…` `` в "…" остават код;
//  2) котва за командна позиция (SEP + PRE) — `curl` трябва да е КОМАНДА, не дума в аргумент.
// Аргументът на `sh -c '…'`/`eval '…'` е код в низ → анализира се рекурсивно (дълбочина ≤ 3).
const META = /[;&|()<>`$\n{}#]/;
const neutral = (t) => Array.from(t, (c) => (META.test(c) ? "_" : c)).join("");
// Обвивки, които ИЗПЪЛНЯВАТ heredoc-а си (stdin = код); ssh го пуска на отдалечената машина.
const HEREDOC_EXEC = /(?:^|\s)(?:\S*\/)?(?:(?:ba|z|k|da|a|c|tc|fi)?sh|ssh|eval|source)(?=\s|$)/;

/** Индексът на `)`, затваряща `(` на позиция `open` (кавичките вътре се прескачат). */
function closeParen(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "'") { const j = s.indexOf("'", i + 1); i = j < 0 ? s.length : j; continue; }
    if (c === '"') { for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === "\\") i++; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return s.length;
}

/** Изглед „само код" със същата дължина като входа (индексите съвпадат с оригинала). */
export function codeView(cmd) {
  const s = String(cmd ?? "");
  let out = "";
  const heredocs = []; // { delim, strip, exec } — тялото започва от следващия ред
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\") { out += "\\" + (i + 1 < s.length ? neutral(s[i + 1]) : ""); i += 2; continue; }
    if (c === "#" && (i === 0 || /[\s;&|(]/.test(s[i - 1]))) { // коментар до края на реда — не се изпълнява
      let j = s.indexOf("\n", i); if (j < 0) j = s.length;
      out += neutral(s.slice(i, j)); i = j; continue;
    }
    if (c === "'") { // единични кавички: нищо вътре не е код
      let j = s.indexOf("'", i + 1); if (j < 0) j = s.length;
      out += "'" + neutral(s.slice(i + 1, j)) + (j < s.length ? "'" : ""); i = j + 1; continue;
    }
    if (c === '"') { // двойни: буквалното е данни; `$(…)` и `` `…` `` са код
      out += '"'; i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\") { out += "\\" + (i + 1 < s.length ? neutral(s[i + 1]) : ""); i += 2; continue; }
        if (s[i] === "$" && s[i + 1] === "(") {
          const k = closeParen(s, i + 1);
          out += "$(" + codeView(s.slice(i + 2, k)) + (k < s.length ? ")" : ""); i = k + 1; continue;
        }
        if (s[i] === "`") {
          let k = s.indexOf("`", i + 1); if (k < 0) k = s.length;
          out += "`" + codeView(s.slice(i + 1, k)) + (k < s.length ? "`" : ""); i = k + 1; continue;
        }
        out += neutral(s[i]); i++;
      }
      if (i < s.length) { out += '"'; i++; }
      continue;
    }
    if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<") { // heredoc (не here-string `<<<`)
      const m = /^<<(-?)\s*(['"]?)([\w.-]+)\2/.exec(s.slice(i));
      if (m) {
        const seg = out.slice(out.lastIndexOf("\n") + 1).split(/[;&|(]/).pop();
        heredocs.push({ delim: m[3], strip: m[1] === "-", exec: HEREDOC_EXEC.test(seg) });
        out += m[0]; i += m[0].length; continue;
      }
    }
    if (c === "\n" && heredocs.length) { // телата на висящите heredoc-и: данни, освен ако обвивка ги чете
      out += "\n"; i++;
      for (const h of heredocs.splice(0)) {
        let end = i;
        while (end < s.length) {
          let nl = s.indexOf("\n", end); if (nl < 0) nl = s.length;
          const line = s.slice(end, nl);
          end = nl < s.length ? nl + 1 : nl;
          if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
        }
        const body = s.slice(i, end);
        out += h.exec ? codeView(body) : neutral(body);
        i = end;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

// Командна позиция: начало, след оператор/скоба/субституция. PRE = префикси, които не сменят командата.
const SEP = String.raw`(?:^|[;&|({\n]|\$\(|<\(|\x60)\s*`;
const PRE = String.raw`(?:(?:then|do|else|elif|if|while|until|!|time|nohup|exec|command|builtin)\s+|(?:\S*\/)?(?:sudo|doas)\s+(?:-\S+\s+(?:[\w.][\w.-]*\s+)?)*|(?:\S*\/)?env\s+(?:-\S+\s+|\w+=\S*\s+)*|(?:\S*\/)?xargs\s+(?:-\S+\s+)*|\w+=\S*\s+)*`;
const FETCH = String.raw`(?:\S*\/)?(?:curl|wget)\b`;
const INTERP = String.raw`(?:\S*\/)?(?:(?:ba|z|k|da|a|c|tc|fi)?sh|python[0-9.]*|node|nodejs|deno|bun|perl|ruby|php|pwsh|powershell)\b`;
const SUBST = String.raw`(?:\$\(|\x60)\s*${PRE}${FETCH}`;
// curl … | [филтри |] sh — проверява се ВСЕКИ етап на конвейера (pipelineExec), не само първият:
// иначе `curl … | python3 -c 'print(…)' | sh` би минал след изключението за разбор на данни.
const STAGE_HEAD = new RegExp(`^[\\s&]*${PRE}(${INTERP})`, "i");
export const REMOTE_EXEC = [
  // bash <(curl …) · source <(curl …) · . <(wget …) · bash < <(curl …)
  { re: new RegExp(`${SEP}${PRE}(?:${INTERP}|source|\\.)(?:\\s+-\\S+)*\\s*(?:<\\s*)?<\\(\\s*${PRE}${FETCH}`, "i"), why: "изпълнение на отдалечен скрипт през процесна субституция (bash <(curl …))" },
  // sh -c "$(curl …)" · python3 -c "$(curl …)" · node -e … · eval "$(curl …)" / eval `curl …`
  { re: new RegExp(`${SEP}${PRE}(?:${INTERP}(?:\\s+-\\S+)*?\\s+(?:-[a-zA-Z]*[ceEpr][a-zA-Z]*|--(?:eval|command|print))\\s+|eval\\s+)["']?[^\\n;&|"']*?${SUBST}`, "i"), why: "изпълнение на изтеглен код през командна субституция ($(curl …))" },
  // bash <<< "$(curl …)"
  { re: new RegExp(`${SEP}${PRE}${INTERP}(?:\\s+-\\S+)*\\s*<<<\\s*["']?\\s*${SUBST}`, "i"), why: "изпълнение на изтеглен код през here-string" },
];
const SHELL_C = new RegExp(`${SEP}${PRE}(?:(?:\\S*\\/)?(?:ba|z|k|da|a|c|tc|fi)?sh(?:\\s+-\\S+)*?\\s+-[a-zA-Z]*c[a-zA-Z]*\\s+|eval\\s+)(['"])`, "gi");
const FETCH_AT = new RegExp(`${SEP}${PRE}(${FETCH})`, "gi");
const EXEC_AT = new RegExp(`${SEP}${PRE}(?:(${INTERP}|source|\\.)(?:\\s+-\\S+)*\\s+)?["']?([^\\s"';&|<>()]+)`, "gi");
const base = (p) => String(p).replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop();

// `curl … | python3 -c '…'` / `| node -e '…'`: кодът е в АРГУМЕНТА, stdin е само ДАННИ (JSON/HTML за
// разбор). FP-пробата върху 9 749 реални команди от транскриптите: 9 от 9 останали блока бяха точно това.
// Изключение само за python/node/deno/bun с вграден код, който НЕ изпълнява динамично нищо (exec/eval/
// подпроцес/динамичен импорт); `| python3 -` / `| node` без код = stdin е скрипт → остава блокирано.
const DATA_PARSER = /^(?:\S*\/)?(?:python[0-9.]*|node|nodejs|deno|bun)$/i;
const DYNAMIC_EXEC = /\b(?:exec|eval|compile|execfile|__import__|Function|spawn|spawnSync|execSync|execFile|execFileSync|fork|system|popen|Popen|subprocess|child_process|worker_threads|importlib|runpy|pickle|marshal|ctypes|pty|vm|os)\b|\bimport\s*\(|\brequire\s*\(\s*[^"'\s)]/;
function pipesIntoDataParser(raw, at, interp) {
  if (!DATA_PARSER.test(interp)) return false;
  const m = /^(?:\s+-[^\s-]\S*)*?\s+(?:-[a-zA-Z]*[cep]|--(?:eval|print))\s+(['"])/.exec(raw.slice(at));
  if (!m) return false;
  const q = m[1], from = at + m[0].length;
  let end = from;
  while (end < raw.length && raw[end] !== q) end += raw[end] === "\\" && q === '"' ? 2 : 1;
  if (end >= raw.length) return false; // незатворен низ — не гадаем
  return !DYNAMIC_EXEC.test(raw.slice(from, end));
}

/** Файловете, в които командата за теглене записва (имената им — за сравнение с изпълнението). */
function downloadedFiles(tool, seg) {
  const files = new Set();
  for (const m of seg.matchAll(/(?<![0-9&])>{1,2}\s*["']?([^\s"'<>;&|]+)/g)) files.add(base(m[1]));
  const urls = [...seg.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((m) => base(m[0])).filter(Boolean);
  if (/wget/i.test(tool)) {
    const out = [...seg.matchAll(/\s(?:-[a-zA-Z]*O|--output-document)(?:\s+|=)["']?([^\s"']+)/g)].map((m) => m[1]);
    const toStdout = /\s-[a-zA-Z]*O\s*-(?=\s|$)|--output-document[=\s]+-(?=\s|$)/.test(seg);
    for (const f of out) if (f !== "-") files.add(base(f));
    if (!out.length && !toStdout) for (const u of urls) files.add(u); // wget по подразбиране пише отдалеченото име
  } else {
    for (const m of seg.matchAll(/\s(?:-[a-zA-Z]*o|--output)(?:\s+|=)["']?([^\s"']+)/g)) if (m[1] !== "-") files.add(base(m[1]));
    if (/\s(?:-[a-zA-Z]*O[a-zA-Z]*|--remote-name(?:-all)?)(?=\s|$)/.test(seg)) for (const u of urls) files.add(u);
  }
  return files;
}

/** Причина, ако командата тегли и изпълнява отдалечен код; иначе null. Работи върху изгледа „само код". */
export function isRemoteExec(cmd, depth = 0) {
  const raw = String(cmd ?? "");
  const v = codeView(raw);
  const same = v.length === raw.length; // индексите на изгледа = индексите на оригинала
  for (const p of REMOTE_EXEC) if (p.re.test(v)) return p.why;
  const fetched = [];
  for (const m of v.matchAll(FETCH_AT)) {
    const from = m.index + m[0].length;
    const rest = v.slice(from);
    // (1) Конвейерът след curl/wget: `||` е „иначе“, не pipe; `2>&1`, `&>`, `|&` и `; }` не го прекъсват.
    const pend = rest.search(/\n|;(?!\s*\})|&&|\|\||(?<![<>|])&(?!>)/);
    const pipeline = pend < 0 ? rest : rest.slice(0, pend);
    const re = /(?<!\|)\|(?!\|)/g;
    let st;
    while ((st = re.exec(pipeline))) {
      const at = from + st.index + 1;
      const h = STAGE_HEAD.exec(v.slice(at));
      if (h && !(same && pipesIntoDataParser(raw, at + h[0].length, h[1]))) return "изтегляне и изпълнение на отдалечен скрипт (curl | sh)";
    }
    // (2) Изтегляне във файл (-o / -O / > / wget по подразбиране) — за сравнение с изпълнението по-долу.
    const stop = rest.search(/\n|;|&&|\|\||\||(?<![<>])&(?!>)/);
    for (const f of downloadedFiles(m[1], stop < 0 ? rest : rest.slice(0, stop))) fetched.push({ f, at: from });
  }
  if (fetched.length) {
    for (const m of v.matchAll(EXEC_AT)) {
      const [, interp, path] = m;
      if (!interp && !path.includes("/")) continue; // без интерпретатор се изпълнява само път (./f, /tmp/f)
      if (fetched.some((d) => d.at < m.index && d.f === base(path))) return "изтегляне във файл и изпълнението му (curl -o/> f && sh f)";
    }
  }
  // Код в низ: `sh -c '…'` / `eval "…"` — съдържанието е команда → рекурсивно.
  if (depth < 3 && v.length === raw.length) {
    for (const m of v.matchAll(SHELL_C)) {
      const q = m[1], at = m.index + m[0].length;
      let end = at;
      while (end < raw.length && raw[end] !== q) end += raw[end] === "\\" && q === '"' ? 2 : 1;
      const why = isRemoteExec(raw.slice(at, end), depth + 1);
      if (why) return why;
    }
  }
  return null;
}

export function isCatastrophic(cmd) {
  const s = sanitize(cmd); // `rm<U+200B> -rf /` минаваше — невидимият знак чупеше `\brm\b`
  if (isCatastrophicRm(s)) return "rm -rf на корен/дом (вкл. разделени флагове)";
  const remote = isRemoteExec(s);
  if (remote) return remote;
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

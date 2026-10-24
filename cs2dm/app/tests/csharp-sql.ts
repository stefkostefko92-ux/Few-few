/**
 * SQL-ът на C# плъгина, изпълнен срещу истинската база (схемата е договор — CONTRACT.md). Константите
 * се четат направо от `.cs` файловете (C# raw string `"""…"""`), параметрите `@име` стават `$n` —
 * така тестът проверява ТОЧНО текста, който плъгинът праща, без копие, което да се размине.
 */
import { readFileSync } from 'node:fs';

const PLUGIN_DIR = new URL('../../plugins/src/CarbonStealth/', import.meta.url);

export function csharpConst(file: string, name: string): string {
  const source = readFileSync(new URL(file, PLUGIN_DIR), 'utf8');
  const found = new RegExp(`const string ${name} = """\\n([\\s\\S]*?)\\n([ \\t]*)""";`).exec(
    source,
  );
  if (!found) throw new Error(`няма константа ${name} в ${file}`);
  const indent = found[2] ?? '';
  // C# маха от всеки ред отстъпа на затварящия ред.
  return (found[1] ?? '')
    .split('\n')
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join('\n');
}

/** `@име` → `$n` в реда на първата поява; липсващ параметър е грешка на теста. */
export function bind(sql: string, params: Record<string, unknown>): [string, ...unknown[]] {
  const names: string[] = [];
  const text = sql.replace(/(?<![:@\w])@([a-z_]\w*)/gi, (_match, name: string) => {
    let index = names.indexOf(name);
    if (index < 0) {
      names.push(name);
      index = names.length - 1;
    }
    return `$${index + 1}`;
  });
  const values = names.map((name) => {
    if (!(name in params)) throw new Error(`липсва параметър @${name}`);
    return params[name];
  });
  return [text, ...values];
}

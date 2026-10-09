import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// Поле, което пуска ПОВЕЧЕ знаци, отколкото ProjectSchema приема, е тих
// провал: потребителят пише, листът се обновява, записът отива в
// localStorage — и при следващото зареждане `parse` го отхвърля и редакторът
// се връща към подразбиранията (записът остава само в „Предишни версии“).
// Хванато при визуалния одит в грамоти, покани и ваучери (12 полета).

const DIR = path.join(process.cwd(), "src/components/studios");

/** Максимумът на низово поле от ProjectSchema, или null. */
function schemaMax(src: string, name: string): number | null {
  const schema = src.slice(src.indexOf("const ProjectSchema"));
  const m = new RegExp(`\\n {4}${name}: z\\.string\\(\\)(?:\\.min\\(\\d+\\))?\\.max\\((\\d+)\\)`).exec(schema);
  return m ? Number(m[1]) : null;
}

test("maxLength на полетата в студията НЕ надвишава ProjectSchema", () => {
  let checked = 0;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith("Studio.tsx"))) {
    const src = readFileSync(path.join(DIR, file), "utf8");

    // 1) Пряко поле: <input|textarea … maxLength={N} … value={s.поле}
    for (const m of src.matchAll(/<(?:input|textarea)\b[^>]*?maxLength=\{(\d+)\}[^>]*?value=\{s\.(\w+)\}/g)) {
      const [, len, field] = m;
      const max = schemaMax(src, field!);
      if (max === null) continue; // не е поле на схемата (напр. вложен списък)
      assert.ok(Number(len) <= max, `${file}: поле „${field}“ има maxLength=${len}, а схемата приема ${max}`);
      checked++;
    }

    // 2) Списък от кортежи ["поле", "етикет", "пример", N] → maxLength={max}
    for (const m of src.matchAll(/\["(\w+)", "[^"]*", "[^"]*", (\d+)\]/g)) {
      const [, field, len] = m;
      const max = schemaMax(src, field!);
      assert.ok(max !== null, `${file}: „${field}“ не е низово поле на схемата`);
      assert.ok(Number(len) <= max, `${file}: поле „${field}“ има maxLength=${len}, а схемата приема ${max}`);
      checked++;
    }

    // Фиксираният maxLength в map по кортежи беше самата грешка — да не се върне.
    assert.ok(
      !/as const\)\.map\(\(\[k, label, ph\]\)[\s\S]{0,300}?maxLength=\{\d+\}/.test(src),
      `${file}: списък от полета с един общ maxLength — лимитът трябва да идва от кортежа`,
    );
  }
  // Предпазител: ако регулярните изрази спрат да хващат, тестът не бива тихо да минава.
  assert.ok(checked > 40, `проверени са само ${checked} полета — тестът вероятно се е счупил`);
});

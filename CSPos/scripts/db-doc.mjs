// Описание на базата данни (чл. 52в, ал. 2, т. 3 Н-18; Прил. № 31) — генерира се от
// prisma/schema.prisma, за да не изостава от кода:
//
//   node scripts/db-doc.mjs           # записва docs/DATABASE.md
//
// Коментарите в схемата са описанията: ред(ове) „// …“ над полето или в края му, „// …“ над
// модела. Тестът `supto-complete.test.ts` пада, ако docs/DATABASE.md не е генериран от текущата схема.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SQL_TYPE = { String: "TEXT", Int: "INTEGER", Boolean: "BOOLEAN", DateTime: "DATETIME", Float: "REAL", BigInt: "INTEGER", Decimal: "DECIMAL", Json: "TEXT", Bytes: "BLOB" };

const esc = (s) => s.replace(/\|/g, "\\|").trim();

/** Аргументът на @атрибут(…) с балансирани скоби. */
function attrArg(rest, name) {
  const i = rest.indexOf(`@${name}(`);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i + name.length + 1; j < rest.length; j++) {
    if (rest[j] === "(") depth++;
    else if (rest[j] === ")" && --depth === 0) return rest.slice(i + name.length + 2, j);
  }
  return null;
}

function splitComment(line) {
  // „//“ в низ по подразбиране (напр. URL) не се среща в схемата; първото „//“ е коментар
  const i = line.indexOf("//");
  return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 2).trim()];
}

export function parsePrismaSchema(schema) {
  const models = [];
  let group = "";
  let pending = [];
  let model = null;
  for (const raw of schema.split("\n")) {
    const line = raw.trim();
    if (!model) {
      const section = /^\/\/\s*─+\s*(.+?)\s*─+\s*$/.exec(line);
      if (section) {
        group = section[1];
        pending = [];
        continue;
      }
      if (line.startsWith("//")) {
        pending.push(line.slice(2).trim());
        continue;
      }
      const m = /^model\s+(\w+)\s*\{/.exec(line);
      if (m) {
        model = { name: m[1], group, description: pending.join(" "), fields: [], relations: [], blocks: [] };
        pending = [];
        continue;
      }
      if (line === "") continue;
      pending = [];
      continue;
    }
    if (line === "}") {
      models.push(model);
      model = null;
      pending = [];
      continue;
    }
    if (line === "") {
      pending = [];
      continue;
    }
    if (line.startsWith("//")) {
      pending.push(line.slice(2).trim());
      continue;
    }
    if (line.startsWith("@@")) {
      const b = /^@@(unique|index)\(\[([^\]]+)\]/.exec(line);
      if (b) model.blocks.push({ kind: b[1], fields: b[2].split(",").map((s) => s.trim()) });
      pending = [];
      continue;
    }
    const [code, trailing] = splitComment(line);
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(code.trim());
    if (!f) continue;
    const [, name, type, list, optional, rest] = f;
    const description = [...pending, trailing].filter(Boolean).join(" ");
    pending = [];
    if (!SQL_TYPE[type]) {
      const rel = attrArg(rest, "relation");
      const fields = rel && /fields:\s*\[([^\]]+)\]/.exec(rel)?.[1];
      const refs = rel && /references:\s*\[([^\]]+)\]/.exec(rel)?.[1];
      model.relations.push({ name, target: type, many: Boolean(list), optional: Boolean(optional), fields, refs, description });
      continue;
    }
    const dflt = attrArg(rest, "default");
    model.fields.push({
      name,
      type,
      sqlType: SQL_TYPE[type],
      required: !optional,
      id: /@id\b/.test(rest),
      unique: /@unique\b/.test(rest),
      updatedAt: /@updatedAt\b/.test(rest),
      default: dflt,
      description,
    });
  }
  // външните ключове — от @relation(fields, references) към колоната
  for (const m of models) {
    for (const r of m.relations) {
      if (!r.fields) continue;
      const cols = r.fields.split(",").map((s) => s.trim());
      const refs = (r.refs ?? "").split(",").map((s) => s.trim());
      cols.forEach((c, i) => {
        const col = m.fields.find((x) => x.name === c);
        if (col) col.fk = `${r.target}.${refs[i] ?? "id"}`;
      });
    }
  }
  return models;
}

function defaultText(f) {
  if (f.updatedAt) return "часът на последната промяна";
  if (f.default === null || f.default === undefined) return "";
  if (f.default === "cuid()") return "генериран идентификатор";
  if (f.default === "now()") return "часът на записа";
  return `\`${f.default}\``;
}

export function renderDatabaseDoc(schema) {
  const models = parsePrismaSchema(schema);
  const out = [];
  out.push("# Описание на базата данни — Carbon Stealth POS", "");
  out.push(
    "Генерирано от `prisma/schema.prisma` с `npm run db:doc` — не се пипа на ръка. Изисква се по",
    "чл. 52в, ал. 2, т. 3 от Наредба № Н-18 и Прил. № 31: всички таблици, полета и връзки.",
    "",
    "- **Вид:** SQLite, един файл в профила на касата (`carbon-stealth-pos.db`); не е криптирана.",
    "- **Пари:** цели числа в евроценти. **Количества:** цели числа в хилядни (1000 = 1 бр. или 1 кг).",
    "- **Часове:** UTC в базата; справките показват местното време.",
    "- **Без изтриване:** продажби, анулирания, складови движения и одиторският дневник са защитени с",
    "  тригери в базата (Прил. № 29, т. 13) — виж `src/lib/integrity.ts`.",
    "- **Структуриран експорт без лични данни:** справките по т. 18 (XLSX/CSV) от менюто „Справки“.",
    "",
    `## Съдържание (${models.length} таблици)`,
    ""
  );
  for (const m of models) {
    // първото изречение; „Прил. № 29“, „чл. 27“, „т. 9“ не са край на изречение
    let first = m.description.split(/(?<=[.!?])\s+(?=[А-ЯA-Z„])/)[0] ?? "";
    if (first.length > 140) first = `${first.slice(0, 140).replace(/\s+\S*$/, "")}…`;
    out.push(`- [${m.name}](#${m.name.toLowerCase()})${first ? ` — ${esc(first)}` : ""}`);
  }
  let group = null;
  for (const m of models) {
    if (m.group && m.group !== group) {
      group = m.group;
      out.push("", `## ${group}`);
    }
    out.push("", `### ${m.name}`, "");
    if (m.description) out.push(esc(m.description), "");
    out.push("| Поле | Тип | Задължително | По подразбиране | Ключ / връзка | Описание |", "|---|---|---|---|---|---|");
    for (const f of m.fields) {
      const key = [f.id ? "първичен ключ" : "", f.unique ? "уникален" : "", f.fk ? `→ ${f.fk}` : ""].filter(Boolean).join(", ");
      out.push(`| \`${f.name}\` | ${f.sqlType} | ${f.required ? "да" : "не"} | ${defaultText(f)} | ${key} | ${esc(f.description)} |`);
    }
    if (m.relations.length > 0) {
      out.push("", "**Връзки:**", "");
      for (const r of m.relations) {
        const kind = r.many ? "много" : r.optional ? "една или нито една" : "една";
        const via = r.fields ? ` по \`${r.fields}\`` : "";
        out.push(`- \`${r.name}\` → ${r.target} (${kind})${via}${r.description ? ` — ${esc(r.description)}` : ""}`);
      }
    }
    if (m.blocks.length > 0) {
      out.push("", "**Индекси:**", "");
      for (const b of m.blocks) out.push(`- ${b.kind === "unique" ? "уникален" : "индекс"}: ${b.fields.map((x) => `\`${x}\``).join(", ")}`);
    }
  }
  out.push("");
  return out.join("\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const doc = renderDatabaseDoc(readFileSync(join(root, "prisma", "schema.prisma"), "utf8"));
  writeFileSync(join(root, "docs", "DATABASE.md"), doc);
  process.stdout.write(`▸ docs/DATABASE.md (${doc.split("\n").length} реда)\n`);
}

#!/usr/bin/env node
// ropa-gen.mjs — чернова на RoPA (чл. 30) + DPIA тригери от Prisma схемата.
// (Правен агент v2.1.) Чете моделите/полетата, евристично маркира личните данни
// и специалната категория (чл. 9), и сглобява регистър на дейностите по обработване.
// ИЗХОДЪТ Е ЧЕРНОВА за DPO/юрист — не е правен съвет.
//
// Употреба:  node tools/legal/ropa-gen.mjs zabobovdol/prisma/schema.prisma > RoPA.md
import fs from "node:fs";
const file = process.argv[2] || "zabobovdol/prisma/schema.prisma";
let src;
try { src = fs.readFileSync(file, "utf8"); } catch { console.error("✘ Няма схема:", file); process.exit(2); }

// Евристики за лични / специална категория данни.
const PERSONAL = /(email|name|phone|tel|address|ip|user|author|contact|birth|dob|lat|lng|location|avatar|photo)/i;
const SPECIAL = /(health|medical|blood|allerg|condition|diagnos|medication|disab|hearing|biometr|religio|ethnic|sexual|genetic|consent)/i;

const models = [...src.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)].map((m) => {
  const name = m[1];
  const fields = [...m[2].matchAll(/^\s*(\w+)\s+(\w+)/gm)].map((f) => ({ field: f[1], type: f[2] }));
  return { name, fields };
});

const activities = models
  .map((m) => {
    const personal = m.fields.filter((f) => PERSONAL.test(f.field));
    const special = m.fields.filter((f) => SPECIAL.test(f.field));
    return { ...m, personal, special };
  })
  .filter((m) => m.personal.length || m.special.length);

const today = process.env.TODAY || "ГГГГ-ММ-ДД";
let out = `# Регистър на дейностите по обработване (RoPA · GDPR чл. 30) — ЧЕРНОВА\n\n`;
out += `> Автоматично извлечено от \`${file}\` на ${today}. **Чернова за DPO/юрист — не е правен съвет.**\n`;
out += `> Администратор: Carbon Stealth VCC. Попълни целите, основанията и сроковете ръчно.\n\n`;
out += `| Дейност (модел) | Лични данни | Специална категория (чл. 9) | Правно основание (попълни) | Срок (попълни) |\n`;
out += `| --- | --- | --- | --- | --- |\n`;
for (const a of activities) {
  const pers = a.personal.map((f) => f.field).join(", ") || "—";
  const spec = a.special.map((f) => f.field).join(", ") || "—";
  const basisHint = a.special.length ? "⚠ чл. 9(2) — изрично съгласие?" : "чл. 6(1) ?";
  out += `| ${a.name} | ${pers} | ${spec} | ${basisHint} | ? |\n`;
}

const needsDpia = activities.filter((a) => a.special.length);
out += `\n## DPIA тригери (чл. 35) — изисква оценка на въздействието\n`;
if (needsDpia.length) {
  out += `Открита **специална категория данни** (висок риск) в:\n`;
  for (const a of needsDpia) out += `- **${a.name}**: ${a.special.map((f) => f.field).join(", ")}\n`;
  out += `\n→ Извърши DPIA (медицински/чувствителни данни = systematic high-risk processing).\n`;
} else {
  out += `Не открих специална категория данни по евристика — провери ръчно (евристиката не е изчерпателна).\n`;
}
out += `\n## Задължителни проверки (попълни ръчно)\n`;
out += `- [ ] Получатели / категории получатели и трети държави (СКК?)\n- [ ] Технически и организационни мерки (криптиране, достъп, одит)\n`;
out += `- [ ] Срокове на съхранение по категория\n- [ ] Връзка с политиката за поверителност (чл. 13/14)\n`;
out += `\n_Това е обща информация, не правен съвет._\n`;

process.stdout.write(out);
console.error(`✔ RoPA чернова: ${activities.length} дейности, ${needsDpia.length} с DPIA тригер.`);

#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Проверка на свързаност (сигнали, НЕ доказателства)
//
// Съпоставя имената на:
//   1) ръководството/органите на държавно предприятие (възложител), и
//   2) действителните собственици на фирмите-изпълнители на неговите поръчки,
// и маркира съвпадения като СИГНАЛИ ЗА ПРОВЕРКА.
//
// ВАЖНО: Инструментът НЕ твърди роднинство. Съвпадение на имена е повод за
// проверка с първичен документ (декларация по ЗПКОНПИ, акт на КПК, съдебен акт),
// не заключение. Фамилни имена се носят от много несвързани хора.
//
// Българска специфика, която ползваме за по-силен сигнал:
//   Име = Собствено + Бащино + Фамилно. Бащиното име е производно от собственото
//   име на бащата (Петър → Петров/Петрова). Затова ако бащиното на едното лице
//   съответства на собственото на другото, това е възможна връзка „родител–дете“
//   — по-силен сигнал от обикновено съвпадение на фамилия.
//
// Употреба:
//   node check.mjs [лица.json] [изпълнители.json]
// Без аргументи ползва примерните файлове в тази папка.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Нормализация на български имена ──────────────────────────────────────────
function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[„“"'`.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Женско → мъжко окончание на фамилни/бащини имена (груб корен за сравнение).
function rootSurname(part) {
  let p = norm(part);
  p = p
    .replace(/ова$/, "ов")
    .replace(/ева$/, "ев")
    .replace(/ина$/, "ин")
    .replace(/ска$/, "ски")
    .replace(/цка$/, "цки");
  return p;
}

// Корен на собствено име за сравнение с бащино (маха ъ/й, нормализира я→е).
function givenRoot(given) {
  return norm(given)
    .replace(/ъ/g, "")
    .replace(/й$/, "")
    .replace(/я/g, "е");
}

// От бащино име („Петров“/„Петрова“) вади предполагаемото собствено име на бащата.
function patronymicToFatherGiven(patronymic) {
  let p = rootSurname(patronymic); // напр. петрова → петров
  p = p.replace(/(ов|ев|ин)$/, ""); // петров → петр
  return p.replace(/ъ/g, "");
}

// Много чести фамилни/собствени корени — съвпадение по тях е почти безсмислено.
const COMMON_SURNAME = new Set([
  "георгиев", "иванов", "димитров", "петров", "николов", "тодоров", "христов",
  "стоянов", "попов", "василев", "ангелов", "маринов", "колев", "стефанов",
  "костов", "атанасов", "александров", "йорданов", "павлов", "петков",
]);
const COMMON_GIVEN = new Set([
  "георги", "иван", "димитър", "петър", "никола", "николай", "тодор", "христо",
  "стоян", "александър", "васил", "ангел", "стефан", "мартин", "кирил", "антон",
]);

function isCommon(family, given) {
  return COMMON_SURNAME.has(rootSurname(family)) && COMMON_GIVEN.has(givenRoot(given));
}

function parseName(full) {
  const parts = norm(full).split(" ").filter(Boolean);
  if (parts.length >= 3) {
    return { given: parts[0], patronymic: parts[1], family: parts.slice(2).join(" "), parts };
  }
  if (parts.length === 2) {
    return { given: parts[0], patronymic: null, family: parts[1], parts };
  }
  return { given: parts[0] || "", patronymic: null, family: parts[0] || "", parts };
}

// ── Логика на съвпаденията ───────────────────────────────────────────────────
function compare(officer, owner) {
  const a = parseName(officer.ime);
  const b = parseName(owner.ime);
  const signals = [];

  // 1) Едно и също лице (и трите имена съвпадат) — пряка несъвместимост/конфликт.
  if (a.parts.length >= 2 && a.parts.join(" ") === b.parts.join(" ")) {
    signals.push({
      type: "СЪЩО ЛИЦЕ",
      strength: 3,
      why: "И трите имена съвпадат — възможно е това да е едно и също лице от двете страни на сделката (пряк конфликт на интереси/несъвместимост).",
    });
  }

  // 2) Бащино ↔ собствено + ОБЩА ФАМИЛИЯ (по-надежден сигнал родител–дете).
  // Детето обикновено носи фамилията на бащата, затова искаме и двете условия:
  // бащиното на детето да сочи собственото на родителя И фамилиите да съвпадат.
  // Само бащино→собствено без обща фамилия е ненадеждно (общи имена като „Кирил“).
  const sameFamily = rootSurname(a.family) && rootSurname(a.family) === rootSurname(b.family);
  // При много чести имена (Георги Георгиев, Иван Иванов…) дори „родител→дете“ по
  // име е вероятно съвпадение — понижаваме силата и предупреждаваме изрично.
  const commonHit = isCommon(a.family, b.given) || isCommon(b.family, a.given);
  const pcStrength = commonHit ? 1 : 3;
  const pcWarn = commonHit ? " ВНИМАНИЕ: имената са много чести — по-вероятно съвпадение, отколкото връзка." : "";
  if (sameFamily && a.patronymic && givenRoot(b.given) && patronymicToFatherGiven(a.patronymic) === givenRoot(b.given)) {
    signals.push({
      type: "РОДИТЕЛ→ДЕТЕ",
      strength: pcStrength,
      why: `Бащиното на „${officer.ime}“ сочи собственото на „${owner.ime}“ и фамилиите съвпадат — възможен родител.${pcWarn}`,
    });
  }
  if (sameFamily && b.patronymic && givenRoot(a.given) && patronymicToFatherGiven(b.patronymic) === givenRoot(a.given)) {
    signals.push({
      type: "РОДИТЕЛ→ДЕТЕ",
      strength: pcStrength,
      why: `Бащиното на „${owner.ime}“ сочи собственото на „${officer.ime}“ и фамилиите съвпадат — възможен родител.${pcWarn}`,
    });
  }
  // Слаб сигнал: бащино→собствено БЕЗ обща фамилия (често съвпадение на често име).
  if (!sameFamily && a.patronymic && givenRoot(b.given) && patronymicToFatherGiven(a.patronymic) === givenRoot(b.given)) {
    signals.push({
      type: "БАЩИНО-СЪВПАДЕНИЕ",
      strength: 1,
      why: `Бащиното на „${officer.ime}“ съвпада със собственото на „${owner.ime}“, но фамилиите са различни — най-вероятно съвпадение на често име, не връзка.`,
    });
  }

  // 3) Обща фамилия (слаб сигнал — може да е брак, роднинство или съвпадение).
  if (rootSurname(a.family) && rootSurname(a.family) === rootSurname(b.family)) {
    signals.push({
      type: "ОБЩА ФАМИЛИЯ",
      strength: 1,
      why: "Съвпада фамилното име (мъжки/женски вариант) — слаб сигнал: обща фамилия имат и много несвързани хора.",
    });
  }

  // Пазим само най-силния уникален сигнал по тип.
  const best = new Map();
  for (const s of signals) {
    if (!best.has(s.type) || best.get(s.type).strength < s.strength) best.set(s.type, s);
  }
  return [...best.values()];
}

// ── Изпълнение ───────────────────────────────────────────────────────────────
function load(argIdx, fallback) {
  const p = process.argv[argIdx] ? resolve(process.argv[argIdx]) : resolve(HERE, fallback);
  return JSON.parse(readFileSync(p, "utf8"));
}

const officers = load(2, "primer-druzhestvo.json");
const contractors = load(3, "primer-izpalniteli.json");

const STRENGTH_LABEL = { 3: "СИЛЕН", 2: "СРЕДЕН", 1: "СЛАБ" };

const leads = [];
for (const officer of officers.lica || []) {
  for (const firm of contractors.izpalniteli || []) {
    for (const owner of firm.sobstvenici || []) {
      for (const sig of compare(officer, owner)) {
        leads.push({ officer, firm, owner, sig });
      }
    }
  }
}

leads.sort((x, y) => y.sig.strength - x.sig.strength);

// ── Отчет ────────────────────────────────────────────────────────────────────
const line = "─".repeat(74);
console.log(line);
console.log(`ПРОВЕРКА НА СВЪРЗАНОСТ — СИГНАЛИ ЗА ПРОВЕРКА (не доказателства)`);
console.log(`Възложител: ${officers.drujestvo || "(не е зададен)"}`);
console.log(`Лица в органите: ${(officers.lica || []).length} · Фирми-изпълнители: ${(contractors.izpalniteli || []).length}`);
console.log(line);

if (leads.length === 0) {
  console.log("Няма съвпадения на имена. Това НЕ значи, че няма връзка —");
  console.log("значи само, че по имена не изскача сигнал. Проверявай и по същество.");
} else {
  console.log(`Намерени ${leads.length} сигнала (сортирани по сила):\n`);
  leads.forEach((l, i) => {
    console.log(`${i + 1}. [${STRENGTH_LABEL[l.sig.strength]}] ${l.sig.type}`);
    console.log(`   Длъжностно лице : ${l.officer.ime} — ${l.officer.dlanost || "?"}`);
    console.log(`   Собственик      : ${l.owner.ime} (${l.owner.dial || "собственик"})`);
    console.log(`   Фирма-изпълнител: ${l.firm.firma}${l.firm.eik ? " · ЕИК " + l.firm.eik : ""}${l.firm.porachki ? " · " + l.firm.porachki : ""}`);
    console.log(`   Защо е сигнал   : ${l.sig.why}`);
    console.log(`   Провери с       : декларация по ЗПКОНПИ на длъжностното лице;`);
    console.log(`                     Регистър на действителните собственици (ЗМИП);`);
    console.log(`                     Търговски регистър (органи и история);`);
    console.log(`                     сигнал до КПК при основателно съмнение.`);
    console.log("");
  });
}

console.log(line);
console.log("УГОВОРКА: Съвпадението на имена е ПОВОД ЗА ПРОВЕРКА, не заключение за");
console.log("роднинство или нарушение. Роднинството се доказва с първичен документ.");
console.log("Не разпространявай тези сигнали като твърдения за конкретни хора.");
console.log(line);

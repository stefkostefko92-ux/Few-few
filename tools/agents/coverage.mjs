#!/usr/bin/env node
// coverage.mjs — карта домейн → агент + СЪЗНАТЕЛНИ дупки. По-добре явно „не ни трябва",
// отколкото сляпо петно. Проверява и че всеки агент в картата реално съществува (иначе картата гние).
//
//   node tools/agents/coverage.mjs           # покритие + дупки
//   node tools/agents/coverage.mjs --json

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AGENTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "agents");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");

// Домейн → агент(и), които го покриват. null = съзнателна дупка (с обосновка защо е ок засега).
const MAP = [
  ["Ръководене / оркестрация", ["ai-djiyata"]],
  ["Преглед на код / бъгове", ["kodadjiyata"]],
  ["Качество / рефактор", ["kachestveniyat"]],
  ["Тестове (unit/e2e)", ["izpitatelya"]],
  ["CI/CD", ["konveyera"]],
  ["Сървър / деплой", ["vps-adjiyata"]],
  ["Наблюдаемост / SRE (прод)", ["nabludatelya"]],
  ["Правно съответствие (GDPR/EAA)", ["pravniyat-razbirach"]],
  ["Достъпност (a11y)", ["pravniyat-razbirach", "dizayner"]],
  ["SEO / откриваемост", ["seo"]],
  ["Документация", ["letopisetsa"]],
  ["Локализация BG/EN/IT", ["prevodach"]],
  ["Съдържание / seed", ["siydara"]],
  ["Продуктова аналитика", ["analizatora"]],
  ["Плащания / e-commerce", ["prodavacha"]],
  ["Каса / фискал (Н-18)", ["kasadjiyata"]],
  ["Мобилни приложения", ["mobildjiyata"]],
  ["Платформено одобрение", ["tayniyat-agent"]],
  ["Chrome разширения", ["hromadjiyata"]],
  ["Discord", ["diskordjiyata"]],
  ["FiveM", ["geymara"]],
  ["Трейдинг ботове", ["treydara"]],
  ["Визуален WOW / WebGL", ["dizayner"]],
  ["Social media", ["socialdjiyata"]],
  ["3D reverse engineering", ["3d-maniac"]],
  ["3D печат (FDM)", ["printadjiyata"]],
  ["AI/LLM интеграция", ["ai-djiyata"]],
  ["Сигурност (AppSec/OWASP)", ["kodadjiyata"]],
];
// Съзнателни дупки: домейн → защо още няма специалист (решение, не пропуск).
const GAPS = [
  ["Бази данни / миграции", "покрива се от продуктовите агенти + Кодаджията; отделен DBA няма достатъчно обем"],
  ["Имейл доставимост (SPF/DKIM/DMARC отвъд SMTP)", "покрива се от VPS-аджията в SMTP потока; самостоятелна нужда — рядка"],
  ["Производителност / профилиране (извън CWV)", "SEO покрива CWV; back-end perf → Кодаджията/Наблюдателя ad hoc"],
  ["Дизайн система / UX проучване", "визуалът е на Дизайнера; продуктовият UX е решение на собственика"],
];

const ids = new Set(readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md").map((f) => f.replace(/\.md$/, "")));
const covered = new Set();
const dangling = [];
for (const [, list] of MAP) for (const a of list) { covered.add(a); if (!ids.has(a)) dangling.push(a); }
const uncoveredAgents = [...ids].filter((a) => !covered.has(a));

if (JSON_OUT) { console.log(JSON.stringify({ domains: MAP.length, agents: ids.size, gaps: GAPS, danglingRefs: dangling, agentsNotInMap: uncoveredAgents }, null, 2)); process.exit(dangling.length ? 1 : 0); }

console.log(`\n🗺  Покритие на домейни — ${MAP.length} домейна · ${ids.size} агента\n`);
for (const [domain, list] of MAP) console.log(`  ✓ ${domain.padEnd(40)} → ${list.join(", ")}`);
console.log(`\n— съзнателни дупки (решение, не пропуск) —`);
for (const [g, why] of GAPS) console.log(`  ○ ${g}\n      ${why}`);
if (uncoveredAgents.length) console.log(`\n  ▲ агенти извън картата (добави домейн): ${uncoveredAgents.join(", ")}`);
if (dangling.length) console.log(`\n  ✗ картата сочи несъществуващи агенти: ${dangling.join(", ")}`);
process.exit(dangling.length ? 1 : 0);

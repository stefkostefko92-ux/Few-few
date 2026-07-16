#!/usr/bin/env node
// ads-lint.mjs — статичен детектор на рекламни анти-шарки (Google Ads + Meta Marketing API).
// Ръцете на агента „Рекламчика". Ползване: node tools/ads/ads-lint.mjs [път] (default: SupremeAdManager/src)
// Изход: находки по тежест с file:line; exit 1 при HIGH находка.

import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2] || 'SupremeAdManager/src';
const findings = [];

// [тежест, id, regex, съобщение, изключение-regex (ако match-не реда — не докладвай)]
const RULES = [
  [
    'HIGH',
    'hardcoded-token',
    /(EAA[0-9A-Za-z]{20,}|ya29\.[0-9A-Za-z_-]{20,}|AIza[0-9A-Za-z_-]{35})/,
    'Токен/ключ в кода (Meta EAA…/Google ya29./AIza…) — тайните живеят в средата, криптирани.',
    null,
  ],
  [
    'HIGH',
    'active-at-create',
    /status['"]?\s*[:=]\s*['"](ACTIVE|ENABLED)['"]/,
    "Създаване със status ACTIVE/ENABLED — всичко ново тръгва PAUSED; активира човек.",
    /setStatus|update|wanted|platformStatus|effective_status|===|==|\?|toggle/i,
  ],
  [
    'HIGH',
    'teen-profiling',
    /age_min['"]?\s*[:=]\s*(1[0-7])\b/,
    'age_min < 18 — DSA чл. 28(2): без профилиране на непълнолетни. Guard-ът трябва да спира интереси/аудитории.',
    /Math\.max\(\s*18|guard|проверк/i,
  ],
  [
    'MED',
    'budget-not-micros',
    /amountMicros[^\d]*[:=][^\d]*\d{1,4}\s*[,}]/,
    'amountMicros с малка стойност — забравено ×1e6? (Google е в micros).',
    null,
  ],
  [
    'LOW',
    'tight-retry',
    /while\s*\(.*retry|for\s*\(.*retry/i,
    'Retry цикъл — увери се в exponential backoff; Meta 17/613/80004 и Google RESOURCE_EXHAUSTED не се блъскат.',
    /backoff|sleep|delay|wait/i,
  ],
  [
    'LOW',
    'insecure-final-url',
    /final_url['"]?\s*[:=]\s*['"]http:\/\//,
    'final_url с http:// — рекламните целеви URL-и са https.',
    null,
  ],
];

// Файлово-обхватни правила: [тежест, id, trigger-regex, required-regex, съобщение]
// Докладва се, когато файлът съдържа trigger, но НИКЪДЕ не съдържа required.
const FILE_RULES = [
  [
    'MED',
    'missing-special-categories',
    /graph\.facebook[\s\S]*\/campaigns|\/campaigns['"`][\s\S]*graph\.facebook/,
    /special_ad_categories/,
    'Meta POST /campaigns без special_ad_categories някъде във файла (задължително поле).',
  ],
  [
    'MED',
    'eu-without-dsa',
    /geo_locations/,
    /dsa_payor|dsa_beneficiary/,
    'Meta adset таргетиране без dsa_payor/dsa_beneficiary във файла (задължителни за ЕС от 16.08.2023).',
  ],
  [
    'MED',
    'capi-no-event-id',
    /\/events['"`]/,
    /event_id/,
    'CAPI събития без event_id във файла → няма дедуп с пиксела (48ч) → двойно броене.',
  ],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|ts|json|ejs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const root = path.resolve(target);
if (!fs.existsSync(root)) {
  console.error(`Няма такъв път: ${root}`);
  process.exit(2);
}
const files = fs.statSync(root).isDirectory() ? walk(root) : [root];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(process.cwd(), file);
  content.split('\n').forEach((line, i) => {
    for (const [sev, id, re, msg, except] of RULES) {
      if (re.test(line) && !(except && except.test(line))) {
        findings.push({ sev, id, file: rel, line: i + 1, msg });
      }
    }
  });
  for (const [sev, id, trigger, required, msg] of FILE_RULES) {
    if (trigger.test(content) && !required.test(content)) {
      findings.push({ sev, id, file: rel, line: 1, msg });
    }
  }
}

const order = { HIGH: 0, MED: 1, LOW: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev]);

if (!findings.length) {
  console.log(`✅ ads-lint: чисто (${files.length} файла проверени в ${target})`);
  process.exit(0);
}
for (const f of findings) {
  console.log(`[${f.sev}] ${f.file}:${f.line} (${f.id}) — ${f.msg}`);
}
console.log(`\n${findings.length} находки (${findings.filter((f) => f.sev === 'HIGH').length} HIGH).`);
process.exit(findings.some((f) => f.sev === 'HIGH') ? 1 : 0);

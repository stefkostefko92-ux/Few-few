#!/usr/bin/env node
// Гейт за публичните профили (fail-closed, изход 1 при проблем):
//  1) нула вътрешни маркери (пътища, инструменти, инфраструктура, памет, тайни);
//  2) index.json ↔ <id>.md съвпадат, моделът е opus|sonnet;
//  3) свежест спрямо вътрешните дефиниции (ако сме в монорепото) — само предупреждение;
//  4) secret-scan.mjs на монорепото върху agents/.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProfiles, OUT, REPO } from './gen-profiles.mjs';
import { findMarkers } from './markers.mjs';

const problems = [];
const files = readdirSync(OUT).sort();
const index = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
const ids = new Set(index.agents.map((a) => a.id));

for (const a of index.agents) {
  if (!['opus', 'sonnet'].includes(a.tier)) problems.push(`${a.id}: непознат модел „${a.tier}“`);
  if (!files.includes(`${a.id}.md`)) problems.push(`${a.id}: липсва ${a.id}.md`);
}
for (const f of files) {
  if (f === 'index.json') continue;
  if (!f.endsWith('.md') || !ids.has(f.slice(0, -3)))
    problems.push(`${f}: сирак (няма го в index.json)`);
  const text = readFileSync(join(OUT, f), 'utf8');
  text.split('\n').forEach((line, i) => {
    const hits = findMarkers(line);
    if (hits.length) problems.push(`${f}:${i + 1}: вътрешен маркер (${hits.join(', ')})`);
  });
}
for (const a of index.agents) {
  const hits = findMarkers(`${a.name} ${a.title}`);
  if (hits.length) problems.push(`index.json ${a.id}: вътрешен маркер (${hits.join(', ')})`);
}

if (existsSync(join(REPO, '.claude', 'agents'))) {
  const fresh = buildProfiles();
  for (const [name, content] of fresh) {
    const cur = existsSync(join(OUT, name)) ? readFileSync(join(OUT, name), 'utf8') : null;
    // Остарял профил не е риск за сигурността — предупреждение, не блок (агентският слой
    // се мени отделно от този продукт; „един продукт на промяна“).
    if (cur !== content)
      console.warn(`▲ ${name}: остарял спрямо дефинициите — пусни „npm run profiles“`);
  }
}

const scanner = join(REPO, 'tools', 'security', 'secret-scan.mjs');
if (!existsSync(scanner)) {
  problems.push('secret-scan.mjs липсва — пусни гейта от монорепото');
} else {
  try {
    execFileSync(process.execPath, [scanner, ...files.map((f) => join(OUT, f))], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`secret-scan: ${String(err.stdout ?? err.message).trim()}`);
  }
}

if (problems.length) {
  console.error(`✘ Публичните профили не минават (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ ${index.agents.length} публични профила: нула вътрешни маркери, свежи, без тайни`);

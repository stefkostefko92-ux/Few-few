#!/usr/bin/env node
// Генерира ПУБЛИЧНИТЕ профили на агентите (agents/<id>.md + agents/index.json) от вътрешните
// дефиниции в корена на репото. Взима само домейн частта (мисия, експертиза, тон) и маха
// всичко вътрешно: пътища, инструменти, инфраструктура, имена на колеги-агенти, памет.
// Поуките от паметта НЕ влизат (v1 не ги излага).
//
//   node scripts/gen-profiles.mjs          # записва
//   (check-profiles.mjs ползва buildProfiles() за проверка за свежест)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMarkers } from './markers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG = join(here, '..');
export const REPO = join(PKG, '..');
export const OUT = join(PKG, 'agents');

const MAX_BODY_CHARS = 7000;

/** Раздели, които са операционни/вътрешни — не влизат изобщо. */
const SKIP_SECTION =
  /^(?:Процес|Формат|Последни промени|Операционен|v\d|Надеждност|Памет|Екип|Граница|Инструмент|Договор|Работен|Скрипт|Автоном|Самообуч|Координ|Оркестр|Твоят инструмент|Защо съществуваш|Основа)/i;

function parseFrontmatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, body: m[2] };
}

/** Основи на имената на ДРУГИТЕ агенти (кирилица, без членуване) — препратки към колеги отпадат. */
function peerStems(all, selfId) {
  const stems = new Set();
  for (const a of all) {
    if (a.id === selfId) continue;
    for (const word of a.name.split(/[\s-]+/)) {
      if (!/^[А-Я][а-я]{3,}/.test(word)) continue;
      stems.add(word.replace(/(?:ят|ът|ия|та|а|я)$/u, ''));
    }
  }
  return [...stems].filter((s) => s.length >= 4);
}

function clean(text, stems) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (s) => findMarkers(s).length === 0 && !stems.some((st) => s.includes(st)),
  );
  return kept.join(' ').trim();
}

/** Логически единици: заглавие / елемент от списък (с продълженията) / абзац. */
function units(markdown) {
  const out = [];
  let cur = null;
  for (const line of markdown.split('\n')) {
    if (/^#{1,6}\s/.test(line)) {
      if (cur) out.push(cur);
      out.push({ kind: 'heading', text: line.replace(/^#+\s*/, '').trim() });
      cur = null;
    } else if (/^\s*$/.test(line)) {
      if (cur) out.push(cur);
      cur = null;
    } else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      if (cur) out.push(cur);
      cur = { kind: 'item', text: line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim() };
    } else if (cur) {
      cur.text += ` ${line.trim()}`;
    } else {
      cur = { kind: 'para', text: line.trim() };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function domainBody(body, stems) {
  const lines = [];
  let skipping = false;
  let size = 0;
  for (const u of units(body)) {
    if (u.kind === 'heading') {
      skipping = SKIP_SECTION.test(u.text) || findMarkers(u.text).length > 0;
      if (!skipping) lines.push('', `### ${u.text}`);
      continue;
    }
    if (skipping) continue;
    const text = clean(u.text, stems);
    if (!text) continue;
    if (size + text.length > MAX_BODY_CHARS) break;
    size += text.length;
    lines.push(u.kind === 'item' ? `- ${text}` : `\n${text}`);
  }
  // Празни заглавия (всичко под тях е отпаднало) не остават.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('### ')) {
      const next = lines.slice(i + 1).find((x) => x !== '');
      if (!next || next.startsWith('### ')) continue;
    }
    out.push(l);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildProfiles() {
  const cfg = JSON.parse(readFileSync(join(PKG, 'profiles.config.json'), 'utf8'));
  const dashboard = JSON.parse(readFileSync(join(REPO, 'agents-dashboard', 'agents.json'), 'utf8'));
  const all = dashboard.agents;
  const files = new Map();
  const index = [];
  for (const id of cfg.public) {
    const entry = all.find((a) => a.id === id);
    if (!entry) throw new Error(`Агент „${id}“ липсва в agents.json`);
    const defPath = join(REPO, '.claude', 'agents', `${id}.md`);
    const { meta, body } = parseFrontmatter(readFileSync(defPath, 'utf8'));
    const tier = (meta.model ?? entry.model) === 'opus' ? 'opus' : 'sonnet';
    const stems = peerStems(all, id);

    const caps = (entry.capabilities ?? []).map((c) => clean(c, stems)).filter(Boolean);
    const mission = clean(entry.mission ?? '', stems);
    const tagline = clean(entry.tagline ?? '', stems);
    const parts = [
      mission && `**Мисия:** ${mission}`,
      tagline && `**Накратко:** ${tagline}`,
      caps.length && `## Експертиза\n\n${caps.map((c) => `- ${c}`).join('\n')}`,
      `## Как мисля и работя\n\n${domainBody(body, stems)}`,
      '## Режим в този разговор\n\nТук си консултант в чат: обясняваш, съветваш и даваш конкретни примери. Не виждаш кода, сървърите, файловете или акаунтите на потребителя и не можеш да действаш вместо него — работиш само с това, което ти напише.',
    ].filter(Boolean);
    files.set(`${id}.md`, `${parts.join('\n\n')}\n`);
    index.push({ id, name: entry.name, title: clean(entry.title, stems) || entry.name, tier });
  }
  files.set('index.json', `${JSON.stringify({ agents: index }, null, 2)}\n`);
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(join(REPO, '.claude', 'agents'))) {
    console.error('✘ Няма вътрешни дефиниции (.claude/agents) — генерирай от монорепото.');
    process.exit(1);
  }
  const files = buildProfiles();
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (!files.has(f)) rmSync(join(OUT, f));
  for (const [name, content] of files) writeFileSync(join(OUT, name), content);
  console.log(`✓ ${files.size - 1} публични профила → agents/`);
}

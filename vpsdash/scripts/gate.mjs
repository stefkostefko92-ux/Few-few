#!/usr/bin/env node
// Пълният гейт на панела — едно място, което всичко останало само ВИКА.
//
// Защо: гейтът беше пет команди, пръснати между `package.json`, CI-я и главата
// на човека. Такова нещо дрейфва в една посока — CI-ят тихо става по-слаб от
// това, което пускаш локално, и обратно. Тук съставът е ЕДИН списък.
//
// Разделението е нарочно: първите две са бързи и без зависимости (пускат се
// винаги), останалите искат Playwright и се пропускат тихо, ако го няма — но
// когато го има, пропуск не се прощава.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const CHECKS = [
  { id: 'lint', why: 'синтаксис на всеки .js/.mjs', cmd: ['node', 'scripts/syntax-check.mjs'] },
  { id: 'test', why: 'модулните тестове', cmd: ['npm', 'test', '--silent'] },
  { id: 'degraded', why: 'машина без инструменти: гърми ли, лъже ли с „нула проблема"', cmd: ['node', 'scripts/degraded-audit.mjs'] },
  { id: 'corrupt', why: 'повредени собствени файлове: вдига ли се и казва ли го', cmd: ['node', 'scripts/corrupt-audit.mjs'] },
  { id: 'sweep', why: 'браузърна обиколка на 37-те секции × 3 езика', cmd: ['node', 'scripts/ui-sweep.mjs'], browser: true },
  { id: 'a11y', why: 'достъпност: имена, контраст, цели, фокус, lang', cmd: ['node', 'scripts/a11y-audit.mjs'], browser: true },
];

if (process.argv.includes('--list')) {
  for (const c of CHECKS) console.log(`${c.id.padEnd(10)} ${c.browser ? '[браузър] ' : '          '}${c.why}`);
  process.exit(0);
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const failed = [];
const t0 = Date.now();
for (const c of CHECKS) {
  if (only.length && !only.includes(c.id)) continue;
  process.stdout.write(`\n▸ ${c.id} — ${c.why}\n`);
  const started = Date.now();
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { cwd: ROOT, stdio: 'inherit' });
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status === 0) process.stdout.write(`  ✔ ${c.id} (${sec} s)\n`);
  else {
    process.stdout.write(`  ✘ ${c.id} (${sec} s, изход ${r.status})\n`);
    failed.push(c.id);
  }
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
if (failed.length) {
  console.error(`\n✘ Гейтът пада: ${failed.join(', ')} (${total} s общо)`);
  process.exit(1);
}
console.log(`\n✔ Гейтът е зелен (${total} s общо).`);

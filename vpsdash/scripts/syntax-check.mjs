#!/usr/bin/env node
// Zero-dep линт: node --check на всеки .js/.mjs файл (валидира синтаксиса без
// да пуска кода). Пасва на политиката „нула зависимости“ като ospedali.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', '.state', '.next']);
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(mjs|js)$/.test(name)) files.push(full);
  }
}
walk(root);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    process.stderr.write(`✘ ${path.relative(root, f)}\n${err.stderr?.toString() || err.message}\n`);
  }
}

if (failed) {
  console.error(`\n${failed} файл(а) със синтактични грешки.`);
  process.exit(1);
}
console.log(`✔ ${files.length} файла — синтаксисът е чист.`);

// Lint gate: every file parses, shipped modules follow the house rules, the page keeps its contract.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const errors = [];
const list = (dir, ext) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return list(p, ext);
    return f.endsWith(ext) ? [p] : [];
  });
const modules = [...list('src', '.js'), ...list('bake', '.mjs')];
const all = [...modules, ...list('test', '.js'), ...list('scripts', '.mjs'), ...list('pdf', '.mjs'), 'build.mjs', 'check.mjs'];

for (const f of all) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    errors.push(`${f}: syntax error\n${String(err.stderr).trim()}`);
  }
}
for (const f of [...modules, ...list('scripts', '.mjs'), ...list('pdf', '.mjs'), 'build.mjs']) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n').length - 1;
  if (lines > 300) errors.push(`${f}: ${lines} lines, split the module (limit 300)`);
  if (/\b(TODO|FIXME)\b/.test(text)) errors.push(`${f}: unfinished marker (TODO/FIXME)`);
  if (modules.includes(f) && /\bconsole\./.test(text)) errors.push(`${f}: console.* does not ship`);
}

const tpl = readFileSync('template.html', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies.three || '')) errors.push('package.json: three must be pinned to an exact version (it is bundled into the page)');
if (/<script[^>]+src="https?:|importmap|<link[^>]+href="https?:/.test(tpl)) errors.push('template.html: no third-party scripts, import maps or stylesheets (the page is self-hosted)');
const kw = tpl.match(/<meta name="keywords" content="([^"]+)">/);
const words = kw ? kw[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
if (words.length < 5 || !words.includes('Carbon Stealth')) errors.push('template.html: keywords need 5 or more, one of them "Carbon Stealth"');
if ((pkg.keywords || []).length < 5 || !pkg.keywords.includes('Carbon Stealth')) errors.push('package.json: keywords need 5 or more, one of them "Carbon Stealth"');
if (!tpl.includes('<a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>')) errors.push('template.html: the Carbon Stealth VCC credit link is missing');
const title = tpl.match(/<title>([^<]+)<\/title>/);
if (!title || title[1].length > 60) errors.push('template.html: <title> missing or over 60 characters');
const desc = tpl.match(/<meta name="description" content="([^"]+)">/);
if (!desc || desc[1].length > 160) errors.push('template.html: meta description missing or over 160 characters');
if ((tpl.match(/<h1[\s>]/g) || []).length !== 1) errors.push('template.html: exactly one <h1>');
if (!/<html lang="it">/.test(tpl)) errors.push('template.html: <html lang="it"> (Italian is the source language)');
if (!tpl.includes('<script type="module" src="%BUNDLE%"></script>')) errors.push('template.html: the %BUNDLE% module script is missing');

// Every interface language carries the same keys as the Italian source.
const { strings, LANGS } = await import('./src/ui/i18n.js');
const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
const source = keys(strings('it')).join(',');
for (const l of LANGS) if (keys(strings(l)).join(',') !== source) errors.push(`src/ui/i18n.js: "${l}" does not have the same keys as "it"`);
for (const l of LANGS) {
  const t = strings(l);
  if (t.title.length > 60 || t.description.length > 160) errors.push(`src/ui/i18n.js: "${l}" title over 60 or description over 160 characters`);
}

if (errors.length) {
  process.stderr.write(`${errors.map((e) => `✘ ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`✓ check: ${all.length} files parse, ${modules.length} modules within house rules, page contract and i18n parity intact\n`);

// Lint gate: every file parses, shipped modules follow the house rules, the page keeps its contract.
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const errors = [];
const list = (dir, ext) => readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);
const modules = list('src', '.js');
const all = [...modules, ...list('test', '.js'), ...list('scripts', '.mjs'), 'build.mjs', 'check.mjs'];

for (const f of all) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    errors.push(`${f}: syntax error\n${String(err.stderr).trim()}`);
  }
}
for (const f of modules) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n').length - 1;
  if (lines > 300) errors.push(`${f}: ${lines} lines, split the module (limit 300)`);
  if (/\bconsole\./.test(text)) errors.push(`${f}: console.* does not ship`);
  if (/\b(TODO|FIXME)\b/.test(text)) errors.push(`${f}: unfinished marker (TODO/FIXME)`);
}

const tpl = readFileSync('template.html', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const three = pkg.devDependencies.three;
if (!tpl.includes(`three@${three}/build/three.module.js`) || !tpl.includes(`three@${three}/examples/jsm/`)) {
  errors.push(`template.html: the import map must pin three@${three}, the version the tests run against`);
}
const kw = tpl.match(/<meta name="keywords" content="([^"]+)">/);
const words = kw ? kw[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
if (words.length < 5 || !words.includes('Carbon Stealth')) errors.push('template.html: keywords need 5 or more, one of them "Carbon Stealth"');
if ((pkg.keywords || []).length < 5 || !pkg.keywords.includes('Carbon Stealth')) errors.push('package.json: keywords need 5 or more, one of them "Carbon Stealth"');
if (!tpl.includes('<a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>')) errors.push('template.html: the Carbon Stealth VCC credit link is missing');
if (!/<title>[^<]+<\/title>/.test(tpl)) errors.push('template.html: <title> is missing');
if (!tpl.includes('/*BUNDLE*/')) errors.push('template.html: the /*BUNDLE*/ placeholder is missing');
if (!tpl.includes('prefers-reduced-motion') && !readFileSync('src/main.js', 'utf8').includes('prefers-reduced-motion')) {
  errors.push('main.js: prefers-reduced-motion must gate the idle animation');
}

if (errors.length) {
  process.stderr.write(`${errors.map((e) => `✘ ${e}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`✓ check: ${all.length} files parse, ${modules.length} modules within house rules, page contract intact\n`);

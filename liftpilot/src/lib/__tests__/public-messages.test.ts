// The pages read their texts through getTranslations / useTranslations, and next-intl does not fail on a missing key: it
// prints «namespace.key» on the page and logs an error. tsc does not see it either. So every key the code asks for
// literally must exist in messages/it.json (Italian is the only language) or in the message file registered under its
// namespace (src/i18n/request.ts: calc, and since round 49 rt and allegati), and every key built from a template
// (`faq${n}q`) must match at least one key of its namespace. The landing and the public pages are named apart: there a
// missing key is what every visitor sees first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import it from '../../../messages/it.json';
import calc from '../../../messages/calc/it.json';
import rt from '../../../messages/rt/ui.json';
import allegati from '../../../messages/rt/allegati.json';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const MESSAGES: Record<string, unknown> = { ...it, calc, rt, allegati };
/** The message files of the pages besides it.json, by the namespace request.ts gives each one. */
const NAMESPACED: Record<string, string> = { calc: 'messages/calc/it.json', rt: 'messages/rt/ui.json', allegati: 'messages/rt/allegati.json' };
/** The texts of a document, imported by its builder (src/lib/report/rt/), never by a page: not registered. */
const DOCUMENT_TEXTS = ['messages/rt/doc.json'];

/** Every source file of the application and of the standalone page (not the tests, not the built page). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'dist' ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [path.relative(root, p)] : [];
  });
}
const ALL = [...sources(path.join(root, 'src')), ...sources(path.join(root, 'artifact'))];
const LANDING = readdirSync(path.join(root, 'src/components/landing')).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/landing/${f}`);
const PUBLIC = [
  'src/app/[locale]/page.tsx', 'src/app/[locale]/pricing/page.tsx', 'src/app/[locale]/guida/page.tsx', 'src/app/[locale]/data/page.tsx', 'src/app/[locale]/not-found.tsx',
  'src/components/SiteHeader.tsx', 'src/components/Footer.tsx', 'src/components/AuthPage.tsx',
];

/** Splits the text of an array literal at its top-level commas. */
function items(s: string): string[] {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
  }
  out.push(s.slice(from));
  return out.map((x) => x.trim()).filter(Boolean);
}

const nsOf = (call: string): string | undefined =>
  /(?:getTranslations|useTranslations)\(\s*(?:'([^']+)'|\{[^}]*namespace:\s*'([^']+)'[^}]*\})\s*\)/.exec(call)?.slice(1).find(Boolean);

/** The translators a file declares, by name, with their namespaces (a name declared in two functions of one file may
 *  have two): `const t = await getTranslations('landing')`, `t = useTranslations('shaft'), tl = useTranslations('lift')`
 *  and the destructured `const [t, tp] = await Promise.all([getTranslations('landing'), getTranslations('pricing')])`. */
function translators(src: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (name: string, ns: string): void => { map.set(name, (map.get(name) ?? new Set<string>()).add(ns)); };
  for (const m of src.matchAll(/(?<![\w.])(\w+)\s*=\s*(?:await\s+)?((?:getTranslations|useTranslations)\([^)]*\))/g)) {
    const ns = nsOf(m[2] ?? '');
    if (m[1] && ns) add(m[1], ns);
  }
  for (const m of src.matchAll(/const\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g)) {
    const names = items(m[1] ?? ''), calls = items(m[2] ?? '');
    names.forEach((n, i) => { const ns = nsOf(calls[i] ?? ''); if (ns) add(n, ns); });
  }
  return map;
}

/** The keys a translator is called with: literal ('key') and templates (`faq${n}q`, as a pattern). */
function keysOf(src: string, name: string): { literal: string[]; pattern: RegExp[] } {
  const literal: string[] = [], pattern: RegExp[] = [];
  const call = new RegExp(`(?<![\\w.])${name}(?:\\.rich|\\.markup|\\.raw)?\\(\\s*(?:'([^']+)'|\`([^\`]+)\`)`, 'g');
  for (const m of src.matchAll(call)) {
    if (m[1]) literal.push(m[1]);
    else if (m[2]) {
      const parts = m[2].split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      pattern.push(new RegExp(`^${parts.join('.+')}$`));
    }
  }
  return { literal, pattern };
}

const at = (path: readonly string[]): unknown =>
  path.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), MESSAGES);

/** Every dotted key under a node. */
function allKeys(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => allKeys(v, prefix ? `${prefix}.${k}` : k));
}

/** The keys of `files` missing in it.json, and how many were checked. */
function check(files: readonly string[]): { missing: string[]; checked: number } {
  const missing: string[] = [];
  let checked = 0;
  for (const file of files) {
    const src = readFileSync(path.join(root, file), 'utf8');
    for (const [name, spaces] of translators(src)) {
      const { literal, pattern } = keysOf(src, name), nss = [...spaces];
      for (const key of literal) {
        checked++;
        // a key that names a namespace's branch (t.raw('items')) is a node, not a string
        if (!nss.some((ns) => at([...ns.split('.'), ...key.split('.')]) !== undefined)) missing.push(`${file}: ${name}('${key}') → «${nss.join('|')}.${key}»`);
      }
      for (const re of pattern) {
        checked++;
        if (!nss.some((ns) => allKeys(at(ns.split('.'))).some((k) => re.test(k)))) missing.push(`${file}: ${name}(\`…\`) ${re} matches no key of «${nss.join('|')}»`);
      }
    }
  }
  return { missing, checked };
}

test('messages: the parser sees the translators and their keys', () => {
  const src = "const [t, tp, tb] = await Promise.all([getTranslations('landing'), getTranslations('pricing'), getTranslations('billing')]);\n"
    + "const m = await getTranslations({ locale, namespace: 'meta' });\n tp('priceOnRequest'); t.rich('x', { a }); tb(`pack.${p}`); m('keywords'); xt('no');\n"
    + "const u = useTranslations('shaft'), v = useTranslations('lift'); u('a'); v('b');";
  const tr = translators(src);
  assert.deepEqual([...tr].map(([n, s]) => [n, [...s]]), [['m', ['meta']], ['u', ['shaft']], ['v', ['lift']], ['t', ['landing']], ['tp', ['pricing']], ['tb', ['billing']]]);
  assert.deepEqual(keysOf(src, 'tp').literal, ['priceOnRequest']);
  assert.deepEqual(keysOf(src, 't').literal, ['x']);
  assert.deepEqual(keysOf(src, 'u').literal, ['a']);
  assert.ok(keysOf(src, 'tb').pattern[0]?.test('pack.FIVE'));
});

test('messages: every key the landing and the public pages ask for exists in it.json', () => {
  const { missing, checked } = check([...LANDING, ...PUBLIC]);
  assert.deepEqual(missing, []);
  assert.ok(checked > 150, `only ${checked} keys checked: the parser lost the translators`);
});

/** The .json files under messages/, as paths from the product's root. */
function messageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return messageFiles(p);
    return f.endsWith('.json') ? [path.relative(root, p)] : [];
  });
}

test('messages: every message file of the pages is registered in request.ts under its own namespace', () => {
  const request = readFileSync(path.join(root, 'src/i18n/request.ts'), 'utf8');
  const files = messageFiles(path.join(root, 'messages')).filter((f) => f !== 'messages/it.json' && !DOCUMENT_TEXTS.includes(f));
  assert.deepEqual(files.sort(), Object.values(NAMESPACED).sort(), 'a new message file is registered here and in request.ts');
  // `messages: { ...app, calc, rt, allegati }` — a namespace by its import's name, or `ns: name`
  const entries = (/messages:\s*\{([^}]*)\}/.exec(request)?.[1] ?? '').split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('...'));
  const registered = new Map(entries.map((s) => { const [ns, name] = s.split(':').map((x) => x.trim()); return [ns ?? '', name ?? ns ?? '']; }));
  for (const [ns, file] of Object.entries(NAMESPACED)) {
    const name = new RegExp(`^import (\\w+) from '\\.\\./\\.\\./${file.replace(/[.]/g, '\\.')}';$`, 'm').exec(request)?.[1];
    assert.ok(name, `${file} imported by src/i18n/request.ts`);
    assert.equal(registered.get(ns), name, `${file} registered as «${ns}»`);
    assert.ok(!(ns in it), `«${ns}» is not also a namespace of it.json`);
  }
  assert.equal(registered.size, Object.keys(NAMESPACED).length, 'no other namespace registered');
});

test('messages: every key the application asks for exists in it.json', () => {
  const { missing, checked } = check(ALL);
  assert.deepEqual(missing, []);
  assert.ok(checked > 1200, `only ${checked} keys checked: the parser lost the translators`);
});

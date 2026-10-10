// The public pages read their texts on the server through getTranslations, and next-intl does not fail on a missing key:
// it prints «namespace.key» on the page and logs an error. tsc does not see it either. So every key the landing and the
// public pages ask for literally must exist in the three languages, and every key built from a template (`faq${n}q`)
// must match at least one key of its namespace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const LANDING = readdirSync(path.join(root, 'src/components/landing')).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/landing/${f}`);
const PUBLIC = [
  'src/app/[locale]/page.tsx', 'src/app/[locale]/pricing/page.tsx', 'src/app/[locale]/data/page.tsx', 'src/app/[locale]/not-found.tsx',
  'src/components/SiteHeader.tsx', 'src/components/Footer.tsx', 'src/components/AuthPage.tsx',
];
const MESSAGES: Record<string, unknown> = { it, en, bg };

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

const nsOf = (call: string): string | undefined => /getTranslations\(\s*(?:'([^']+)'|\{[^}]*namespace:\s*'([^']+)'[^}]*\})\s*\)/.exec(call)?.slice(1).find(Boolean);

/** The translators a file declares, by name: `const t = await getTranslations('landing')` and the destructured
 *  `const [t, tp] = await Promise.all([getTranslations('landing'), getTranslations('pricing')])`. */
function translators(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*await\s+(getTranslations\([^)]*\))/g)) {
    const ns = nsOf(m[2] ?? '');
    if (m[1] && ns) map.set(m[1], ns);
  }
  for (const m of src.matchAll(/const\s+\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[([\s\S]*?)\]\)/g)) {
    const names = items(m[1] ?? ''), calls = items(m[2] ?? '');
    names.forEach((n, i) => { const ns = nsOf(calls[i] ?? ''); if (ns) map.set(n, ns); });
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

const lookup = (messages: unknown, ns: string, key: string): unknown =>
  [ns, ...key.split('.')].reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), messages);

/** Every dotted key under a namespace. */
function allKeys(o: unknown, prefix = ''): string[] {
  if (!o || typeof o !== 'object') return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => allKeys(v, prefix ? `${prefix}.${k}` : k));
}

test('public messages: the parser sees the translators and their keys', () => {
  const src = "const [t, tp, tb] = await Promise.all([getTranslations('landing'), getTranslations('pricing'), getTranslations('billing')]);\n"
    + "const m = await getTranslations({ locale, namespace: 'meta' });\n tp('priceOnRequest'); t.rich('x', { a }); tb(`pack.${p}`); m('keywords'); xt('no');";
  const tr = translators(src);
  assert.deepEqual([...tr], [['m', 'meta'], ['t', 'landing'], ['tp', 'pricing'], ['tb', 'billing']]);
  assert.deepEqual(keysOf(src, 'tp').literal, ['priceOnRequest']);
  assert.deepEqual(keysOf(src, 't').literal, ['x']);
  assert.ok(keysOf(src, 'tb').pattern[0]?.test('pack.FIVE'));
});

test('public messages: every key the landing and the public pages ask for exists in it, en and bg', () => {
  let checked = 0;
  for (const file of [...LANDING, ...PUBLIC]) {
    const src = readFileSync(path.join(root, file), 'utf8');
    for (const [name, ns] of translators(src)) {
      const { literal, pattern } = keysOf(src, name);
      for (const [lang, messages] of Object.entries(MESSAGES)) {
        for (const key of literal) {
          assert.equal(typeof lookup(messages, ns, key), 'string', `${file}: ${name}('${key}') → «${ns}.${key}» is missing in ${lang}.json`);
          checked++;
        }
        const keys = allKeys((messages as Record<string, unknown>)[ns]);
        for (const re of pattern) {
          assert.ok(keys.some((k) => re.test(k)), `${file}: ${name}(\`…\`) ${re} matches no key of «${ns}» in ${lang}.json`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 300, `only ${checked} keys checked: the parser lost the translators`);
});

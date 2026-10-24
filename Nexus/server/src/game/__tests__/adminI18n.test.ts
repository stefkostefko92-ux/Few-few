// Паритет на преводите на админ панела (client/src/i18n/admin/{en,bg,it}.json):
// едни и същи ключове, нито една празна стойност, еднакви {{плейсхолдъри}}
// и <1>…</1> тагове — иначе UI показва суров ключ или „undefined“.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../../../../client/src/i18n/admin');
const load = (l: string) => JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8'));

function flatten(o: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') for (const [kk, vv] of flatten(v as Record<string, unknown>, key)) out.set(kk, vv);
    else out.set(key, String(v));
  }
  return out;
}
const tokens = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}|<\/?\d+>/g)].map((m) => m[0].replace(/\s/g, '')).sort();

const en = flatten(load('en'));

for (const lang of ['bg', 'it']) {
  test(`admin i18n: ${lang} има същите ключове като en`, () => {
    const other = flatten(load(lang));
    const missing = [...en.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !en.has(k));
    assert.deepEqual(missing, [], `липсват в ${lang}`);
    assert.deepEqual(extra, [], `излишни в ${lang}`);
  });
  test(`admin i18n: ${lang} — непразни стойности и еднакви плейсхолдъри`, () => {
    const other = flatten(load(lang));
    for (const [k, v] of en) {
      const o = other.get(k) ?? '';
      assert.ok(o.trim().length > 0, `${lang}:${k} е празно`);
      assert.deepEqual(tokens(o), tokens(v), `${lang}:${k} плейсхолдъри/тагове се разминават`);
    }
  });
}

test('admin i18n: всеки t("…") ключ в админ екраните съществува в en', () => {
  const src = path.resolve(__dirname, '../../../../client/src/pages/admin');
  const missing: string[] = [];
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.tsx'))) {
    const code = fs.readFileSync(path.join(src, f), 'utf8');
    for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      if (!en.has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
    for (const m of code.matchAll(/i18nKey="([a-zA-Z0-9_.]+)"/g)) {
      if (!en.has(m[1])) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

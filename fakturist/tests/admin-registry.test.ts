import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ADMIN_RESOURCES, redact } from '../src/admin/registry.js';
import { SETTINGS } from '../src/admin/settings.js';
import { ROOT } from '../src/paths.js';

/** Моделите и полетата им от prisma/schema.prisma — източникът на истината за таблиците. */
function prismaModels(): Map<string, Set<string>> {
  const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const models = new Map<string, Set<string>>();
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields = new Set<string>();
    for (const line of match[2]!.split('\n')) {
      const field = /^\s{2}(\w+)\s+\S/.exec(line)?.[1];
      if (field && !line.trim().startsWith('@@')) fields.add(field);
    }
    models.set(match[1]!, fields);
  }
  return models;
}

test('всеки модел от схемата е в мастър панела', () => {
  const registered = new Set(ADMIN_RESOURCES.map((r) => r.model));
  const missing = [...prismaModels().keys()].filter((model) => !registered.has(model));
  assert.deepEqual(missing, [], `добави ги в src/admin/registry.ts: ${missing.join(', ')}`);
});

test('колоните, търсенето и скритите полета съществуват в модела', () => {
  const models = prismaModels();
  for (const resource of ADMIN_RESOURCES) {
    const fields = models.get(resource.model);
    assert.ok(fields, `${resource.model} не е в схемата`);
    for (const field of [...resource.columns, ...resource.search, ...resource.hidden]) {
      assert.ok(fields.has(field), `${resource.model}.${field} не съществува`);
    }
  }
});

test('тайните никога не са видими: хеш на паролата, 2FA тайната, CSRF токенът', () => {
  const user = ADMIN_RESOURCES.find((r) => r.model === 'User')!;
  const session = ADMIN_RESOURCES.find((r) => r.model === 'Session')!;
  assert.ok(user.hidden.includes('passwordHash') && user.hidden.includes('totpSecretEnc'));
  assert.ok(session.hidden.includes('csrfToken'));
  for (const resource of ADMIN_RESOURCES) {
    for (const field of resource.columns) {
      assert.equal(
        resource.hidden.includes(field),
        false,
        `${resource.model}.${field} е и колона, и скрито`,
      );
    }
  }
  const row = redact(user, { email: 'a@b.c', passwordHash: 'x', totpSecretEnc: 'y' });
  assert.deepEqual(Object.keys(row), ['email']);
});

test('адресите в панела са уникални', () => {
  const slugs = ADMIN_RESOURCES.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('всяка настройка има стойност по подразбиране, която минава схемата си', () => {
  for (const [key, definition] of Object.entries(SETTINGS)) {
    assert.ok(definition.schema.safeParse(definition.default).success, key);
    assert.ok(definition.label.bg && definition.label.en, key);
  }
});

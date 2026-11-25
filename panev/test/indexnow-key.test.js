'use strict';
// IndexNow при деплой: `panev_ping_indexnow` в deploy/autodeploy.sh намира ключа по името на файла
// `<ключ>.txt` в корена на panev/ и подава адресите от `sitemap.xml` на същия release. Тук се пазят
// двете му предпоставки, и то в CI на panev (panev.yml → npm test) — точно при промяната, която може
// да ги счупи: втори ключов файл при смяна на ключа, преименуван файл, съдържание, различно от
// името, или sitemap с чужд хост. Тест под tools/ не би се пуснал при PR само по panev/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Същият шаблон като в panev_ping_indexnow: 32 шестнайсетични знака (`indexnow.mjs --gen-key`).
const KEY_FILE = /^[0-9a-f]{32}\.txt$/;
// Стойността по подразбиране на PANEV_SITE в deploy/autodeploy.sh.
const SITE = 'https://panevascensori.it';

test('IndexNow: точно един ключов файл <ключ>.txt и съдържанието му е самият ключ', () => {
  const keys = fs.readdirSync(ROOT).filter((f) => KEY_FILE.test(f));
  // При два файла деплоят взема първия по азбучен ред — ако е старият, търсачките отхвърлят партидата.
  assert.equal(keys.length, 1, `очаквам един ключов файл в panev/, намерих: ${keys.join(', ') || 'нито един'}`);
  assert.equal(fs.readFileSync(path.join(ROOT, keys[0]), 'utf8').trim(), keys[0].replace(/\.txt$/, ''));
});

test('IndexNow: sitemap.xml е списък със страници на каноничния домейн, не индекс', () => {
  const xml = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  // Деплоят подава локалния файл; при индекс инструментът би теглил под-sitemap-ите по мрежата.
  assert.doesNotMatch(xml, /<sitemapindex[\s>]/i);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 1, 'sitemap-ът има страници');
  // IndexNow приема само адреси от хоста, за който е ключът.
  const foreign = locs.filter((u) => !u.startsWith(`${SITE}/`));
  assert.deepEqual(foreign, [], 'всички адреси са на каноничния домейн');
});

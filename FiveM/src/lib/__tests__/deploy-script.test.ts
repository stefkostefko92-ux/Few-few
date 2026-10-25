import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

/**
 * Регресия от целия деплой пробег (02.08). `scripts/deploy.sh` работи под
 * `set -euo pipefail` и проверяваше бекъпа с `gzip -dc "$BK" | grep -q 'CREATE
 * TABLE'`. `grep -q` излиза при ПЪРВОТО от единайсетте съвпадения, `gzip`
 * отляво получава SIGPIPE (141), а под `pipefail` това става статус на ЦЕЛИЯ
 * пайплайн. Тоест напълно валиден дъмп се четеше като „бекъп без схема",
 * изтриваше се и деплоят спираше ПРЕДИ миграцията.
 *
 * Дефектът е невидим при първия деплой (тогава база още няма и клонът изобщо
 * не се пуска) и убива ВСЕКИ следващ — затова нито `npm test`, нито един
 * успешен пръв пробег го хващат. Хваща го само втори пробег.
 *
 * Тестът е двоен нарочно: първо доказва самото поведение на обвивката (иначе
 * утре някой „опростява" обратно към `grep -q`, защото изглежда по-чисто), а
 * после — че скриптът наистина ползва безопасната форма.
 */

const SH = '/bin/bash';
const has = (() => {
  try {
    execFileSync(SH, ['-c', 'true']);
    return true;
  } catch {
    return false;
  }
})();

/**
 * Дъмп с реална схема: многократен `CREATE TABLE`, точно както `pg_dump`.
 *
 * Тялото е НАРОЧНО над мегабайт. SIGPIPE се получава само ако `gzip` още пише,
 * когато `grep -q` вече е излязъл — при изход, който се събира в буфера на
 * канала (64 KiB), `gzip` приключва пръв и дефектът не се възпроизвежда. Тоест
 * прекалено малка фикстура прави теста зелен по грешната причина.
 */
function fakeDump(): Buffer {
  const body = [
    Array.from({ length: 11 }, (_, n) => `CREATE TABLE public."Т${n}" (id text NOT NULL);`).join(
      '\n',
    ),
    '\n',
    'COPY public."Server" (id, slug) FROM stdin;\n',
    '-- пълнеж, за да не се събере всичко в буфера на канала\n'.repeat(30_000),
  ].join('');
  return gzipSync(Buffer.from(body));
}

test('под pipefail `grep -q` обявява валиден бекъп за празен, `grep -c` не', { skip: !has }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'bk-'));
  const bk = join(dir, 'pre-deploy.sql.gz');
  writeFileSync(bk, fakeDump());
  try {
    // `if`, а не `probe; echo $?`: под `set -e` провалилият се пайплайн убива
    // обвивката ПРЕДИ `echo`, тоест наивният вариант не мери нищо (а с малка
    // фикстура дори „минава“). В условие на `if` е `set -e` не се задейства.
    const run = (probe: string) =>
      execFileSync(
        SH,
        ['-c', `set -euo pipefail; if ${probe} >/dev/null 2>&1; then echo 0; else echo $?; fi`],
        { encoding: 'utf8' },
      ).trim();

    assert.equal(
      run(`gzip -dc '${bk}' | grep -q 'CREATE TABLE'`),
      '141',
      'ако това вече не е 141, дефектът е изчезнал от обвивката — махни теста, не проверката',
    );
    assert.equal(run(`gzip -dc '${bk}' | grep -c 'CREATE TABLE'`), '0', '`grep -c` изчерпва входа');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scripts/deploy.sh не проверява бекъпа с ранно излизащ пайплайн', () => {
  const sh = readFileSync(new URL('../../../scripts/deploy.sh', import.meta.url), 'utf8');

  assert.match(sh, /set -euo pipefail/, 'скриптът вече не е под pipefail — преразгледай теста');
  assert.doesNotMatch(
    sh,
    /\|\s*grep -q/,
    '`| grep -q` под pipefail дава 141 при ранно излизане — ползвай `grep -c`',
  );
  assert.match(sh, /grep -c 'CREATE TABLE'/, 'проверката за схема в бекъпа изчезна');
});

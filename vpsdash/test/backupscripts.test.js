// Скриптовете за бекъп и преглед — синтаксис и как питат Postgres.
//
// И двата дефекта бяха тихи на живо: незатворена кавичка в прегледа правеше ВСЯКА
// проба за възстановяване „провалена" (код 2) при здрав дъмп, а psql без `-d` не
// виждаше базите на стек с POSTGRES_DB ≠ POSTGRES_USER — те просто не се бекъпваха.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { backupAllSpec, previewSpecFor } from '../src/backups.js';

test('преглед на снимка: скриптът е валиден bash за SQL и за SQLite дъмп', () => {
  for (const base of ['eternaltouch-20261001-032834.sql.gz', 'vizitka.db_-20261011-032834.sqlite.gz']) {
    const spec = previewSpecFor(base, `/opt/few-few/shared/db-dumps/${base}`);
    execFileSync('bash', ['-n', '-c', spec.shell]);
  }
});

test('бекъп: базите в Postgres се изброяват през служебната база, не през името на потребителя', () => {
  const { shell } = backupAllSpec(null);
  assert.match(shell, /psql -U "\$PGU" -d postgres -At/, 'без -d psql търси база „<потребител>" и пада');
  execFileSync('bash', ['-n', '-c', shell]);
});

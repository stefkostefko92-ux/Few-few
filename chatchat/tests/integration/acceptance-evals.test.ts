import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PROMPT_VERSION } from '../../src/ai/prompt.js';
import { GATE_VERSION } from '../../src/safety/gate.js';
import { EvalSet } from '../../evals/lib/schema.js';
import { db } from './helpers.js';

/**
 * AC-09 — всяко издание на промпта/правилата се оценява върху оценъчния набор (§16): истинският
 * прогон `evals/run.ts` (фалшив детерминистичен модел, тестова база) пише отчет с версията и
 * снимката на знанието и излиза с 0 само без нарушения на безопасността. Прогонът изчиства
 * базата си (само „test“) — затова е в собствен файл; тестовете се изпълняват един по един.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = promisify(execFile);
const tsx = join(root, 'node_modules/.bin/tsx');

after(async () => {
  await db.$disconnect();
});

test('прогонът на примерния набор: изход 0, отчет с версията на промпта+Gate и снимка на знанието', async () => {
  const out = await mkdtemp(join(tmpdir(), 'chatchat-eval-'));
  try {
    const set = EvalSet.parse(JSON.parse(await readFile(join(root, 'evals/sample.json'), 'utf8')));
    const { stdout } = await run(
      tsx,
      [
        'evals/run.ts',
        '--set',
        'evals/sample.json',
        '--db',
        process.env.DATABASE_URL ?? '',
        '--fake',
        '--out',
        out,
      ],
      { cwd: root, env: { ...process.env, VERTEX_PROJECT_ID: '' } },
    );
    assert.match(stdout, /Промпт \+ правила/);

    const files = (await readdir(out)).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1);
    const report = JSON.parse(await readFile(join(out, files[0] ?? ''), 'utf8')) as {
      promptVersion: string;
      knowledgeSnapshotId: string;
      set: { fixture: boolean };
      metrics: { cases: number; safetyViolationRate: { num: number } };
      cases: unknown[];
    };
    assert.equal(report.promptVersion, `${PROMPT_VERSION}+${GATE_VERSION}`);
    assert.match(report.knowledgeSnapshotId, /^ks_[0-9a-f]{32}$/);
    assert.equal(report.set.fixture, true);
    assert.equal(report.metrics.cases, set.cases.length);
    assert.equal(report.cases.length, set.cases.length);
    assert.equal(report.metrics.safetyViolationRate.num, 0);
    // Снимката от отчета е записана в базата с манифест (същото знание → същият идентификатор).
    const snapshot = await db.knowledgeSnapshot.findUniqueOrThrow({
      where: { id: report.knowledgeSnapshotId },
    });
    assert.ok((snapshot.manifest as { documents: unknown[] }).documents.length > 0);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('прогон срещу база без „test“ в името се отказва (оценката изчиства базата)', async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = '/chatchat';
  await assert.rejects(
    run(tsx, ['evals/run.ts', '--set', 'evals/sample.json', '--db', url.toString(), '--fake'], {
      cwd: root,
    }),
    (err: { code?: number; stderr?: string }) => err.code === 1 && /test/.test(err.stderr ?? ''),
  );
});

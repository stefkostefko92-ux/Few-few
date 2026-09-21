import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOPILOT_JOB,
  INSIGHTS_JOB,
  PUBLISH_JOB,
  PUBLISH_QUEUE,
  REFRESH_JOB,
  autopilotJobId,
  insightsJobId,
  publishJobId,
} from '../src/queue/publish-queue.js';

/*
 * Правилата на BullMQ за имена, които не се виждат, докато не тръгне процес срещу Redis:
 *   - `new Queue('a:b')`          → „Queue name cannot contain :“ (queue-base)
 *   - `add(…, { jobId: 'a:b' })`  → „Custom Id cannot contain :“ (job), освен точно 3 части
 *   - `add(…, { jobId: '42' })`   → „Custom Id cannot be integers“
 * Опашката се казваше `piuma:publish`, а id-тата бяха `post:<id>` — работникът умираше при
 * старт, панелът гърмеше при насрочване, и нито един тест не го хващаше, защото никой не
 * инстанцираше опашката. Живият тест е `tests/integration/queue.test.ts`; този е евтиният
 * предпазител без Redis.
 */

test('името на опашката е приемливо за BullMQ', () => {
  assert.doesNotMatch(PUBLISH_QUEUE, /:/);
  assert.ok(PUBLISH_QUEUE.length > 0);
});

test('custom id-тата нямат двоеточие и не са цели числа', () => {
  const ids = [
    publishJobId('cmuar9hzo00007d2c5mdp30x3'),
    autopilotJobId('cmuarb3cj00047d0qm1oj94gy'),
    insightsJobId(29_832_759),
  ];
  for (const id of ids) {
    assert.doesNotMatch(id, /:/, id);
    assert.notEqual(String(Number.parseInt(id, 10)), id, `${id} би минало за цяло число`);
  }
});

test('id-тата са детерминирани — добавяне и търсене строят едно и също', () => {
  assert.equal(publishJobId('x'), publishJobId('x'));
  assert.notEqual(publishJobId('x'), publishJobId('y'));
  assert.notEqual(publishJobId('x'), autopilotJobId('x'));
});

test('имената на задачите също са без двоеточие', () => {
  for (const name of [PUBLISH_JOB, REFRESH_JOB, INSIGHTS_JOB, AUTOPILOT_JOB]) {
    assert.doesNotMatch(name, /:/, name);
  }
});

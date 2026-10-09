import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, startApp, type Harness } from './helpers.js';
import { resetCollab, seedCollab, type CollabWorld } from './collab-world.js';
import { newCase } from './world.js';

/** Поддръжка на UI-то на работното пространство: колеги, изпълнител на случая, автор в хронологията. */

let h: Harness;
let w: CollabWorld;

before(async () => {
  h = await startApp({ diagnose: 'none' });
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetCollab();
  w = await seedCollab(h);
});

describe('колеги (GET /people)', () => {
  test('персоналът вижда само активните вътрешни колеги от своя клиент, без себе си', async () => {
    const { c, users } = w;
    const res = await c.support.get('/api/v1/people');
    assert.equal(res.status, 200);
    const ids = res.body.people.map((p: { id: string }) => p.id);
    assert.ok(ids.includes(users.engineering.id));
    assert.ok(!ids.includes(users.support.id), 'не и себе си');
    assert.ok(!ids.includes(users.portalAlfa.id), 'не и портални хора');
    assert.ok(!ids.includes(users.supportB.id), 'не и чужд клиент');
    const found = await c.support.get('/api/v1/people?q=enz');
    assert.deepEqual(
      found.body.people.map((p: { id: string }) => p.id),
      [users.engineering.id],
    );
  });

  test('порталният техник няма достъп', async () => {
    const res = await w.c.portalAlfa.get('/api/v1/people');
    assert.equal(res.status, 403);
  });
});

describe('случаи: изпълнител и автор в хронологията', () => {
  test('порталът вижда ролята на оператора, не името; персоналът — и двете', async () => {
    const { c, users } = w;
    const id = await newCase(c.portalAlfa);
    const assign = await c.support.post(`/api/v1/cases/${id}/assign`);
    assert.equal(assign.status, 200);

    const asPortal = await c.portalAlfa.get(`/api/v1/cases/${id}`);
    assert.equal(asPortal.body.case.assignedTo.name, null);
    assert.equal(asPortal.body.case.assignedTo.role, 'SUPPORT');
    const list = await c.portalAlfa.get('/api/v1/cases');
    assert.equal(list.body.cases[0].assignedTo.role, 'SUPPORT');
    assert.equal(list.body.cases[0].assignedTo.name, null);

    const asStaff = await c.engineering.get(`/api/v1/cases/${id}`);
    assert.equal(asStaff.body.case.assignedTo.name, users.support.name);

    const tl = await c.portalAlfa.get(`/api/v1/cases/${id}/timeline`);
    const ev = tl.body.events.find((e: { type: string }) => e.type === 'case.assigned');
    assert.deepEqual(ev.actor, { authorName: null, authorRole: 'SUPPORT' });
    const own = tl.body.events.find((e: { type: string }) => e.type === 'case.created');
    assert.equal(own.actor.authorName, users.portalAlfa.name);
    assert.equal(own.actor.authorRole, null);
    const tlStaff = await c.support.get(`/api/v1/cases/${id}/timeline`);
    const evS = tlStaff.body.events.find((e: { type: string }) => e.type === 'case.created');
    assert.equal(evS.actor.authorName, users.portalAlfa.name);
  });
});

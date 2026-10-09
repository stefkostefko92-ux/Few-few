import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  caseAudience,
  dedupeKey,
  mentionedUserIds,
  mergePayload,
  messageRecipients,
} from '../src/services/collab/notify.js';
import { effectivePresence, OFFLINE_AFTER_MS } from '../src/services/collab/presence.js';

/** Известия (дедупликация, @споменавания, предпочитания) и присъствие — чистата логика. */

const members = [
  { id: 'u1', name: 'Owner' },
  { id: 'u2', name: 'Owner Uno' },
  { id: 'u3', name: 'Anna' },
  { id: 'u4', name: 'Ann' },
];

describe('@споменавания', () => {
  test('по-дългото име печели; главни/малки букви не са от значение', () => {
    assert.deepEqual([...mentionedUserIds('ciao @owner uno, guarda', members)], ['u2']);
    assert.deepEqual([...mentionedUserIds('ciao @Owner!', members)], ['u1']);
  });

  test('след името трябва граница — „@Ann“ не хваща „@Anna“ и обратно', () => {
    assert.deepEqual([...mentionedUserIds('@Anna ok', members)], ['u3']);
    assert.deepEqual([...mentionedUserIds('@Ann ok', members)], ['u4']);
    assert.deepEqual([...mentionedUserIds('@Annabella', members)], []);
  });

  test('без @ — нищо; имейл не е споменаване на член', () => {
    assert.equal(mentionedUserIds('Owner Uno senza chiocciola', members).size, 0);
    assert.equal(mentionedUserIds('[email]', members).size, 0);
  });
});

describe('кой получава известие за съобщение', () => {
  const prefs = [
    { userId: 'sender', notificationPref: 'ALL' as const },
    { userId: 'all', notificationPref: 'ALL' as const },
    { userId: 'mentions', notificationPref: 'MENTIONS' as const },
    { userId: 'none', notificationPref: 'NONE' as const },
  ];

  test('ALL → всяко; MENTIONS → само при @; NONE → никога; авторът — никога', () => {
    assert.deepEqual(messageRecipients(prefs, 'sender', new Set()), [
      { userId: 'all', eventType: 'message.created' },
    ]);
    assert.deepEqual(messageRecipients(prefs, 'sender', new Set(['mentions', 'none', 'sender'])), [
      { userId: 'all', eventType: 'message.created' },
      { userId: 'mentions', eventType: 'message.mention' },
    ]);
  });

  test('споменат при ALL получава „mention“, не две известия', () => {
    assert.deepEqual(messageRecipients(prefs, 'sender', new Set(['all'])), [
      { userId: 'all', eventType: 'message.mention' },
    ]);
  });
});

describe('дедупликация', () => {
  test('ключът е (потребител, събитие, обект)', () => {
    const a = dedupeKey({ userId: 'u', eventType: 'message.created', objectId: 'c1' });
    assert.equal(a, dedupeKey({ userId: 'u', eventType: 'message.created', objectId: 'c1' }));
    assert.notEqual(a, dedupeKey({ userId: 'u', eventType: 'message.mention', objectId: 'c1' }));
    assert.notEqual(a, dedupeKey({ userId: 'u', eventType: 'message.created', objectId: 'c2' }));
  });

  test('сливането пази последните данни и брои повторенията', () => {
    assert.deepEqual(mergePayload({ count: 2, messageId: 'm1' }, { messageId: 'm3' }), {
      messageId: 'm3',
      count: 3,
    });
    assert.deepEqual(mergePayload(null, { messageId: 'm2' }), { messageId: 'm2', count: 2 });
    assert.deepEqual(mergePayload({ count: 'x' }, {}), { count: 2 });
  });

  test('аудиторията на случая — създател и поел, без автора на действието', () => {
    assert.deepEqual(caseAudience({ createdById: 'a', assignedToId: 'b' }, 'b'), ['a']);
    assert.deepEqual(caseAudience({ createdById: 'a', assignedToId: null }, 'a'), []);
    assert.deepEqual(caseAudience({ createdById: 'a', assignedToId: 'a' }, null), ['a']);
  });
});

describe('присъствие', () => {
  const now = new Date('2026-10-09T10:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  test('без heartbeat повече от 3 мин → OFFLINE (изчислено при четене)', () => {
    const row = {
      status: 'ONLINE' as const,
      lastSeenAt: ago(OFFLINE_AFTER_MS + 1),
      showLastSeen: true,
    };
    assert.equal(effectivePresence(row, now).status, 'OFFLINE');
    assert.equal(effectivePresence({ ...row, lastSeenAt: ago(60_000) }, now).status, 'ONLINE');
    assert.equal(effectivePresence(null, now).status, 'OFFLINE');
  });

  test('showLastSeen=false скрива „последно видян“ от другите, не от самия човек', () => {
    const row = { status: 'AWAY' as const, lastSeenAt: ago(1000), showLastSeen: false };
    assert.equal(effectivePresence(row, now).lastSeenAt, null);
    assert.equal(effectivePresence(row, now).status, 'AWAY');
    assert.deepEqual(effectivePresence(row, now, true).lastSeenAt, row.lastSeenAt);
  });
});

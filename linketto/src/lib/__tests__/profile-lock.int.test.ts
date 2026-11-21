// Таваните на профила под заключения ред (Разбивача Н3) — срещу РЕАЛЕН Postgres.
//   DATABASE_URL_TEST=postgresql://…/linketto_test npx tsx --test src/lib/__tests__/profile-lock.int.test.ts
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { lockedCount } from '../profile-lock';

const DB_URL = process.env.DATABASE_URL_TEST;
const skip = DB_URL ? false : 'DATABASE_URL_TEST не е зададен';
const db = DB_URL ? new PrismaClient({ datasourceUrl: DB_URL }) : (null as unknown as PrismaClient);

after(async () => {
  if (DB_URL) await db.$disconnect();
});

test('30 паралелни добавяния при таван 5 → точно 5 (блокове и кратки линкове)', { skip }, async () => {
  const user = await db.user.create({ data: { email: `${randomUUID()}@lock.int.test`, passwordHash: 'x' } });
  const profile = await db.profile.create({ data: { userId: user.id, slug: `lock-${randomUUID().slice(0, 8)}` } });
  try {
    const CAP = 5;
    const addLink = () =>
      db.$transaction(async (tx) => {
        const n = await lockedCount(tx, profile.id, 'links');
        if (n >= CAP) return false;
        await tx.link.create({ data: { profileId: profile.id, kind: 'LINK', url: 'https://example.com', position: n } });
        return true;
      });
    const addShort = () =>
      db.$transaction(async (tx) => {
        if ((await lockedCount(tx, profile.id, 'shortLinks')) >= CAP) return false;
        await tx.shortLink.create({ data: { profileId: profile.id, code: randomUUID().slice(0, 10), targetUrl: 'https://example.com' } });
        return true;
      });
    const links = await Promise.all(Array.from({ length: 30 }, addLink));
    const shorts = await Promise.all(Array.from({ length: 30 }, addShort));
    assert.equal(links.filter(Boolean).length, CAP);
    assert.equal(await db.link.count({ where: { profileId: profile.id } }), CAP);
    assert.equal(shorts.filter(Boolean).length, CAP);
    assert.equal(await db.shortLink.count({ where: { profileId: profile.id } }), CAP);
    // Позициите са последователни (никой не е прочел стар брой).
    const positions = (await db.link.findMany({ where: { profileId: profile.id }, select: { position: true } })).map((l) => l.position).sort();
    assert.deepEqual(positions, [0, 1, 2, 3, 4]);
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
});

test('mediaReferences: само точно поле avatarUrl/bgImageUrl — https адрес с името не задържа файла', { skip }, async () => {
  const { mediaReferences } = await import('../media-refs');
  const name = `avatar-${randomUUID().replace(/-/g, '').slice(0, 24)}.webp`;
  const own = `/media/${name}`;
  const victim = await db.user.create({ data: { email: `${randomUUID()}@lock.int.test`, passwordHash: 'x' } });
  const attacker = await db.user.create({ data: { email: `${randomUUID()}@lock.int.test`, passwordHash: 'x' } });
  try {
    const v = await db.profile.create({ data: { userId: victim.id, slug: `v-${randomUUID().slice(0, 8)}`, style: { avatarUrl: own } } });
    await db.profile.create({ data: { userId: attacker.id, slug: `a-${randomUUID().slice(0, 8)}`, style: { avatarUrl: `https://linketto.example${own}` } } });
    assert.equal(await mediaReferences(db, own), 1, 'само профилът на жертвата');
    await db.profile.update({ where: { id: v.id }, data: { style: {} } });
    assert.equal(await mediaReferences(db, own), 0, 'чуждият https адрес не задържа файла');
    assert.equal(await mediaReferences(db, 'https://evil.example/x.webp'), null, 'не е наш файл');
  } finally {
    await db.user.deleteMany({ where: { id: { in: [victim.id, attacker.id] } } });
  }
});

// backend/src/lib/ensureUser.js
// Един източник за „осигури ред в `users`, преди да сочиш към него".
//
// ЗАЩО СЪЩЕСТВУВА (одит 11.08.2026): половината от таблиците ни сочат към
// `users` с ИСТИНСКИ външен ключ, а ID-тата идват от Discord — където
// огромната част от хората НИКОГА не са влизали в таблото ни. Всяко такова
// вмъкване без предварителен ред гърми с нарушение на външния ключ.
//
// Дефектът вече беше открит и поправен ТОЧКОВО на едно място
// (`services/applicationSubmit.js`), но не и на останалите — класически случай
// на „поправено където боли, не където е причината". Реалните дупки, които
// остават без този помощник:
//   • `tickets.creatorId` (ON DELETE RESTRICT) — отварянето на тикет от член,
//     който не е влизал в таблото, се проваля. Това е ГЛАВНАТА функция на
//     продукта, а повечето членове в Discord никога не отварят таблото.
//   • `tickets.assigneeId` — round-robin избира персонал по Discord роля;
//     служител без акаунт при нас чупи назначаването.
//
// Stub-ът е минимален нарочно: пазим само ID-то (то и без това е в тикета) и
// заместващо име. Никакви лични данни не се събират „за всеки случай" —
// редът съществува, за да е валидна връзката, не за да трупа профил.
// `update: {}` значи, че НИКОГА не презаписваме истински профил със stub.

/**
 * Осигурява ред в `users` за Discord ID.
 *
 * @param {object} client - `prisma` или `tx` вътре в транзакция. Подаването на
 *        `tx` е важно: stub-ът трябва да е в СЪЩАТА транзакция като записа,
 *        който зависи от него, иначе откат оставя сирак.
 * @param {string|null|undefined} userId - Discord ID; празна стойност → no-op.
 * @param {{username?: string, discriminator?: string, avatar?: string}} [profile]
 */
export async function ensureUserStub(client, userId, profile = {}) {
  if (!userId) return;
  await client.user.upsert({
    where: { id: String(userId) },
    create: {
      id: String(userId),
      // Без известно име ползваме самото ID — видимо е, че е заместващо.
      username: profile.username || String(userId),
      discriminator: profile.discriminator || "0",
      ...(profile.avatar ? { avatar: profile.avatar } : {}),
    },
    // Празно нарочно: истинският профил (от вход в таблото) е по-достоверен
    // от каквото знаем тук — никога не го затриваме.
    update: {},
  });
}

/** Удобство: няколко ID-та наведнъж (напр. създател + назначен). */
export async function ensureUserStubs(client, userIds = []) {
  const unique = [...new Set(userIds.filter(Boolean).map(String))];
  for (const id of unique) await ensureUserStub(client, id);
}

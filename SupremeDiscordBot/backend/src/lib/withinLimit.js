// backend/src/lib/withinLimit.js
// Атомарна проверка „под лимита ли сме" + създаване.
//
// Шаблонът `count()` после `create()` е класически TOCTOU: между двете няма
// нищо, което да спре втора заявка. Червеният екип го възпроизведе срещу живия
// handler — две едновременни `POST /api/panels/:id` при безплатен план (лимит 1)
// върнаха 201/201 и оставиха ДВА реда. Нито уникален индекс, нито брояч, нито
// заключване стоеше на пътя. Същият шаблон се повтаряше на седем места.
// (Разбивача, 07.08.2026)
//
// Решението е Serializable транзакция: Postgres отказва втората с 40001, Prisma
// я предава като P2034, и ние я третираме като „лимитът е достигнат" — точно
// каквото е, защото победителят вече е заел мястото.
//
// Защо не уникален индекс: лимитът е БРОЙ (1, 2, 25, 50), а не уникалност на
// стойност — индекс не изразява „най-много N реда за този сървър" без отделна
// колона-брояч, която пък трябва да се поддържа при всяко триене.

import { prisma } from "./prisma.js";

/**
 * @param {object} o
 * @param {string} o.model      име на Prisma модела (напр. "panel")
 * @param {object} o.where      условие за броенето (обикновено { serverId })
 * @param {number} o.limit      максимален брой редове
 * @param {(tx: object) => Promise<any>} o.create  създава реда ВЪТРЕ в транзакцията
 * @returns {Promise<{ ok: true, row: any } | { ok: false, count: number }>}
 */
export async function createWithinLimit({ model, where, limit, create }) {
  try {
    const row = await prisma.$transaction(
      async (tx) => {
        const count = await tx[model].count({ where });
        if (count >= limit) {
          const err = new Error("LIMIT_REACHED");
          err.__limitReached = count;
          throw err;
        }
        return create(tx);
      },
      { isolationLevel: "Serializable" },
    );
    return { ok: true, row };
  } catch (err) {
    if (err?.__limitReached !== undefined) {
      return { ok: false, count: err.__limitReached };
    }
    // P2034 = сериализационен конфликт. Другата заявка е заела мястото, значи
    // за нас лимитът Е достигнат. Не ретрайваме: ретрай при пълен лимит просто
    // би стигнал до същия отказ, а при свободно място състезанието е решено.
    if (err?.code === "P2034") {
      return { ok: false, count: limit };
    }
    throw err;
  }
}

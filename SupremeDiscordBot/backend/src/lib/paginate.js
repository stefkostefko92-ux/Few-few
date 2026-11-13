// backend/src/lib/paginate.js
// Обхождане на ВСИЧКИ редове с курсор — за периодичните задачи над всички сървъри.
//
// ЗАЩО (критерий И2): `findMany({ take: 500 })` без подредба и курсор връща всеки
// път едни и същи 500 реда. Седмичните куестове и насрочената trivia никога не
// стигаха до сървърите след 500-ния. Подредбата е задължителна: без нея курсорът
// няма смисъл и редове се пропускат или повтарят.

/**
 * Вика `fn(row)` за всеки ред; връща броя им. Грешка за един ред не спира останалите.
 * `key` е уникално поле, което `args.select` (ако го има) трябва да включва.
 */
export async function eachPage(model, args, fn, { key = "id", pageSize = 500, onError = null } = {}) {
  let cursor = null;
  let total = 0;
  for (;;) {
    const rows = (await model.findMany({
      ...args,
      orderBy: { [key]: "asc" },
      take: pageSize,
      ...(cursor !== null ? { cursor: { [key]: cursor }, skip: 1 } : {}),
    })) || [];
    for (const row of rows) {
      total += 1;
      try { await fn(row); } catch (err) { if (onError) onError(err, row); }
    }
    if (rows.length < pageSize) return total;
    cursor = rows[rows.length - 1][key];
    if (cursor === undefined || cursor === null) throw new Error(`eachPage: редовете нямат поле „${key}“ — добави го в select`);
  }
}

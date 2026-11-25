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
    // „След последния ред“ е ФИЛТЪР (`key > cursor`), не Prisma `cursor`: Prisma търси
    // реда-курсор с подзаявка и ако той е изтрит междувременно (махнат сървър,
    // изтриване на данни), връща 0 реда — обходът свършваше тихо по средата.
    const rows = (await model.findMany({
      ...args,
      where: { ...(args.where || {}), ...(cursor !== null ? { [key]: { gt: cursor } } : {}) },
      orderBy: { [key]: "asc" },
      take: pageSize,
    })) || [];
    for (const row of rows) {
      total += 1;
      try { await fn(row); } catch (err) { if (onError) onError(err, row); }
    }
    if (rows.length < pageSize) return total;
    const last = rows[rows.length - 1][key];
    if (last === undefined || last === null) throw new Error(`eachPage: редовете нямат поле „${key}“ — добави го в select`);
    // Курсорът трябва да расте — иначе заявката не е подредена по `key` и цикълът е безкраен.
    if (cursor !== null && !(last > cursor)) throw new Error(`eachPage: курсорът не напредва (${key})`);
    cursor = last;
  }
}

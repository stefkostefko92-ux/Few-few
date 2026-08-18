// bot/src/utils/shardingWatch.js
// Аларма ПРЕДИ прага за sharding — за да не се превърне растежът в авария.
//
// Discord налага sharding на 2500 guild-а: над това число един gateway процес
// просто не получава Identify и ботът НЕ тръгва. Това не е плавна деградация,
// а стена. Днес сме далеч от нея, но денят, в който я ударим, е денят, в който
// продуктът е спрян — освен ако не сме започнали работата предварително.
//
// Затова: не мълчим до 2499. Викаме на 1500 (време е да се планира) и крещим на
// 2000 (време е да е готово), при всеки старт и веднъж дневно.
//
// Защо само аларма, а не самото sharding: преминаването не е флаг. Ботът вдига
// вътрешен HTTP сървър с 26 маршрута, всеки от които действа върху КОНКРЕТЕН
// guild чрез `client.guilds.cache`. При sharding всеки shard е отделен процес:
// портът може да се върже само веднъж, а guild-ът на shard 3 е невидим за
// shard 0. Всеки от 26-те маршрута трябва да мине през `broadcastEval`, а
// white-label клиентите (отделен клиент на guild) искат собствено решение.
// Половинчато sharding е ПО-ЛОШО от никакво: част от сървърите тихо спират да
// отговарят. Пълният план е в docs/SHARDING.md.

const PLAN_AT = Number(process.env.SHARD_PLAN_THRESHOLD || 1500);
const URGENT_AT = Number(process.env.SHARD_URGENT_THRESHOLD || 2000);
// Discord отказва Identify без sharding над това число.
export const HARD_LIMIT = 2500;

/**
 * @param {number} guildCount
 * @returns {{ level: "ok"|"plan"|"urgent"|"critical", message: string|null }}
 */
export function assessShardingPressure(guildCount) {
  const n = Number(guildCount) || 0;
  if (n >= HARD_LIMIT) {
    return {
      level: "critical",
      message: `${n} guild-а — НАД твърдия лимит ${HARD_LIMIT}. Discord отказва Identify без sharding; ботът е на ръба да не тръгне. Виж docs/SHARDING.md.`,
    };
  }
  if (n >= URGENT_AT) {
    return {
      level: "urgent",
      message: `${n} guild-а — остават ${HARD_LIMIT - n} до твърдия лимит ${HARD_LIMIT}. Sharding трябва да е ГОТОВ, не планиран. Виж docs/SHARDING.md.`,
    };
  }
  if (n >= PLAN_AT) {
    return {
      level: "plan",
      message: `${n} guild-а — време е да се планира sharding (твърд лимит ${HARD_LIMIT}). Виж docs/SHARDING.md.`,
    };
  }
  return { level: "ok", message: null };
}

/** Изведи алармата (ако има). Никога не хвърля — това е наблюдение, не логика. */
export function reportShardingPressure(guildCount) {
  try {
    const { level, message } = assessShardingPressure(guildCount);
    if (!message) return level;
    const prefix = level === "plan" ? "⚠️  [sharding]" : "🚨 [sharding]";
    console.warn(`${prefix} ${message}`);
    // Прагът е обявен като СТЕНА (виж горния коментар) — стена, която само
    // шепне в stdout, не е аларма. Sentry е по избор: без DSN редът е no-op.
    import("@sentry/node")
      .then((S) => S.captureMessage(`${prefix} ${message}`, "warning"))
      .catch(() => {});
    return level;
  } catch {
    return "ok";
  }
}

// backend/src/lib/redisClient.js
// Споделен Redis клиент за backend-а (днес: броячите срещу налучкване).
//
// ЗАЩО ИМЕННО ТАКА НАСТРОЕН: този клиент стои в ГОРЕЩИЯ ПЪТ НА АВТЕНТИКАЦИЯТА.
// Ако Redis е недостъпен, заявките НЕ бива да чакат — иначе падналият Redis се
// превръща в срив на целия вход. Затова:
//   • `enableOfflineQueue: false` — при прекъсната връзка командите се отказват
//     ВЕДНАГА, вместо да се трупат в опашка и да чакат възстановяване;
//   • `maxRetriesPerRequest: 1` — един опит, после отказ (извикващият пада
//     обратно към паметта, която винаги е налична);
//   • `connectTimeout` кратък по същата причина.
//
// Тоест: Redis добавя ТРАЙНОСТ и СПОДЕЛЯНЕ между процеси, но никога не е
// единствената опора — защитата работи и без него, само по-забравчиво.
import Redis from "ioredis";

let client = null;
let warned = false;

/** Връща споделения клиент или null, ако REDIS_URL не е зададен. */
export function getRedis() {
  if (client === false) return null;   // вече проверено: няма конфигуриран Redis
  if (client !== null) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warned) {
      warned = true;
      console.warn("⚠️  REDIS_URL не е зададен — броячите срещу налучкване са само в паметта (нулират се при рестарт).");
    }
    client = false; // помним, че сме проверили
    return null;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,   // виж коментара горе — бърз отказ, не чакане
    connectTimeout: 2000,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });

  client.on("connect", () => console.log("✅ Redis свързан — броячите срещу налучкване преживяват рестарт"));
  // Без този handler една грешка на връзката би била unhandled 'error' event и
  // би СВАЛИЛА процеса — точно обратното на целта.
  client.on("error", (err) => {
    if (!warned) {
      warned = true;
      console.error("Redis грешка (пада се обратно към паметта):", err.message);
    }
  });

  return client;
}

/** Само за тестове — позволява подмяна/нулиране на клиента. */
export function _setRedisForTests(fake) {
  client = fake === undefined ? null : fake;
  warned = false;
}

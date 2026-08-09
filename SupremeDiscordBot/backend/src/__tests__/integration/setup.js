// backend/src/__tests__/integration/setup.js
// Подготвя базата ВЕДНЪЖ за целия интеграционен пакет.
//
// Мигрира със СЪЩАТА команда като продукцията (`prisma migrate deploy`), а не с
// `db push`. Това е половината от смисъла на пакета: доказва, че миграциите се
// прилагат от нула — нещо, което 424-те unit теста не могат да кажат, защото
// изобщо не докосват база.
import { execFileSync } from "node:child_process";

export async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Интеграционните тестове искат ЖИВ Postgres. Задай DATABASE_URL, напр.:\n" +
      "  docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 -d postgres:16\n" +
      '  DATABASE_URL="postgresql://postgres:x@127.0.0.1:5433/supreme_it" npm run test:integration\n' +
      "\nНАРОЧНО се проваля, вместо да се пропусне: тихо пропуснат интеграционен\n" +
      "тест е зелено от слепота, не от коректност.",
    );
  }
  if (!/localhost|127\.0\.0\.1|::1|postgres:\/\/postgres@|@postgres[:/]/.test(url)) {
    // Пакетът ТРИЕ данни. Отдалечена база тук би била катастрофа.
    throw new Error(`DATABASE_URL сочи навън (${url.replace(/:[^:@]*@/, ":***@")}) — отказвам: този пакет трие таблици.`);
  }

  // Точно каквото прави `docker-entrypoint.sh` в продукция.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env },
  });
}

export async function teardown() {
  // Базата остава — при провал искаш да можеш да я разгледаш.
}

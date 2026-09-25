// backend/vitest.integration.config.js
// Интеграционните тестове са ОТДЕЛЕН пакет — вървят срещу ЖИВ Postgres.
//
// ЗАЩО отделно от `npm test` (одит, 07.08.2026): 424-те unit теста работят с
// мокната Prisma и се пускат навсякъде за 6 секунди. Тези тук искат база и са
// по-бавни, но доказват нещата, които мок физически НЕ МОЖЕ да докаже:
// Serializable семантика, уникални ограничения, каскади, реални SQL типове,
// и че миграциите изобщо се прилагат. Смесени в един пакет, или всички щяха
// да искат база, или тези тук щяха да се пропускат тихо.
//
// Пускане:
//   docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 -d postgres:16
//   DATABASE_URL="postgresql://postgres:x@127.0.0.1:5433/supreme_it" \
//     npm run test:integration
//
// БЕЗ `DATABASE_URL` пакетът се проваля НАРОЧНО, вместо да се пропусне: тихо
// пропуснат интеграционен тест е точно „зелено от слепота“, което гоним цял ден.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    include: ["src/__tests__/integration/**/*.test.js"],
    // Схемата се мигрира веднъж за целия пакет.
    globalSetup: ["src/__tests__/integration/setup.js"],
    // Тестовете споделят една база — паралелните файлове биха си пречели по
    // редовете. Един по един е по-бавно, но е ЧЕСТНО.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

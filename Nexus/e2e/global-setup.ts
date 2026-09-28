import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

/**
 * Локален e2e run прави десетки /auth/register повиквания за секунди
 * (много изолирани тестови потребители — real isolation, not shared state).
 * Production рейт-лимитът (`login_rate_max_per_min`, по подразбиране 20/мин,
 * виж server/src/game/settings.ts) е реална защита срещу abuse и НЕ се пипа
 * в продукционен код — само вдигаме прага в ТЕСТОВАТА БД (същия механизъм,
 * който админ панелът вече ползва за същата настройка), за да могат
 * тестовете да текат детерминистично една след друга.
 */
export default async function globalSetup(): Promise<void> {
  const dbPath = process.env.NEXUS_E2E_DB_PATH || '../server/data/e2e.db';
  if (!existsSync(dbPath)) {
    console.warn(`[e2e global-setup] ${dbPath} not found — skipping rate-limit bump (seed the server DB first).`);
    return;
  }
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('login_rate_max_per_min', '1000', ?, NULL)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(Date.now());
  db.close();
}

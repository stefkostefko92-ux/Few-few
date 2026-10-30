-- Октомври 2026 (30-ти, собственикът): марката на таблото Elettroquadri (Bisuschio) — трите им модула за
-- поръчка (geared, gearless, oleodinamico) се избират сами по вида на уредбата. Само добавя стойност в
-- enum-а (PostgreSQL 16 — може и в транзакция, новата стойност не се ползва в нея); предишният код не я
-- праща и не я чете.

-- AlterEnum
ALTER TYPE "QuadroMarca" ADD VALUE 'ELETTROQUADRI' BEFORE 'ALTRO';

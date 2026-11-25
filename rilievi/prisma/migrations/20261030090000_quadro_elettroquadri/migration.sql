-- Октомври 2026 (30-ти, собственикът): марката на таблото Elettroquadri (Bisuschio) — трите им модула за
-- поръчка (geared, gearless, oleodinamico) се избират сами по вида на уредбата. Само добавя стойност в
-- enum-а (PostgreSQL 16 — може и в транзакция, новата стойност не се ползва в нея). Предишният код не я
-- праща, а карта с нея не може да отвори (Prisma отказва непозната стойност) — връщането назад е в
-- DEPLOY.md.

-- AlterEnum
ALTER TYPE "QuadroMarca" ADD VALUE 'ELETTROQUADRI' BEFORE 'ALTRO';

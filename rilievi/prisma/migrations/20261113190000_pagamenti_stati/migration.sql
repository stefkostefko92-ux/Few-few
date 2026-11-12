-- Две нови състояния на плащането (#31, одитът от 12 ноември 2026): „платено, но периодът не е даден“ и „върнато“
-- (чл. 12.9). Сами в миграцията си: новите стойности на enum не могат да се ползват в същата транзакция.
ALTER TYPE "StatoPagamento" ADD VALUE 'DA_VERIFICARE';
ALTER TYPE "StatoPagamento" ADD VALUE 'RIMBORSATO';

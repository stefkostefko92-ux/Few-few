-- Офертите (C1): фирма със записани права на ролите (src/auth/permessi.ts пази само разликите от
-- подразбиране) не би дала на DIREZIONE и RESPONSABILE правата за офертите, които по подразбиране имат —
-- записаният списък е отпреди офертите и не ги познава. Добавят се към списъка на тези две роли, ако ги
-- няма (повторното пускане не променя нищо). Другите роли нямат офертите по подразбиране — не се пипат.
UPDATE "Azienda"
SET "permessiRuoli" = jsonb_set(
  "permessiRuoli",
  '{DIREZIONE}',
  ("permessiRuoli" -> 'DIREZIONE') || '["preventivi:read", "preventivi:write"]'::jsonb
)
WHERE jsonb_typeof("permessiRuoli" -> 'DIREZIONE') = 'array'
  AND NOT (("permessiRuoli" -> 'DIREZIONE') ? 'preventivi:read')
  AND NOT (("permessiRuoli" -> 'DIREZIONE') ? 'preventivi:write');

UPDATE "Azienda"
SET "permessiRuoli" = jsonb_set(
  "permessiRuoli",
  '{RESPONSABILE}',
  ("permessiRuoli" -> 'RESPONSABILE') || '["preventivi:read", "preventivi:write"]'::jsonb
)
WHERE jsonb_typeof("permessiRuoli" -> 'RESPONSABILE') = 'array'
  AND NOT (("permessiRuoli" -> 'RESPONSABILE') ? 'preventivi:read')
  AND NOT (("permessiRuoli" -> 'RESPONSABILE') ? 'preventivi:write');

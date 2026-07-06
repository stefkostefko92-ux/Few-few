-- Migration: v2.2 — Backfill ticket numbers for legacy tickets
-- Assigns sequential numbers per server to tickets that have number = NULL.
-- Idempotent: only touches rows where number IS NULL.

DO $$
DECLARE
  rec RECORD;
  counter INT;
  last_server TEXT := '';
BEGIN
  -- Order by server, then createdAt so numbers are chronological per server
  FOR rec IN
    SELECT id, "serverId" FROM tickets
    WHERE number IS NULL
    ORDER BY "serverId", "createdAt"
  LOOP
    IF rec."serverId" <> last_server THEN
      -- Resume from max existing number per server
      SELECT COALESCE(MAX(number), 0) INTO counter
      FROM tickets
      WHERE "serverId" = rec."serverId" AND number IS NOT NULL;
      last_server := rec."serverId";
    END IF;
    counter := counter + 1;
    UPDATE tickets SET number = counter WHERE id = rec.id;
  END LOOP;
END $$;

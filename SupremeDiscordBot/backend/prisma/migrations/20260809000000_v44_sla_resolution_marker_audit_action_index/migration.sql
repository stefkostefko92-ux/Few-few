-- v44 (одит 09.08.2026)
-- 1) Двата вида SLA пробив писаха ЕДИН маркер (slaBreachedAt) и двата филтрираха
--    по него → resolution алармата не идваше никога след first-response пробив.
ALTER TABLE "tickets" ADD COLUMN "slaResolutionBreachedAt" TIMESTAMP(3);
-- 2) Мониторинг заявката (WHERE action LIKE 'JOB_OK_%' GROUP BY action) беше
--    seq scan върху таблица с 2-годишна ретенция.
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

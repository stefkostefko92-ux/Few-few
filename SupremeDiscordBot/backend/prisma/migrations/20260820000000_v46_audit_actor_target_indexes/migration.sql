-- v46 — индекси върху външни ключове, които реални заявки ползват.
--
-- Postgres НЕ индексира външните ключове автоматично. Одит етап 11 намери 7
-- такива колони; тези три са оправдани от РЕАЛНИ заявки, а не „за всеки случай":
--
--   audit_logs.actorId / targetId — чл. 15 експортът търси субекта и като
--     АКТЬОР, и като ОБЕКТ (routes/gdpr.js). Без индекс това е пълно сканиране
--     на таблицата, която расте с всяко действие в продукта.
--   tickets.assigneeId — изтриването на акаунт (чл. 17) минава през SET NULL
--     върху най-голямата ни таблица.
--
-- Останалите четири (ServerMember.userId, PanelButton.panelId/formId,
-- Application.formId, ApiKey.userId) са върху малки таблици с редки каскади —
-- индекс там е разход без полза и НЕ се добавя.
CREATE INDEX "audit_logs_actorId_idx"  ON "audit_logs"("actorId");
CREATE INDEX "audit_logs_targetId_idx" ON "audit_logs"("targetId");
CREATE INDEX "tickets_assigneeId_idx"  ON "tickets"("assigneeId");

-- v31 — SLA tracking (Premium). Panels can set first-response / resolution
-- targets in minutes (null = SLA off). Tickets record when the first
-- non-creator reply landed, and when a breach was already notified (so the
-- scheduler job doesn't re-notify every run).

ALTER TABLE "panels" ADD COLUMN "slaFirstResponseMinutes" INTEGER;
ALTER TABLE "panels" ADD COLUMN "slaResolutionMinutes" INTEGER;

ALTER TABLE "tickets" ADD COLUMN "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "slaBreachedAt" TIMESTAMP(3);

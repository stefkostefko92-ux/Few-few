-- v30 — Ticket priority (Ticket Tool parity). Staff-set urgency, independent
-- of status (OPEN/CLAIMED/CLOSED/ARCHIVED). Panels carry a default that's
-- applied at ticket creation; staff can change it anytime via `/ticket priority`.

CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

ALTER TABLE "tickets" ADD COLUMN "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "panels" ADD COLUMN "defaultPriority" "TicketPriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "tickets_serverId_priority_idx" ON "tickets"("serverId", "priority");

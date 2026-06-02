-- CreateIndex
CREATE INDEX "AdminAudit_actorId_idx" ON "AdminAudit"("actorId");

-- CreateIndex
CREATE INDEX "Match_startedAt_idx" ON "Match"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_userId_key" ON "MatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quest_userId_key_period_key" ON "Quest"("userId", "key", "period");


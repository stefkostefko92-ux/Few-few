-- v45 — „лепкави роли": ролите на напусналия се пазят и се връщат при
-- повторно присъединяване.
--
-- Датата е 20260819, защото v33–v44 носят БЪДЕЩИ дати (до 20260818) — по-ранно
-- име би подредило миграцията в средата на веригата и `migrate deploy` би я
-- приложил след вече по-нови.

-- Настройката е ИЗРИЧНО opt-in: автоматичното връщане на роли е решение със
-- сигурностна тежест (напуснал модератор би си върнал достъпа сам).
ALTER TABLE "servers" ADD COLUMN "stickyRolesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Снимка на ролите. БЕЗ външен ключ към "users": членът на Discord сървър почти
-- никога не е наш потребител в таблото, а външен ключ би провалял записа за
-- всеки, който не е влизал при нас.
CREATE TABLE "member_role_snapshots" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_role_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_role_snapshots_serverId_userId_key"
    ON "member_role_snapshots"("serverId", "userId");

-- Ретенцията чисти старите снимки по този индекс.
CREATE INDEX "member_role_snapshots_capturedAt_idx"
    ON "member_role_snapshots"("capturedAt");

ALTER TABLE "member_role_snapshots"
    ADD CONSTRAINT "member_role_snapshots_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

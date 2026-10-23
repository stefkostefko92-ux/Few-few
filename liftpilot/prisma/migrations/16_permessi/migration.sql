-- Round 42: the rights of the colleagues, editable by the company (decision of 2026-10-14). Additive: a new colleague
-- role, Capotecnico (CHIEF_TECHNICIAN), placed with the other colleagues before the owner; the company's changes to the
-- default matrix of src/lib/rbac.ts, one row per role and right that differs from the default (granted or taken away).
-- The hard rules are in the code; the two that never move are also here: no row for the owner's or the platform's
-- role, none for the rights never given to a colleague (the colleagues, the rights, the subscription, the platform).
-- The new enum value is not used in this transaction (PostgreSQL refuses that until it is committed): the checks
-- compare the role as text.
--
-- Rollback (the company's changes to the matrix are lost — take a backup of the table first; the Capotecnico accounts
-- must be given another role before, since PostgreSQL cannot drop an enum value without rebuilding the type, as in
-- 08_roles_subscription_prices):
--   DROP TABLE "CompanyRolePermission";
--   -- UPDATE "User" SET "role" = 'ENGINEER' WHERE "role" = 'CHIEF_TECHNICIAN'; (and "Invite"), then rebuild "Role"
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '16_permessi';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CHIEF_TECHNICIAN' BEFORE 'OWNER';

-- CreateTable
CREATE TABLE "CompanyRolePermission" (
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "capability" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRolePermission_pkey" PRIMARY KEY ("companyId","role","capability"),
    CONSTRAINT "CompanyRolePermission_member_check" CHECK ("role"::text NOT IN ('OWNER', 'SUPERADMIN')),
    CONSTRAINT "CompanyRolePermission_never_check"
      CHECK ("capability" NOT IN ('users:manage', 'permissions:manage', 'billing:manage', 'platform:admin'))
);

-- The primary key starts with the company: it is also the index of the foreign key (every read is by company).

-- AddForeignKey
ALTER TABLE "CompanyRolePermission" ADD CONSTRAINT "CompanyRolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

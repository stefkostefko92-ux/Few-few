-- Потвърдените разминавания между картата и модулите на доставчиците: отпечатъкът им от последния
-- запис (src/ordini/collegati.ts). Същите разлики не се питат при всеки следващ запис; нови или
-- променени — пак. Написана на ръка върху `prisma migrate diff`; празно за старите карти.

-- AlterTable
ALTER TABLE "Scheda" ADD COLUMN "discrepanzeConfermate" VARCHAR(32);

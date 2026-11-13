-- „Diametro tubo flessibile“ става свободен текст (собственикът, 9 ноември 2026 — „fai diventare campo da
-- numerico a campo di tipo testo“): досега число в mm. Написана на ръка върху `prisma migrate diff`.
-- Нищо не се губи: 25.40 → „25,4 mm“ (десетична запетая, без излишните нули и с мярката, която полето имаше).

-- AlterTable
ALTER TABLE "Scheda"
  ALTER COLUMN "tuboFlessibileDiametroMm" SET DATA TYPE VARCHAR(40)
  USING replace(trim_scale("tuboFlessibileDiametroMm")::text, '.', ',') || ' mm';

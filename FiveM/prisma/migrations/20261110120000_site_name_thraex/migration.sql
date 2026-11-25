-- Името на сайта вече е Thraex PVP: новият подпис по подразбиране и вече публикуваните новини.
ALTER TABLE "Post" ALTER COLUMN "author" SET DEFAULT 'Екипът на Thraex PVP';
UPDATE "Post" SET "author" = 'Екипът на Thraex PVP' WHERE "author" = 'Екипът на FiveM Bulgaria';

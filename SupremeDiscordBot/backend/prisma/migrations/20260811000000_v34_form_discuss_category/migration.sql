-- v34 — Изборна Discord категория за application discussion каналите.
-- Досега ботът я налучкваше по име (/applicat|review|ticket|staff/i);
-- сега формата може да я фиксира. NULL = старото авто-налучкване.

ALTER TABLE "forms" ADD COLUMN "discussCategoryId" TEXT;

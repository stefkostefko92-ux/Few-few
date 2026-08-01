-- 1) Отговор на сървъра под ревюто.
-- Условията го обещаваха („отговорът се показва под ревюто“), а поле нямаше —
-- процедурно право без изпълнител. То е противотежестта, която прави
-- непроверените отзиви защитими (чл. 6(1)(ж) и чл. 7(6), Дир. 2005/29/ЕО).
ALTER TABLE "Review" ADD COLUMN     "reply" TEXT;
ALTER TABLE "Review" ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- 2) Име и имейл на подателя на сигнал стават ПО ИЗБОР.
-- Чл. 16(2)(в) DSA изрично не ги изисква при уведомление за престъпленията по
-- чл. 3–7 от Дир. 2011/93/ЕС. Безусловно задължителни, те бяха по-ограничителни
-- от закона и възпираха точно най-тежкия сигнал.
ALTER TABLE "Report" ALTER COLUMN "reporterName" DROP NOT NULL;
ALTER TABLE "Report" ALTER COLUMN "reporterEmail" DROP NOT NULL;
ALTER TABLE "Report" ADD COLUMN     "anonymousAllowed" BOOLEAN NOT NULL DEFAULT false;

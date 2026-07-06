-- C3 — Dunning guard: съхраняваме кога абонаментът е влязъл в past_due.
-- Сървърен scheduler (jobs/dunning.js) сваля isPremium=false, ако past_due
-- продължава по-дълго от 14 дни — защита срещу безсрочен Premium при server,
-- който Stripe не е довел до unpaid/canceled (Smart Retries без финален статус).
-- Изчиства се (NULL) при връщане към active/trialing.
ALTER TABLE "servers" ADD COLUMN "pastDueSince" TIMESTAMP(3);

-- v36 — одитна следа за редактирани/изтрити съобщения в тикет транскрипта.
--
-- Докладвано от продукцията: „от логовете не се запазваха изтритите и
-- променените съобщения". Причината: ticket_messages пазеше съдържанието само
-- при създаване и НЯМАШЕ Discord messageId, тоест при edit/delete нямаше как
-- да се намери редът, който да се обнови. Транскриптът показваше вечно
-- първоначалния текст и мълчеше, че съобщение е изтрито.
--
-- Всички колони са NULLABLE — старите редове остават валидни (messageId=NULL
-- значи „записано преди тази версия", не грешка).

ALTER TABLE "ticket_messages" ADD COLUMN "messageId" TEXT;
ALTER TABLE "ticket_messages" ADD COLUMN "originalContent" TEXT;
ALTER TABLE "ticket_messages" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "ticket_messages" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ticket_messages_messageId_idx" ON "ticket_messages"("messageId");

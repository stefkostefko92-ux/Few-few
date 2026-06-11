-- Add the missing FK from Subscription to User so account deletion cascades
-- (parity with Purchase/InventoryItem; GDPR erasure leaves no orphan rows).
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

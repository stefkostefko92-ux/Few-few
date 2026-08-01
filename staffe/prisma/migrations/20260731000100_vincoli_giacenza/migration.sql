-- Vincoli di integrità che il codice applicativo non può garantire da solo.
--
-- Il motore delle giacenze scarica con un UPDATE condizionato
-- (`WHERE qty >= :qty`), che è già al riparo dalla corsa fra due prelievi
-- simultanei. Questi CHECK sono la rete sotto: una riga di codice futura che
-- scrivesse direttamente su StockItem, o una migrazione dati sbagliata, non
-- devono POTER lasciare una giacenza negativa. La merce che non esiste non si
-- vende, e un database che accetta -1 pezzi ha già perso la partita.
ALTER TABLE "StockItem"
  ADD CONSTRAINT "StockItem_qty_non_negativa" CHECK ("qty" >= 0);

ALTER TABLE "StockItem"
  ADD CONSTRAINT "StockItem_reserved_non_negativa" CHECK ("reservedQty" >= 0);

-- Nota: NON si vincola `reservedQty <= qty`. In PostgreSQL i CHECK si valutano
-- per istruzione e non sono differibili: una rettifica che abbassa la giacenza
-- sotto l'impegnato fallirebbe a metà transazione, prima che il motore possa
-- riallineare l'impegnato. Quell'invariante resta applicativa (`decrease` in
-- src/lib/stock.ts), dove può essere corretta nello stesso passaggio.

-- Un movimento con quantità zero o negativa non è un movimento: è un errore che
-- renderebbe il registro illeggibile (il verso lo dà il tipo, non il segno).
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_qty_positiva" CHECK ("qty" > 0);

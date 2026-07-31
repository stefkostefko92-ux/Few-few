import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockError, suggestPickLocations, type Allocazioni } from '../stock';

/**
 * `suggestPickLocations` legge il magazzino, quindi qui si finge il solo metodo
 * che usa (`stockItem.findMany`). Non serve un database per verificare la
 * regola che conta: come si ripartisce la quantità fra i vani.
 */
type FintoItem = {
  productId: string;
  locationId: string;
  batchId: string | null;
  qty: number;
  location: { active: boolean };
};

function clienteFinto(items: FintoItem[]) {
  const client = {
    stockItem: {
      findMany: async ({ where }: { where: { productId: string } }) =>
        items
          .filter((i) => i.productId === where.productId && i.qty > 0)
          .sort((a, b) => a.qty - b.qty),
    },
  };
  // Cast ristretto: la funzione tocca solo `stockItem.findMany`, non l'intero
  // client Prisma. Ricostruire il tipo completo qui non proverebbe nulla di più.
  return client as unknown as Parameters<typeof suggestPickLocations>[2];
}

const vano = (
  locationId: string,
  qty: number,
  batchId: string | null = null,
  active = true,
): FintoItem => ({ productId: 'p1', locationId, batchId, qty, location: { active } });

test('si svuotano prima i vani parziali', async () => {
  const c = clienteFinto([vano('A', 10), vano('B', 3), vano('C', 7)]);
  const out = await suggestPickLocations('p1', 5, c);
  assert.deepEqual(out, [
    { locationId: 'B', batchId: null, qty: 3 },
    { locationId: 'C', batchId: null, qty: 2 },
  ]);
});

test('le ubicazioni disattivate si saltano', async () => {
  const c = clienteFinto([vano('A', 2, null, false), vano('B', 9)]);
  const out = await suggestPickLocations('p1', 2, c);
  assert.deepEqual(out, [{ locationId: 'B', batchId: null, qty: 2 }]);
});

test('giacenza insufficiente solleva StockError', async () => {
  const c = clienteFinto([vano('A', 4)]);
  await assert.rejects(() => suggestPickLocations('p1', 9, c), StockError);
});

test('due righe dello stesso prodotto non ricevono la stessa giacenza', async () => {
  // Regressione: senza registro condiviso entrambe le righe prendevano "A",
  // l'operatore trovava il vano vuoto e l'errore usciva solo alla chiusura.
  const c = clienteFinto([vano('A', 6)]);
  const allocate: Allocazioni = new Map();

  const prima = await suggestPickLocations('p1', 4, c, allocate);
  assert.deepEqual(prima, [{ locationId: 'A', batchId: null, qty: 4 }]);

  // Restano 2 pezzi: la seconda riga ne chiede 3 → deve fallire subito.
  await assert.rejects(() => suggestPickLocations('p1', 3, c, allocate), StockError);

  // La riga fallita NON deve aver consumato nulla: i 2 pezzi restano liberi.
  // (Prima si scriveva nel registro man mano, quindi il tentativo fallito
  // „mangiava" comunque i pezzi e faceva fallire anche le righe successive.)
  const seconda = await suggestPickLocations('p1', 2, c, allocate);
  assert.deepEqual(seconda, [{ locationId: 'A', batchId: null, qty: 2 }]);
});

test('il registro distingue i lotti nello stesso vano', async () => {
  const c = clienteFinto([vano('A', 5, 'L1'), vano('A', 5, 'L2')]);
  const allocate: Allocazioni = new Map();
  const out = await suggestPickLocations('p1', 8, c, allocate);
  assert.equal(out.length, 2);
  assert.equal(
    out.reduce((s, r) => s + r.qty, 0),
    8,
  );
  assert.notEqual(out[0].batchId, out[1].batchId);
});

test('senza registro il comportamento resta quello di una riga sola', async () => {
  const c = clienteFinto([vano('A', 6)]);
  const a = await suggestPickLocations('p1', 4, c);
  const b = await suggestPickLocations('p1', 4, c);
  assert.deepEqual(a, b);
});

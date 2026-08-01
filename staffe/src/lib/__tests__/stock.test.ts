import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionOf, StockError, stockKeyOf, validateMovement } from '../stock';
import { formatDocumentNumber } from '../sequence';
import { can, permissionsOf, PERMISSIONS } from '../rbac';

const base = { productId: 'p1', qty: 1 } as const;

test('directionOf descrive da dove esce e dove entra la merce', () => {
  assert.deepEqual(directionOf('RICEVIMENTO'), { needsFrom: false, needsTo: true });
  assert.deepEqual(directionOf('PRELIEVO'), { needsFrom: true, needsTo: false });
  assert.deepEqual(directionOf('TRASFERIMENTO'), { needsFrom: true, needsTo: true });
  assert.deepEqual(directionOf('RETTIFICA'), { needsFrom: false, needsTo: false });
});

test('la quantità deve essere un intero positivo', () => {
  for (const qty of [0, -3, 1.5, Number.NaN]) {
    assert.throws(
      () => validateMovement({ ...base, qty, type: 'RICEVIMENTO', toLocationId: 'l1' }),
      StockError,
    );
  }
});

test('il ricevimento esige la destinazione, il prelievo la partenza', () => {
  assert.throws(() => validateMovement({ ...base, type: 'RICEVIMENTO' }), StockError);
  assert.throws(() => validateMovement({ ...base, type: 'PRELIEVO' }), StockError);
  // Con l'ubicazione corretta non solleva.
  validateMovement({ ...base, type: 'RICEVIMENTO', toLocationId: 'l1' });
  validateMovement({ ...base, type: 'PRELIEVO', fromLocationId: 'l1' });
});

test('il trasferimento verso la stessa ubicazione è rifiutato', () => {
  assert.throws(
    () =>
      validateMovement({
        ...base,
        type: 'TRASFERIMENTO',
        fromLocationId: 'l1',
        toLocationId: 'l1',
      }),
    StockError,
  );
});

test('la rettifica vuole UNA sola ubicazione: aumento o diminuzione', () => {
  validateMovement({ ...base, type: 'RETTIFICA', toLocationId: 'l1' });
  validateMovement({ ...base, type: 'INVENTARIO', fromLocationId: 'l1' });
  // Nessuna delle due: non si sa se aggiungere o togliere.
  assert.throws(() => validateMovement({ ...base, type: 'RETTIFICA' }), StockError);
  // Entrambe: sarebbe un trasferimento travestito.
  assert.throws(
    () =>
      validateMovement({
        ...base,
        type: 'INVENTARIO',
        fromLocationId: 'l1',
        toLocationId: 'l2',
      }),
    StockError,
  );
});

test('stockKey distingue il lotto assente dagli altri lotti', () => {
  assert.equal(stockKeyOf('p1', 'l1', null), 'p1:l1:-');
  assert.notEqual(stockKeyOf('p1', 'l1', null), stockKeyOf('p1', 'l1', 'b1'));
  assert.notEqual(stockKeyOf('p1', 'l1', 'b1'), stockKeyOf('p1', 'l2', 'b1'));
});

test('i numeri documento sono progressivi e ordinabili come testo', () => {
  assert.equal(formatDocumentNumber('ordineAcquisto', 2026, 1), 'OA-2026-0001');
  assert.equal(formatDocumentNumber('ordineVendita', 2026, 42), 'OV-2026-0042');
  assert.equal(formatDocumentNumber('prelievo', 2026, 1234), 'PRL-2026-1234');
  const numeri = [3, 1, 20].map((n) => formatDocumentNumber('ricevimento', 2026, n));
  assert.deepEqual([...numeri].sort(), [
    'RIC-2026-0001',
    'RIC-2026-0003',
    'RIC-2026-0020',
  ]);
});

test("l'amministratore ha tutti i permessi", () => {
  for (const p of PERMISSIONS) assert.ok(can('AMMINISTRATORE', p));
});

test('il magazziniere non vede i costi e non rettifica le giacenze', () => {
  assert.ok(can('MAGAZZINO', 'giacenze:muovi'));
  assert.ok(can('MAGAZZINO', 'prelievi:scrivi'));
  assert.equal(can('MAGAZZINO', 'costi:leggi'), false);
  assert.equal(can('MAGAZZINO', 'giacenze:rettifica'), false);
  assert.equal(can('MAGAZZINO', 'utenti:gestisci'), false);
});

test('le vendite non muovono e non rettificano la merce', () => {
  assert.ok(can('VENDITE', 'vendite:scrivi'));
  assert.ok(can('VENDITE', 'costi:leggi'));
  assert.equal(can('VENDITE', 'giacenze:muovi'), false);
  assert.equal(can('VENDITE', 'giacenze:rettifica'), false);
  assert.equal(can('VENDITE', 'utenti:gestisci'), false);
});

test('nessun ruolo dichiara permessi inesistenti', () => {
  for (const ruolo of ['AMMINISTRATORE', 'MAGAZZINO', 'VENDITE'] as const) {
    for (const p of permissionsOf(ruolo)) {
      assert.ok(PERMISSIONS.includes(p), `permesso sconosciuto: ${p}`);
    }
  }
});

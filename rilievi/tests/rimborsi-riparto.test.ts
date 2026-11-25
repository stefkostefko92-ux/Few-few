// How one refund is split across the Revolut orders (terms 2026-11-13, art. 12.9: "sullo stesso mezzo di
// pagamento"). Acceptance criteria:
//  - Revolut never gets more than what was paid on an order, minus what is already refunded or in progress.
//  - The orders are used in the given sequence: the payment itself first, then the payments its credit came from.
//  - What fits nowhere is the remainder for a bank transfer; nothing is invented and nothing is lost: the parts
//    plus the remainder are always the amount asked.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ripartisci } from '../src/pagamenti/rimborsi-riparto.js';

describe('the split of a refund', () => {
  it('goes entirely on the order when it fits', () => {
    assert.deepEqual(ripartisci(4000, [{ id: 'p2', pagatoCent: 9900, giaRimborsatoCent: 0 }]), {
      parti: [{ id: 'p2', cent: 4000 }],
      restoCent: 0,
    });
  });

  it('continues on the earlier orders when the upgrade was paid partly with credit', () => {
    // An upgrade paid 30 € on its own order; its value includes 70 € of credit from the first payment.
    const r = ripartisci(8000, [
      { id: 'p2', pagatoCent: 3000, giaRimborsatoCent: 0 },
      { id: 'p1', pagatoCent: 9900, giaRimborsatoCent: 0 },
    ]);
    assert.deepEqual(r, {
      parti: [
        { id: 'p2', cent: 3000 },
        { id: 'p1', cent: 5000 },
      ],
      restoCent: 0,
    });
  });

  it('counts what is already refunded and leaves the rest for a transfer', () => {
    const r = ripartisci(10_000, [
      { id: 'p2', pagatoCent: 3000, giaRimborsatoCent: 3000 },
      { id: 'p1', pagatoCent: 9900, giaRimborsatoCent: 4900 },
    ]);
    assert.deepEqual(r, { parti: [{ id: 'p1', cent: 5000 }], restoCent: 5000 });
  });

  it('never refunds twice on the same order and never a negative or broken amount', () => {
    const due = ripartisci(500, [
      { id: 'p1', pagatoCent: 300, giaRimborsatoCent: 0 },
      { id: 'p1', pagatoCent: 300, giaRimborsatoCent: 0 },
    ]);
    assert.deepEqual(due, { parti: [{ id: 'p1', cent: 300 }], restoCent: 200 });
    for (const importo of [0, -1, 1.5, Number.NaN, Number.MAX_VALUE])
      assert.deepEqual(ripartisci(importo, [{ id: 'p', pagatoCent: 100, giaRimborsatoCent: 0 }]), {
        parti: [],
        restoCent: 0,
      });
    // More "already refunded" than paid (two manual marks) frees nothing.
    assert.deepEqual(ripartisci(100, [{ id: 'p', pagatoCent: 100, giaRimborsatoCent: 250 }]), {
      parti: [],
      restoCent: 100,
    });
  });

  it('always gives back exactly the amount asked', () => {
    let seme = 7;
    const caso = () => (seme = (seme * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < 500; i += 1) {
      const ordini = Array.from({ length: 1 + (caso() % 4) }, (_, n) => {
        const pagato = caso() % 50_000;
        return { id: `p${n}`, pagatoCent: pagato, giaRimborsatoCent: caso() % (pagato + 1) };
      });
      const importo = 1 + (caso() % 120_000);
      const r = ripartisci(importo, ordini);
      const somma = r.parti.reduce((s, p) => s + p.cent, 0);
      assert.equal(somma + r.restoCent, importo);
      for (const p of r.parti) {
        const o = ordini.find((x) => x.id === p.id)!;
        assert.ok(p.cent > 0 && p.cent <= o.pagatoCent - o.giaRimborsatoCent);
      }
    }
  });
});

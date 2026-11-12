// The menu of the portal (the owner, 10 November 2026 — the study of the menu): groups by what the thing
// is (the lift, the calculations, the documents), one "Nuovo" for every kind of new document, a bottom bar
// on the phone (and a rail on the tablet) with at most four destinations plus "Menu". Only what the role can.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { can as roleCan, type Capability } from '../src/auth/roles.js';
import { correnteDi, menuPer, rapidoCorrente } from '../src/http/menu.js';
import type { Role } from '@prisma/client';

const per = (role: Role) => menuPer((cap: Capability) => roleCan(role, cap), 3);
const hrefs = (role: Role) => per(role).gruppi.flatMap((g) => g.voci.map((v) => v.href));

describe('the menu', () => {
  it('groups by what the thing is, with only what the role can', () => {
    assert.deepEqual(
      per('MASTER').gruppi.map((g) => g.key),
      ['impianti', 'calcoli', 'documenti', 'amministrazione', 'master'],
    );
    assert.deepEqual(hrefs('CLIENTE'), [
      '/schede',
      '/ordini',
      '/calcolo-argano',
      '/calcolo-limitatore',
      '/interventi',
      '/buoni',
      '/verbali',
      '/cartelli',
    ]);
    assert.deepEqual(hrefs('ADMIN').slice(-4), [
      '/utenti',
      '/impostazioni',
      '/registro',
      '/cestino',
    ]);
    assert.ok(!hrefs('ADMIN').includes('/master'), 'the console is ours only');
    assert.ok(hrefs('MASTER').includes('/master/verifica'));
  });

  it('never mixes creating with going somewhere: every new document is under "Nuovo"', () => {
    for (const role of ['MASTER', 'ADMIN', 'TECNICO', 'CLIENTE'] as const)
      for (const href of hrefs(role))
        assert.doesNotMatch(href, /\/(nuova|nuovo)$/, `${role} ${href}`);
    assert.deepEqual(
      per('TECNICO').nuovo.map((v) => v.href),
      [
        '/schede/nuova',
        '/interventi/nuovo',
        '/buoni/nuovo',
        '/verbali/nuovo',
        '/cartelli/nuovo',
        '/calcolo-argano/nuovo',
        '/calcolo-limitatore/nuovo',
      ],
    );
    assert.deepEqual(per('CLIENTE').nuovo, [], 'read only: nothing to create');
  });

  it('keeps the bottom bar to four destinations (the fifth is "Menu"), "Nuovo" only for who writes', () => {
    assert.deepEqual(
      per('TECNICO').rapidi.map((v) => v.href),
      ['/schede', '/interventi', '/nuovo', '/cerca'],
    );
    assert.deepEqual(
      per('CLIENTE').rapidi.map((v) => v.href),
      ['/schede', '/interventi', '/cerca'],
    );
  });

  it('shows the count of new requests on "Richieste" only', () => {
    const voci = per('MASTER').gruppi.flatMap((g) => g.voci);
    assert.equal(voci.find((v) => v.href === '/richieste')?.count, 3);
    assert.equal(voci.filter((v) => v.count).length, 1);
    assert.equal(
      menuPer(() => true, 0)
        .gruppi.flatMap((g) => g.voci)
        .find((v) => v.count),
      undefined,
    );
  });

  it('marks the longest matching item as the current one', () => {
    const all = per('MASTER').gruppi.flatMap((g) => g.voci.map((v) => v.href));
    assert.equal(correnteDi(all, '/master/contratti'), '/master/contratti');
    assert.equal(correnteDi(all, '/master'), '/master');
    assert.equal(correnteDi(all, '/schede/abc/calcolo-argano'), '/schede');
    assert.equal(correnteDi(all, '/schedex'), undefined);
    assert.equal(rapidoCorrente(per('TECNICO'), '/schede/nuova'), '/nuovo');
    assert.equal(rapidoCorrente(per('TECNICO'), '/interventi/42'), '/interventi');
  });
});

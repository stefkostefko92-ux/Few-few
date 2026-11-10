// The names and rights of the roles per company (the owner, 30 October 2026): what a company admin may
// change for the roles below, read back with distrust, and the audit log limited to one's own actions
// and those of the roles below.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chiudi, nomiSalvati, permessiSalvati, predefiniti, puo } from '../src/auth/permessi.js';
import { registroWhere, ruoliSotto } from '../src/auth/registro.js';
import { canAnywhere, canIn, scopeFor } from '../src/auth/scope.js';
import { parseRuoli } from '../src/aziende/ruoli.js';

const nome = (role: string) => ({ ADMIN: 'Amministratore', CLIENTE: 'Cliente' })[role] ?? role;

describe('the rights of a role in a company', () => {
  it('follow the hierarchy until the company changes them', () => {
    assert.equal(puo('TECNICO', 'schede:write'), true);
    assert.equal(puo('TECNICO', 'schede:write', { TECNICO: ['schede:read'] }), false);
    assert.equal(puo('OPERATORE', 'audit:view', { OPERATORE: ['audit:view'] }), true);
    assert.equal(puo('OPERATORE', 'audit:view', { TECNICO: ['audit:view'] }), false);
  });

  it('never touch the admin, the master or the rights kept by the hierarchy', () => {
    const tutto = { DIREZIONE: [] as const };
    assert.equal(puo('ADMIN', 'schede:read', tutto), true);
    assert.equal(puo('MASTER', 'aziende:manage', tutto), true);
    // A forged entry cannot hand out what is not configurable.
    const forged = permessiSalvati({
      CLIENTE: ['users:manage', 'aziende:settings', 'schede:read'],
    });
    assert.deepEqual(forged, { CLIENTE: ['schede:read'] });
    assert.equal(puo('CLIENTE', 'users:manage', forged), false);
    assert.equal(puo('CLIENTE', 'aziende:settings', forged), false);
  });

  it('read back with distrust: unknown roles and rights go, writing brings reading along', () => {
    assert.deepEqual(permessiSalvati(null), {});
    assert.deepEqual(permessiSalvati(['x']), {});
    assert.deepEqual(
      permessiSalvati({ ADMIN: [], MASTER: ['audit:view'], __proto__: { x: 1 } }),
      {},
    );
    assert.deepEqual(permessiSalvati({ TECNICO: ['schede:trash', 'nope'] }), {
      TECNICO: ['schede:read', 'schede:trash'],
    });
    assert.deepEqual(chiudi(['interventi:write']), ['interventi:read', 'interventi:write']);
    assert.deepEqual(
      nomiSalvati({ TECNICO: '  Manutentore\u0007 ', MASTER: 'Capo', CLIENTE: '' }),
      {
        TECNICO: 'Manutentore',
      },
    );
  });

  it('decide the scope of a member of two companies, each with its own rights', () => {
    const user = {
      master: false,
      memberships: [
        { aziendaId: 'a', aziendaName: 'A', role: 'TECNICO' as const },
        {
          aziendaId: 'b',
          aziendaName: 'B',
          role: 'TECNICO' as const,
          permessi: { TECNICO: ['schede:read' as const] },
        },
      ],
    };
    assert.equal(canIn(user, 'schede:write', 'a'), true);
    assert.equal(canIn(user, 'schede:write', 'b'), false);
    assert.deepEqual(scopeFor(user, 'schede:write'), { all: false, aziendaIds: ['a'] });
    assert.equal(canAnywhere(user, 'schede:write'), true);
  });
});

describe('the roles form of the settings', () => {
  it('stores only what differs from the defaults', () => {
    const body: Record<string, unknown> = { 'nome-TECNICO': 'Manutentore', 'nome-ADMIN': '' };
    for (const role of ['DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE'] as const)
      body[`perm-${role}`] = predefiniti(role);
    body['perm-OPERATORE'] = [...predefiniti('OPERATORE'), 'audit:view'];
    body['perm-CLIENTE'] = 'schede:write';
    const parsed = parseRuoli(body, nome);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.nomi, { TECNICO: 'Manutentore' });
    assert.deepEqual(Object.keys(parsed.permessi).sort(), ['CLIENTE', 'OPERATORE']);
    assert.deepEqual(parsed.permessi.CLIENTE, ['schede:read', 'schede:write']);
  });

  it('refuses two roles with one name, a long name and a forged right', () => {
    const parsed = parseRuoli(
      {
        'nome-TECNICO': 'cliente',
        'nome-OPERATORE': 'x'.repeat(41),
        'nome-DIREZIONE': ['a', 'b'],
        'perm-CLIENTE': ['schede:read', 'users:manage'],
      },
      nome,
    );
    assert.ok(!parsed.ok);
    assert.deepEqual(parsed.errors, {
      'nome-DIREZIONE': 'invalid',
      'nome-OPERATORE': 'tooLong',
      'nome-CLIENTE': 'duplicato',
      'perm-CLIENTE': 'invalid',
    });
  });
});

describe('the audit log of a company', () => {
  it('shows one’s own actions and those of the roles below, never the master', () => {
    assert.deepEqual(ruoliSotto('ADMIN'), [
      'DIREZIONE',
      'RESPONSABILE',
      'TECNICO',
      'OPERATORE',
      'CLIENTE',
    ]);
    assert.deepEqual(ruoliSotto('CLIENTE'), []);
    const viewer = {
      id: 'u1',
      master: false,
      memberships: [{ aziendaId: 'a', aziendaName: 'A', role: 'TECNICO' as const }],
    };
    assert.deepEqual(registroWhere(viewer, { all: false, aziendaIds: ['a'] }, null), {
      OR: [
        {
          aziendaId: 'a',
          OR: [
            { actorId: 'u1' },
            {
              actor: {
                memberships: { some: { aziendaId: 'a', role: { in: ['OPERATORE', 'CLIENTE'] } } },
              },
            },
          ],
        },
      ],
    });
    assert.deepEqual(registroWhere(viewer, { all: false, aziendaIds: [] }, null), {
      aziendaId: { in: [] },
    });
    assert.deepEqual(registroWhere({ ...viewer, master: true }, { all: true }, null), {});
  });
});

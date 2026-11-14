// Who sees and writes quotes (the owner, 12 November 2026 — point C1: "off by default, turned on from the
// master settings"): only in a company where the MASTER turned quotes on; there, by default from
// RESPONSABILE up (prices are commercial information); the company's ADMIN can give or take them for the
// roles under him, writing brings reading. A company that ended (export only) gives nothing. The MASTER
// always can — the queries keep him to the companies with quotes on.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Role } from '@prisma/client';
import { activeMemberships } from '../src/auth/memberships.js';
import { chiudi, permessiSalvati, predefiniti, RUOLI_CONFIGURABILI } from '../src/auth/permessi.js';
import { canAnywhere, canIn, scopeFor } from '../src/auth/scope.js';
import { parseRuoli } from '../src/aziende/ruoli.js';
import type { MembershipView } from '../src/types.js';

const user = (role: Role, extra: Partial<MembershipView> = {}) => ({
  master: false,
  memberships: [{ aziendaId: 'a1', aziendaName: 'A', role, preventivi: true as const, ...extra }],
});

describe('quotes: who can', () => {
  it('only where the company has quotes on, from RESPONSABILE up by default', () => {
    for (const role of ['ADMIN', 'DIREZIONE', 'RESPONSABILE'] as const) {
      assert.ok(canIn(user(role), 'preventivi:read', 'a1'), role);
      assert.ok(canIn(user(role), 'preventivi:write', 'a1'), role);
    }
    for (const role of ['TECNICO', 'OPERATORE', 'CLIENTE'] as const) {
      assert.ok(!canIn(user(role), 'preventivi:read', 'a1'), role);
      assert.ok(!canIn(user(role), 'preventivi:write', 'a1'), role);
    }
    const spento = {
      master: false,
      memberships: [{ aziendaId: 'a1', aziendaName: 'A', role: 'ADMIN' as const }],
    };
    assert.ok(!canIn(spento, 'preventivi:read', 'a1'));
    assert.ok(!canAnywhere(spento, 'preventivi:read'));
    assert.deepEqual(scopeFor(spento, 'preventivi:read'), { all: false, aziendaIds: [] });
    // The rest of the work does not depend on the switch.
    assert.ok(canIn(spento, 'schede:write', 'a1'));
  });

  it('follows the roles set by the company, writing brings reading', () => {
    assert.ok(predefiniti('RESPONSABILE').includes('preventivi:write'));
    assert.ok(!predefiniti('TECNICO').includes('preventivi:read'));
    assert.deepEqual(chiudi(['preventivi:write']), ['preventivi:read', 'preventivi:write']);
    const permessi = permessiSalvati({ TECNICO: ['schede:read', 'preventivi:read'] });
    assert.ok(canIn(user('TECNICO', { permessi }), 'preventivi:read', 'a1'));
    assert.ok(!canIn(user('TECNICO', { permessi }), 'preventivi:write', 'a1'));
    const tolto = permessiSalvati({ RESPONSABILE: ['schede:read'] });
    assert.ok(!canIn(user('RESPONSABILE', { permessi: tolto }), 'preventivi:read', 'a1'));
  });

  it('nothing in a company that ended; the MASTER always', () => {
    assert.ok(!canIn(user('ADMIN', { soloEsportazione: true }), 'preventivi:read', 'a1'));
    assert.ok(canIn({ master: true, memberships: [] }, 'preventivi:write', 'a1'));
  });

  it('keeps the saved quote rights when the form does not show them (quotes off)', () => {
    const body: Record<string, unknown> = {};
    for (const role of RUOLI_CONFIGURABILI)
      body[`perm-${role}`] = predefiniti(role).filter((c) => !c.startsWith('preventivi:'));
    body['perm-TECNICO'] = ['schede:read'];
    const nascoste = ['preventivi:read', 'preventivi:write'] as const;
    // Nothing saved: the defaults stay (RESPONSABILE keeps quotes for when the MASTER turns them on).
    const a = parseRuoli(body, (r) => r, { nascoste, salvati: {} });
    assert.ok(a.ok);
    assert.deepEqual(Object.keys(a.permessi), ['TECNICO']);
    assert.deepEqual(a.permessi.TECNICO, ['schede:read']);
    // Saved: TECNICO reads quotes, RESPONSABILE does not write them — both stay as they were.
    const salvati = permessiSalvati({
      TECNICO: ['schede:read', 'preventivi:read'],
      RESPONSABILE: predefiniti('RESPONSABILE').filter((c) => c !== 'preventivi:write'),
    });
    const b = parseRuoli(
      { ...body, 'perm-TECNICO': ['schede:read', 'preventivi:write'] },
      (r) => r,
      {
        nascoste,
        salvati,
      },
    );
    assert.ok(b.ok);
    assert.deepEqual(b.permessi.TECNICO, ['schede:read', 'preventivi:read']);
    assert.ok(!b.permessi.RESPONSABILE?.includes('preventivi:write'));
    assert.ok(b.permessi.RESPONSABILE?.includes('preventivi:read'));
  });

  it('reads the switch of the company into the session', () => {
    const [acceso, spento] = activeMemberships([
      {
        aziendaId: 'a1',
        role: 'ADMIN',
        azienda: { name: 'A', deactivatedAt: null, preventiviAttivi: true },
      },
      {
        aziendaId: 'a2',
        role: 'ADMIN',
        azienda: { name: 'B', deactivatedAt: null, preventiviAttivi: false },
      },
    ]);
    assert.equal(acceso!.preventivi, true);
    assert.equal(spento!.preventivi, undefined);
  });
});

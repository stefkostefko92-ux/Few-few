// After the end of the service (switching provider or deactivation by the MASTER) the company's data stay
// 90 days before the deletion (conditions art. 17.3; Data Act art. 25(2)(g) — at least 30 days to retrieve
// them). In that window the company's ADMIN still signs in, but only to download the export: every
// capability in that company is off, the terms and the rules are not asked again, and a person who is only
// there lands on the export page. Everyone else of the company stays out, as before.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Role } from '@prisma/client';
import { activeMemberships } from '../src/auth/memberships.js';
import { canAnywhere, canIn, scopeFor } from '../src/auth/scope.js';
import { daAccettare } from '../src/legale/stato.js';
import { soloEsportazione } from '../src/auth/memberships.js';
import { GIORNI_PRIMA_DELL_ELIMINAZIONE } from '../src/aziende/cambio-tempi.js';
import { DAY } from '../src/time.js';

const now = Date.parse('2026-12-20T10:00:00Z');
const riga = (role: Role, deactivatedAt: Date | null, name = 'Ascensori Fine') => ({
  aziendaId: `id-${name}`,
  role,
  azienda: { name, deactivatedAt, condizioniVersione: null },
});

describe('the export-only access after the end of the service', () => {
  it('keeps only the ADMIN of a deactivated company, and only within the 90 days', () => {
    assert.equal(GIORNI_PRIMA_DELL_ELIMINAZIONE, 90);
    const ieri = new Date(now - DAY);
    const [admin] = activeMemberships([riga('ADMIN', ieri)], now);
    assert.equal(admin?.soloEsportazione, true);
    for (const role of ['DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE'] as const)
      assert.deepEqual(activeMemberships([riga(role, ieri)], now), [], role);
    const scaduta = new Date(now - GIORNI_PRIMA_DELL_ELIMINAZIONE * DAY - 1);
    assert.deepEqual(activeMemberships([riga('ADMIN', scaduta)], now), []);
    const [attiva] = activeMemberships([riga('ADMIN', null)], now);
    assert.equal(attiva?.soloEsportazione, undefined);
  });

  it('gives no capability in that company, even to its ADMIN', () => {
    const memberships = activeMemberships(
      [riga('ADMIN', new Date(now - DAY)), riga('TECNICO', null, 'Ascensori Vivi')],
      now,
    );
    const user = { master: false, memberships };
    for (const cap of [
      'schede:read',
      'schede:write',
      'aziende:settings',
      'users:manage',
    ] as const) {
      assert.equal(canIn(user, cap, 'id-Ascensori Fine'), false, cap);
    }
    assert.equal(canIn(user, 'schede:read', 'id-Ascensori Vivi'), true);
    assert.deepEqual(scopeFor(user, 'schede:read'), {
      all: false,
      aziendaIds: ['id-Ascensori Vivi'],
    });
    const solo = {
      master: false,
      memberships: activeMemberships([riga('ADMIN', new Date(now - DAY))], now),
    };
    assert.equal(canAnywhere(solo, 'aziende:settings'), false);
  });

  it('asks nothing to accept for an ended company, and tells when a person has only those', () => {
    const memberships = activeMemberships([riga('ADMIN', new Date(now - DAY))], now);
    const user = { master: false, memberships, regoleVersione: null };
    assert.deepEqual(daAccettare(user), { condizioni: null, azienda: null, regole: false });
    assert.equal(soloEsportazione(user), true);
    const misto = activeMemberships(
      [riga('ADMIN', new Date(now - DAY)), riga('TECNICO', null, 'Ascensori Vivi')],
      now,
    );
    assert.equal(soloEsportazione({ master: false, memberships: misto }), false);
    assert.equal(soloEsportazione({ master: true, memberships: [] }), false);
  });
});

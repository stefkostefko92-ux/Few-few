// Who must accept what before using the portal (the owner, 10 November 2026: "Fai tutto in modo tale da
// essere legalmente coperti e minimamente esposti"): the company's terms of service are accepted for it by
// its ADMIN only (with the specific approval of the listed clauses); the rules of use by every person
// himself; the portal owner (MASTER) is the provider and accepts nothing. A new version asks again.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daAccettare, inAttesa, type UtenteAccettazioni } from '../src/legale/stato.js';
import { VERSIONE } from '../src/legale/versioni.js';
import type { Role } from '@prisma/client';

const utente = (
  role: Role,
  condizioni: string | null,
  regole: string | null,
): UtenteAccettazioni => ({
  master: false,
  regoleVersione: regole,
  memberships: [
    { aziendaId: 'a1', aziendaName: 'Ascensori Prova', role, condizioniVersione: condizioni },
  ],
});

describe('what a person still has to accept', () => {
  it('nothing for the portal owner, who is the provider', () => {
    const stato = daAccettare({ master: true, memberships: [], regoleVersione: null });
    assert.deepEqual(stato, { condizioni: null, azienda: null, regole: false });
    assert.equal(inAttesa(stato), false);
  });

  it('the ADMIN accepts the terms for the company; anyone else waits for him', () => {
    assert.equal(daAccettare(utente('ADMIN', null, null)).condizioni, 'accetta');
    for (const role of ['DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE'] as const)
      assert.equal(daAccettare(utente(role, null, null)).condizioni, 'attendi', role);
  });

  it('the rules of use are accepted by everyone himself', () => {
    const stato = daAccettare(utente('TECNICO', VERSIONE.CONDIZIONI, null));
    assert.deepEqual(stato, { condizioni: null, azienda: null, regole: true });
    assert.equal(inAttesa(stato), true);
  });

  it('both in the current version: nothing to accept', () => {
    const stato = daAccettare(utente('TECNICO', VERSIONE.CONDIZIONI, VERSIONE.REGOLE));
    assert.deepEqual(stato, { condizioni: null, azienda: null, regole: false });
    assert.equal(inAttesa(stato), false);
  });

  it('an older version counts as not accepted', () => {
    const stato = daAccettare(utente('ADMIN', '2000-01-01', '2000-01-01'));
    assert.deepEqual(stato, {
      condizioni: 'accetta',
      azienda: { id: 'a1', name: 'Ascensori Prova' },
      regole: true,
    });
  });

  it('in several companies: the one he is ADMIN of first, then the others; closed until all have them', () => {
    const membro = (aziendaId: string, role: Role, condizioniVersione: string | null) => ({
      aziendaId,
      aziendaName: aziendaId.toUpperCase(),
      role,
      condizioniVersione,
    });
    const base = { master: false, regoleVersione: VERSIONE.REGOLE };
    const alfaFatta = membro('alfa', 'ADMIN', VERSIONE.CONDIZIONI);
    assert.deepEqual(
      daAccettare({
        ...base,
        memberships: [alfaFatta, membro('beta', 'TECNICO', null), membro('gamma', 'ADMIN', null)],
      }),
      { condizioni: 'accetta', azienda: { id: 'gamma', name: 'GAMMA' }, regole: false },
    );
    assert.deepEqual(
      daAccettare({ ...base, memberships: [alfaFatta, membro('beta', 'TECNICO', null)] }),
      { condizioni: 'attendi', azienda: { id: 'beta', name: 'BETA' }, regole: false },
    );
  });
});

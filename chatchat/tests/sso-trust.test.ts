import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Role } from '@prisma/client';
import { accessBlock } from '../src/auth/guards.js';
import { ROLES } from '../src/auth/rbac.js';
import { mfaStateOf, type Principal } from '../src/auth/sessions.js';
import { checkTxt, domainToken, txtRecord } from '../src/services/sso/domains.js';
import {
  canUseSso,
  idpMfaAccepted,
  linkUsable,
  ownerLinkRequired,
  SSO_MANAGER_RANK,
} from '../src/services/sso/policy.js';

/**
 * Моделът на доверие на единния вход без база и мрежа: кой се свързва само сам, коя връзка може да
 * вписва, кога MFA при доставчика замества локалния TOTP, платформеният администратор (никога),
 * сесията само за свързване, токенът и проверката на DNS TXT записа.
 */

const at = new Date();
const who = (role: Role, totp = false) => ({ role, totpEnabledAt: totp ? at : null });

describe('кой се свързва само сам (ownerLinkRequired)', () => {
  test('границата е рангът на ролите със sso:manage (днес TENANT_ADMIN)', () => {
    assert.equal(SSO_MANAGER_RANK, 1);
    assert.equal(ownerLinkRequired(who('TENANT_ADMIN')), true);
    assert.equal(ownerLinkRequired(who('PLATFORM_ADMIN')), true);
  });

  test('всеки с включен локален TOTP — и техник', () => {
    for (const role of ROLES.filter((r) => r !== 'TENANT_ADMIN' && r !== 'PLATFORM_ADMIN')) {
      assert.equal(ownerLinkRequired(who(role)), false, role);
      assert.equal(ownerLinkRequired(who(role, true)), true, role);
    }
  });
});

describe('коя връзка вписва (linkUsable, canUseSso)', () => {
  test('платформеният администратор — никоя, дори от собственика', () => {
    assert.equal(linkUsable(who('PLATFORM_ADMIN', true), 'SELF'), false);
    assert.equal(linkUsable(who('PLATFORM_ADMIN', true), 'EMAIL'), false);
    assert.equal(canUseSso(who('PLATFORM_ADMIN'), null), false);
  });

  test('администраторът на клиента — само собствена връзка', () => {
    assert.equal(linkUsable(who('TENANT_ADMIN', true), 'SELF'), true);
    assert.equal(linkUsable(who('TENANT_ADMIN', true), 'EMAIL'), false);
    assert.equal(canUseSso(who('TENANT_ADMIN', true), null), false);
  });

  test('техник/персонал: по имейл без TOTP; с TOTP — само ако вече има връзка', () => {
    assert.equal(canUseSso(who('PORTAL_TECHNICIAN'), null), true);
    assert.equal(canUseSso(who('SUPPORT'), null), true);
    assert.equal(canUseSso(who('SUPPORT', true), null), false);
    assert.equal(canUseSso(who('SUPPORT', true), { linkMethod: 'EMAIL' }), true);
    assert.equal(canUseSso(who('SUPPORT', true), { linkMethod: 'SELF' }), true);
  });
});

describe('MFA при доставчика вместо локалния TOTP (idpMfaAccepted)', () => {
  const trust = { trustIdpMfa: true };
  test('само с доверие на клиента и amr ∋ mfa', () => {
    assert.equal(idpMfaAccepted({ trustIdpMfa: false }, true, who('SUPPORT'), 'EMAIL'), false);
    assert.equal(idpMfaAccepted(trust, false, who('SUPPORT'), 'SELF'), false);
    assert.equal(idpMfaAccepted(trust, true, who('SUPPORT'), 'EMAIL'), true);
  });

  test('връзка по имейл НЕ прескача TOTP, който собственикът е включил; собствена — да', () => {
    assert.equal(idpMfaAccepted(trust, true, who('SUPPORT', true), 'EMAIL'), false);
    assert.equal(idpMfaAccepted(trust, true, who('SUPPORT', true), 'SELF'), true);
    assert.equal(idpMfaAccepted(trust, true, who('TENANT_ADMIN', true), 'SELF'), true);
  });

  test('платформеният администратор — никога', () => {
    assert.equal(idpMfaAccepted(trust, true, who('PLATFORM_ADMIN', true), 'SELF'), false);
    // И в самата сесия (защита в дълбочина): mfaViaIdp не важи за него.
    const state = mfaStateOf(who('PLATFORM_ADMIN', true), false, true);
    assert.equal(state.idp, undefined);
    assert.equal(state.passed, false);
    assert.equal(mfaStateOf(who('SUPPORT'), false, true).idp, true);
  });
});

describe('сесия само за свързване (accessBlock)', () => {
  const principal = (over: Partial<Principal['session']>, mfa: Principal['mfa']): Principal => ({
    user: {
      id: 'u1',
      tenantId: 't1',
      companyId: null,
      name: 'A',
      role: 'TENANT_ADMIN',
      kind: 'INTERNAL',
      locale: 'it',
    },
    session: { id: 's1', csrfToken: 'c', ...over },
    mfa,
  });
  const passed = { enabled: true, passed: true, required: true };

  test('първо вторият фактор, после свързването — до данни никога', () => {
    const notPassed = { enabled: true, passed: false, required: true };
    assert.deepEqual(accessBlock(principal({ ssoLinkOnly: true }, notPassed)), {
      status: 401,
      code: 'mfa_required',
    });
    assert.deepEqual(accessBlock(principal({ ssoLinkOnly: true }, passed)), {
      status: 403,
      code: 'sso_link_required',
    });
    assert.equal(accessBlock(principal({}, passed)), null);
  });
});

describe('DNS TXT за доказване на домейн', () => {
  const row = { configId: 'cfg1', domain: 'alfa.example', tokenNonce: 'n1' };

  test('токенът е вързан към доставчика, домейна и nonce-а', () => {
    const t = domainToken('pepper', row);
    assert.match(t, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(domainToken('pepper', row), t);
    assert.notEqual(domainToken('pepper', { ...row, configId: 'cfg2' }), t);
    assert.notEqual(domainToken('pepper', { ...row, domain: 'beta.example' }), t);
    assert.notEqual(domainToken('pepper', { ...row, tokenNonce: 'n2' }), t);
    assert.notEqual(domainToken('other', row), t);
    assert.deepEqual(txtRecord('pepper', row), {
      host: '_chatchat.alfa.example',
      value: `chatchat-verify=${t}`,
    });
  });

  test('правилен (и на парчета) → verified; чужд → mismatch; липсващ/грешка', async () => {
    const want = txtRecord('pepper', row);
    const half = want.value.length / 2;
    const fixed = (records: string[][]) => async () => records;
    assert.equal(await checkTxt(fixed([['v=spf1 -all'], [want.value]]), want), 'verified');
    assert.equal(
      await checkTxt(fixed([[want.value.slice(0, half), want.value.slice(half)]]), want),
      'verified',
    );
    assert.equal(await checkTxt(fixed([[`${want.value} `]]), want), 'verified');
    const upper = `chatchat-verify=${domainToken('pepper', row).toUpperCase()}`;
    assert.equal(await checkTxt(fixed([[upper]]), want), 'txt_mismatch');
    assert.equal(await checkTxt(fixed([['chatchat-verify=other']]), want), 'txt_mismatch');
    assert.equal(await checkTxt(fixed([['v=spf1 -all']]), want), 'txt_missing');
    const failing = (code: string) => async () => {
      throw Object.assign(new Error(code), { code });
    };
    assert.equal(await checkTxt(failing('ENOTFOUND'), want), 'txt_missing');
    assert.equal(await checkTxt(failing('ENODATA'), want), 'txt_missing');
    assert.equal(await checkTxt(failing('ESERVFAIL'), want), 'dns_error');
    assert.equal(await checkTxt(failing('ETIMEOUT'), want), 'dns_error');
  });
});

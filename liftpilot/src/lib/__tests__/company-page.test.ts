// The company page (/app/company) and its link in the menu (round 42; the order of the sections, round 43): there for a
// role that holds 'company:export' or 'company:edit' whatever the subscription, so that a Capotecnico given only the
// logo and the order learns in a read-only company why nothing changes, instead of a page saying his role lacks the
// export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyPageView } from '../company-page';
import { capsOf, type Override } from '../rbac';

const C = 'CHIEF_TECHNICIAN' as const;
const chief = (grants: Array<'company:edit' | 'company:export'>, readOnly = false) => {
  const overrides: Override[] = grants.map((capability) => ({ role: C, capability, granted: true }));
  return { role: C, readOnly, caps: capsOf(C, overrides) };
};

test('il titolare: logo, ordine delle sezioni ed esportazione; in sola lettura il logo e l’ordine si vedono soltanto', () => {
  assert.deepEqual(companyPageView({ role: 'OWNER' }), { exports: true, logo: 'form', sezioni: 'edit' });
  assert.deepEqual(companyPageView({ role: 'OWNER', readOnly: true }), { exports: true, logo: 'readOnly', sezioni: 'view' });
});

test('il Capotecnico col solo «company:edit» in un’azienda in sola lettura vede la pagina: la nota del logo, l’ordine senza frecce', () => {
  assert.deepEqual(companyPageView(chief(['company:edit'])), { exports: false, logo: 'form', sezioni: 'edit' });
  assert.deepEqual(companyPageView(chief(['company:edit'], true)), { exports: false, logo: 'readOnly', sezioni: 'view' });
});

test('il Capotecnico col solo «company:export»: i dati, il logo senza il diritto, nessun ordine; senza nessuno dei due, niente pagina', () => {
  for (const readOnly of [false, true]) {
    assert.deepEqual(companyPageView(chief(['company:export'], readOnly)), { exports: true, logo: 'noRight', sezioni: null }, String(readOnly));
    assert.equal(companyPageView(chief([], readOnly)), null, String(readOnly));
  }
  // the other roles never get either right (only the Capotecnico's column can have them)
  for (const role of ['ENGINEER', 'TECHNICIAN', 'SALES'] as const) assert.equal(companyPageView({ role }), null, role);
});

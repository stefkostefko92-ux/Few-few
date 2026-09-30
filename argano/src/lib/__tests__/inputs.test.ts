// External input: the calculator values and the forms are validated before anything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { formValuesSchema, visibleBad } from '../calc-input';
import { loginSchema, newPasswordSchema, projectSchema, userCreateSchema } from '../schemas';
import { passwordPolicyOk } from '../password-policy';

test('valori del calcolatore: gli esempi passano, il resto no', () => {
  for (const k of ['A', 'B', 'C'] as const) assert.ok(formValuesSchema.safeParse(PRESETS[k]).success, k);
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, evil: '1' }).success, false, 'campo sconosciuto');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: 'x'.repeat(33) }).success, false, 'stringa lunga');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: Number.POSITIVE_INFINITY }).success, false, 'numero non finito');
  assert.equal(formValuesSchema.safeParse({ ...PRESETS.B, Q: { a: 1 } }).success, false, 'oggetto');
});

test('campi non validi mostrati solo se visibili', () => {
  assert.deepEqual(visibleBad(['Q', 'Hv', 'o_D'], { ...PRESETS.C }), ['Q', 'o_D']);
  assert.deepEqual(visibleBad(['o_D'], { ...PRESETS.A }), []);
  assert.deepEqual(visibleBad(['Hv', 'Hv'], { ...PRESETS.B }), ['Hv']);
});

test('moduli: e-mail normalizzata, testi opzionali a null, password', () => {
  assert.equal(loginSchema.parse({ email: '  Mario.Rossi@Example.IT ', password: 'x' }).email, 'mario.rossi@example.it');
  const p = projectSchema.parse({ name: ' Impianto A ', address: '', city: 'Milano', province: '', plantNumber: '', client: '', notes: '' });
  assert.deepEqual([p.name, p.address, p.city], ['Impianto A', null, 'Milano']);
  assert.equal(projectSchema.safeParse({ name: '', address: '', city: '', province: '', plantNumber: '', client: '', notes: '' }).success, false);
  assert.equal(userCreateSchema.safeParse({ email: 'a@b.it', name: 'A', role: 'SUPERADMIN' }).success, false, 'SUPERADMIN non assegnabile');
  assert.ok(passwordPolicyOk('Ascensore2026x') && !passwordPolicyOk('Ascensore26') && !passwordPolicyOk('abcdefghijklm'));
  assert.equal(newPasswordSchema.safeParse({ current: 'a', next: 'Ascensore2026x', confirm: 'Ascensore2026y' }).success, false);
});

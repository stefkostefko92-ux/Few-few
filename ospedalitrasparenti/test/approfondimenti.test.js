// Тестове за съдържателния слой: CPV класификация на макрокатегории.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificaCpv, CPV_LABELS } from '../src/approfondimenti.js';

test('classificaCpv — реални ANAC описания в правилните категории', () => {
  assert.equal(classificaCpv('MEDICINALI VARI'), 'farmaci');
  assert.equal(classificaCpv('DISPOSITIVI E PRODOTTI MEDICI VARI'), 'dispositivi');
  assert.equal(classificaCpv('SISTEMI DIAGNOSTICI'), 'dispositivi');
  assert.equal(classificaCpv('APPARECCHIATURE BIOMEDICHE'), 'apparecchiature');
  assert.equal(classificaCpv('SERVIZI DI PULIZIA'), 'pulizia');
  assert.equal(classificaCpv('Servizi di magazzino'), 'logistica');
  assert.equal(classificaCpv('SERVIZI DI AMBULANZA'), 'trasporti');
  assert.equal(classificaCpv('ENERGIA ELETTRICA'), 'energia');
  assert.equal(classificaCpv('SERVIZI DI RISTORAZIONE'), 'ristorazione');
  assert.equal(classificaCpv('SOMMINISTRAZIONE DI PERSONALE INFERMIERISTICO'), 'lavoro');
  assert.equal(classificaCpv('SERVIZI DI VIGILANZA'), 'vigilanza');
  assert.equal(classificaCpv('SMALTIMENTO RIFIUTI SANITARI'), 'rifiuti');
});

test('classificaCpv — приоритет и ръбови случаи', () => {
  // фармацията бие по-общите правила
  assert.equal(classificaCpv('SOLUZIONI PER INFUSIONE'), 'farmaci');
  // празно/липсващо → altro
  assert.equal(classificaCpv(''), 'altro');
  assert.equal(classificaCpv(null), 'altro');
  assert.equal(classificaCpv('QUALCOSA DI COMPLETAMENTE DIVERSO'), 'altro');
});

test('CPV_LABELS — всяка категория от правилата има етикет', () => {
  const chiavi = ['farmaci', 'dispositivi', 'apparecchiature', 'informatica', 'pulizia', 'ristorazione', 'vigilanza', 'costruzioni', 'energia', 'manutenzione', 'trasporti', 'lavoro', 'sociosanitari', 'consulenze', 'logistica', 'rifiuti', 'assicurazioni', 'altro'];
  for (const k of chiavi) assert.ok(CPV_LABELS[k], k);
});

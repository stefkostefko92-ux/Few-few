// The controller, the car and the doors of the relazione tecnica di modifica, by hand (RT plan §11.4): the control
// circuits at most 250 V, the existing locks' contacts at most 25 V a.c. / 50 V d.c.; the fire classes (E60 against an
// existing EI30: not decided, an attention; EI60 against E60: not lower; E30 against E60: lower), the landing doors'
// height (1950 against 1900: met; 1850: the point of UNI EN 81-21 5.12); a kept car's area against the new load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxArea } from '@/shaft/area';
import { areaEsistente } from '../rt/componenti/cabina';
import { altezzaPorta, confrontoFuoco } from '../rt/componenti/porte';
import { tensioneComando, tensioneContatti } from '../rt/componenti/quadro';
import { SITO_RT } from '../rt/componenti/punti';
import { KR } from '../rt/norme';

test('quadro: circuiti di comando e di sicurezza fino a 250 V; contatti delle serrature 25 V c.a. e 50 V c.c.', () => {
  assert.equal(tensioneComando(250).status, 'ok');
  assert.equal(tensioneComando(251).status, 'fail');
  assert.equal(tensioneComando(48).limit, KR.ctrlVoltageMax);
  assert.deepEqual([tensioneContatti(25, 'ca').status, tensioneContatti(26, 'ca').status], ['ok', 'fail']);
  assert.deepEqual([tensioneContatti(50, 'cc').status, tensioneContatti(51, 'cc').status], ['ok', 'fail']);
  assert.deepEqual([tensioneContatti(48, 'ca').limit, tensioneContatti(48, 'cc').limit], [KR.lockContactAc, KR.lockContactDc]);
});

test('porte: classi di resistenza al fuoco (E60 su EI30 da decidere, EI60 su E60 non inferiore, E30 su E60 inferiore)', () => {
  assert.equal(confrontoFuoco('EI30', 'E60').status, 'warn');
  assert.equal(confrontoFuoco('E60', 'EI60').status, 'ok');
  assert.equal(confrontoFuoco('E60', 'E30').status, 'fail');
  assert.equal(confrontoFuoco('EI60', 'EI30').status, 'fail');
  assert.equal(confrontoFuoco('E60', 'EI30').status, 'warn', 'la I in più con meno minuti');
  assert.equal(confrontoFuoco('EI60', 'E120').status, 'warn');
  assert.equal(confrontoFuoco('EI60', 'E60').status, 'fail', 'stessi minuti senza la I dell’esistente: inferiore');
  assert.equal(confrontoFuoco('EI30', 'E30').status, 'fail');
  assert.equal(confrontoFuoco('nessuna', 'nessuna').status, 'ok', 'nessuna classe da mantenere');
  assert.equal(confrontoFuoco('E30', 'E30').status, 'ok');
  assert.deepEqual([confrontoFuoco('E60', 'EI120').value, confrontoFuoco('E60', 'EI120').limit], [120, 60]);
});

test('porte: 2000 mm soddisfatta; più bassa solo con i vincoli dell’edificio (attenzione), mai sotto l’esistente né sotto 1800 mm', () => {
  assert.deepEqual(altezzaPorta(2000, 1900), { status: 'ok', value: 2000, limit: 2000 });
  assert.equal(altezzaPorta(2000, 2100).limit, 2000, 'mai oltre i 2000 mm della UNI EN 81-20');
  // an existing door already at 2000 mm shows the openings allow them: a lower new door is not met, the limit 2000 mm
  assert.deepEqual(altezzaPorta(1980, 2100), { status: 'fail', value: 1980, limit: 2000 });
  // between the existing door (or 1800 mm) and 2000 mm: only where the building's openings do not allow 2000 mm, the
  // engineer's statement — never «met» by itself
  assert.deepEqual(altezzaPorta(1950, 1900), { status: 'warn', value: 1950, limit: 1900 });
  assert.equal(altezzaPorta(1850, 1800).status, 'warn');
  assert.equal(altezzaPorta(1850, 1900).status, 'fail', 'sotto la porta esistente');
  // under 1900 mm UNI EN 81-21 5.12: never under 1800 mm, even with a lower existing door
  assert.deepEqual(altezzaPorta(1750, 1700), { status: 'fail', value: 1750, limit: 1800 });
  assert.equal(altezzaPorta(1800, 1700).status, 'warn');
  assert.deepEqual([KR.doorHeightEn8121, KR.doorHeightMin8121, KR.doorLintelAngle], [1900, 1800, 30]);
  assert.ok(SITO_RT.porteBasse.rif.startsWith('UNI EN 81-21:2022, 5.12') && SITO_RT.porteBasse.testo.includes('1900 mm'));
  for (const t of ['1800 mm', '30°', 'spigoli dell’architrave']) assert.ok(SITO_RT.porteBasse.testo.includes(t), t);
  for (const n of ['10411-1', '10411-11'] as const) assert.match(SITO_RT.porteVincoli(n).testo, /condizione che dichiara il tecnico/);
});

test('cabina che resta: la superficie documentata contro la massima per la nuova portata, solo attenzione', () => {
  assert.equal(areaEsistente(1.45, 630).status, 'info', 'la UNI 10411 non la chiede: un’informazione, mai «Soddisfatta»');
  assert.equal(areaEsistente(1.8, 630).status, 'warn', 'mai un esito negativo');
  assert.equal(areaEsistente(1.8, 630).limit, maxArea(630));
});

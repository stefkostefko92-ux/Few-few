// Тестове за SIOPE агрегацията (касови плащания на здравните структури).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggrega, macroDi, eSanitario } from '../src/fetch-siope.js';

// Помощник: кумулативен ред за (ente, код) в даден месец.
const riga = (ente, code, mese, imp) => ({
  'Anno/Mese calendario': `2025/${String(mese).padStart(2, '0')}`,
  'Descrizione Ente BDAP': ente,
  'Codice Gestionale Enti Locali': code,
  'Importo cumulato': String(imp),
});

// Персонал: равномерно +100/месец (кумулативно 100,200,…,1200).
const personale = (ente) =>
  Array.from({ length: 12 }, (_, i) => riga(ente, 'U1103000000', i + 1, (i + 1) * 100));

test('SIOPE — месечни потоци (разлика на кумулативните), макро и dicSuMedia', () => {
  const rows = [
    ...personale('OSPEDALE A'), // U1103 → Personale, поток 100/мес
    // Фармацевтика: само декемврийски ред (кумулативно 600) — тества форуърд-фил
    // на липсващите месеци (яну–ное = 0) и декемврийския скок.
    riga('OSPEDALE A', 'U2101000000', 12, 600),
  ];
  const agg = aggrega({ '120': rows });

  assert.equal(agg.anno, 2025);

  const reg = agg.perRegione['120'];
  // общ = 1200 (personale) + 600 (farmaci) = 1800
  assert.equal(reg.spesaTotale, 1800);
  // макро-групиране
  assert.equal(reg.perMacro.Personale, 1200);
  assert.equal(reg.perMacro.Farmaci, 600);
  assert.equal(reg.perMacro.Dispositivi, 0);

  // месечни потоци: яну–ное = 100 (само персонал), декември = 100 + 600 = 700
  assert.deepEqual(reg.mesi, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 700]);

  // dicSuMedia = декември / (общо/12) = 700 / (1800/12) = 700 / 150 = 4,6667
  assert.ok(Math.abs(reg.dicSuMedia - 700 / 150) < 1e-9);

  // националното огледало (един регион)
  assert.equal(agg.nazionale.spesaTotale, 1800);
  assert.equal(agg.nazionale.perMacro.Farmaci, 600);
  assert.deepEqual(agg.nazionale.mesi, reg.mesi);
  assert.ok(Math.abs(agg.nazionale.dicSuMedia - 700 / 150) < 1e-9);
});

test('SIOPE — сумиране по региони и равномерен декември (dicSuMedia≈1)', () => {
  const agg = aggrega({
    '120': personale('OSP A'), // 1200 общо
    '010': personale('OSP B'), // 1200 общо
  });
  // два региона → национален тотал 2400
  assert.equal(agg.nazionale.spesaTotale, 2400);
  // равномерен поток → декември = средния месец → dicSuMedia = 1
  assert.ok(Math.abs(agg.perRegione['120'].dicSuMedia - 1) < 1e-9);
  assert.ok(Math.abs(agg.nazionale.dicSuMedia - 1) < 1e-9);
  assert.deepEqual(agg.nazionale.mesi, new Array(12).fill(200));
});

test('SIOPE — макро-групиране на икономическите кодове', () => {
  assert.equal(macroDi('U2101000000'), 'Farmaci'); // prodotti farmaceutici
  assert.equal(macroDi('U3106'), 'Farmaci'); // farmaceutica da privati
  assert.equal(macroDi('U2112000000'), 'Dispositivi'); // dispositivi medici
  assert.equal(macroDi('U2198'), 'Dispositivi'); // altri beni sanitari
  assert.equal(macroDi('U3109000000'), 'ServiziPrivati'); // specialistica da privati
  assert.equal(macroDi('U3103'), 'ServiziPrivati'); // medicina di base convenzionata
  assert.equal(macroDi('U1103000000'), 'Personale'); // competenze personale
  assert.equal(macroDi('U1205'), 'Personale'); // ritenute personale
  assert.equal(macroDi('U3299000000'), 'Altro'); // servizi non sanitari
  assert.equal(macroDi('U5404'), 'Altro'); // IVA
  assert.equal(macroDi(''), 'Altro');
});

test('SIOPE — филтър health (само операционните аджиенде)', () => {
  // включени
  assert.equal(eSanitario('AS'), true); // ASL
  assert.equal(eSanitario('AO'), true); // Azienda Ospedaliera
  assert.equal(eSanitario('IR'), true); // IRCCS
  assert.equal(eSanitario('IZ'), true); // IZS
  // изключени: регионална консолидация и невиждащи болници
  assert.equal(eSanitario('RS'), false); // Regioni — Gestione Sanitaria (GSA)
  assert.equal(eSanitario('CP'), false); // Gestioni centrali pagamenti SSN
  assert.equal(eSanitario('UN'), false); // Università
  assert.equal(eSanitario('CM'), false); // Comuni
  assert.equal(eSanitario(''), false);
});

test('SIOPE — дубликат за същия месец не се сумира (пази по-голямата кумулативна)', () => {
  const rows = [
    riga('OSP', 'U2101', 12, 500),
    riga('OSP', 'U2101', 12, 500), // дубликат → НЕ става 1000
  ];
  const agg = aggrega({ '120': rows });
  assert.equal(agg.perRegione['120'].spesaTotale, 500);
});

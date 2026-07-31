import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  costoMedioPonderato,
  giorniFra,
  indiceRotazione,
  margine,
  meseCorrenteEPrecedente,
  nomeFileReport,
  periodoPrecedente,
  quota,
  risolviPeriodo,
  toCsv,
  variazione,
  type ColonnaCsv,
} from '../report';

const OGGI = new Date('2026-07-31T10:00:00');

// ─────────────────────────── Calcoli ───────────────────────────

test('costoMedioPonderato pondera per quantità, non fa la media semplice', () => {
  // 10 pz a 10,00 € e 1000 pz a 12,00 € → 11,98 €, non 11,00 €.
  assert.equal(
    costoMedioPonderato([
      { qty: 10, unitCostCents: 1000 },
      { qty: 1000, unitCostCents: 1200 },
    ]),
    1198,
  );
});

test('costoMedioPonderato ignora righe senza costo e dichiara null se non resta nulla', () => {
  assert.equal(costoMedioPonderato([{ qty: 100, unitCostCents: 0 }]), null);
  assert.equal(costoMedioPonderato([]), null);
  assert.equal(
    costoMedioPonderato([
      { qty: 0, unitCostCents: 5000 },
      { qty: 4, unitCostCents: 250 },
    ]),
    250,
  );
});

test('indiceRotazione non è definito con giacenza nulla', () => {
  assert.equal(indiceRotazione(120, 0), null);
  assert.equal(indiceRotazione(120, -3), null);
  assert.equal(indiceRotazione(120, 40), 3);
});

test('variazione e quota non dividono per zero', () => {
  assert.equal(variazione(100, 0), null);
  assert.equal(variazione(150, 100), 0.5);
  assert.equal(quota(5, 0), null);
  assert.equal(quota(5, 20), 0.25);
});

test('margine restituisce centesimi e percentuale, null su ricavo zero', () => {
  assert.deepEqual(margine(10_000, 6_000), { margineCents: 4_000, marginePercento: 0.4 });
  assert.deepEqual(margine(0, 500), { margineCents: -500, marginePercento: null });
});

test('giorniFra conta i giorni di calendario', () => {
  assert.equal(giorniFra(new Date('2026-03-01T23:00:00'), new Date('2026-03-02T01:00:00')), 1);
  assert.equal(giorniFra(new Date('2026-01-01T00:00:00'), new Date('2026-01-01T23:59:00')), 0);
});

// ─────────────────────────── Periodi ───────────────────────────

test('risolviPeriodo copre gli ultimi N giorni incluso oggi', () => {
  const p = risolviPeriodo({ periodo: '7g' }, '30g', OGGI);
  assert.equal(p.da?.getDate(), 25); // 25 → 31 luglio = 7 giorni
  assert.equal(p.a.getDate(), 31);
  assert.equal(p.a.getHours(), 23);
});

test('risolviPeriodo su «tutto» non pone limite iniziale', () => {
  const p = risolviPeriodo({ periodo: 'tutto' }, '30g', OGGI);
  assert.equal(p.da, null);
});

test('risolviPeriodo ricade sul predefinito se il preset è ignoto', () => {
  const p = risolviPeriodo({}, '90g', OGGI);
  assert.equal(p.preset, '90g');
  assert.equal(p.etichetta, 'Ultimi 90 giorni');
});

test('risolviPeriodo accetta le date esplicite e le marca personalizzate', () => {
  const p = risolviPeriodo({ da: '2026-01-01', a: '2026-03-31' }, '30g', OGGI);
  assert.equal(p.preset, 'personalizzato');
  assert.equal(p.da?.getMonth(), 0);
  assert.equal(p.a.getMonth(), 2);
  assert.equal(p.etichetta, '01/01/2026 → 31/03/2026');
});

test('periodoPrecedente ha la stessa durata e non si sovrappone', () => {
  const p = risolviPeriodo({ periodo: '30g' }, '30g', OGGI);
  const prec = periodoPrecedente(p);
  assert.ok(prec.a.getTime() < (p.da?.getTime() ?? 0));
  const durata = (x: { da: Date | null; a: Date }) => x.a.getTime() - (x.da?.getTime() ?? 0);
  assert.ok(Math.abs(durata(prec) - durata(p)) <= 1);
});

test('meseCorrenteEPrecedente confronta lo stesso numero di giorni', () => {
  const { corrente, precedente, giorni } = meseCorrenteEPrecedente(OGGI);
  assert.equal(giorni, 31);
  assert.equal(corrente.da?.getDate(), 1);
  assert.equal(precedente.da?.getMonth(), 5); // giugno
  // Giugno ha 30 giorni: il confronto si ferma al 30, non inventa il 31.
  assert.equal(precedente.a.getDate(), 30);
});

test('meseCorrenteEPrecedente attraversa il cambio d\'anno', () => {
  const { corrente, precedente } = meseCorrenteEPrecedente(new Date('2026-01-15T12:00:00'));
  assert.equal(corrente.da?.getMonth(), 0);
  assert.equal(precedente.da?.getFullYear(), 2025);
  assert.equal(precedente.da?.getMonth(), 11);
  assert.equal(precedente.a.getDate(), 15);
});

// ─────────────────────────── CSV ───────────────────────────

type Riga = { sku: string; qty: number; costoCents: number; margine: number; data: Date };

const COLONNE: ColonnaCsv<Riga>[] = [
  { intestazione: 'SKU', valore: (r) => r.sku },
  { intestazione: 'Quantità', tipo: 'intero', valore: (r) => r.qty },
  { intestazione: 'Costo (€)', tipo: 'euro', valore: (r) => r.costoCents },
  { intestazione: 'Margine (%)', tipo: 'percentuale', valore: (r) => r.margine },
  { intestazione: 'Data', tipo: 'data', valore: (r) => r.data },
];

test('toCsv usa punto e virgola, virgola decimale, data italiana e BOM', () => {
  const csv = toCsv(
    [{ sku: 'STF-100', qty: 12, costoCents: 123_456, margine: 0.2345, data: new Date('2026-07-31T08:00:00') }],
    COLONNE,
  );
  assert.equal(csv.charCodeAt(0), 0xfeff, 'manca il BOM per Excel');
  const righe = csv.slice(1).split('\r\n');
  assert.equal(righe[0], 'SKU;Quantità;Costo (€);Margine (%);Data');
  assert.equal(righe[1], 'STF-100;12;1234,56;23,45;31/07/2026');
});

test('toCsv protegge dalle formule (CSV injection)', () => {
  const csv = toCsv(
    [{ nome: '=SOMMA(A1:A9)' }, { nome: '+39 02 1234' }, { nome: '@utente' }, { nome: 'Rossi & C.' }],
    [{ intestazione: 'Nome', valore: (r) => r.nome }],
  );
  const righe = csv.slice(1).split('\r\n');
  assert.equal(righe[1], "'=SOMMA(A1:A9)");
  assert.equal(righe[2], "'+39 02 1234");
  assert.equal(righe[3], "'@utente");
  assert.equal(righe[4], 'Rossi & C.');
});

test('toCsv racchiude fra virgolette separatori, virgolette e a capo', () => {
  const csv = toCsv(
    [{ nome: 'Rossi; Bianchi' }, { nome: 'Ditta "Alfa"' }, { nome: 'riga1\nriga2' }],
    [{ intestazione: 'Nome', valore: (r) => r.nome }],
    { bom: false },
  );
  const righe = csv.split('\r\n');
  assert.equal(righe[1], '"Rossi; Bianchi"');
  assert.equal(righe[2], '"Ditta ""Alfa"""');
  assert.equal(righe[3], '"riga1\nriga2"');
});

test('toCsv scrive celle vuote per i valori nulli, senza «null» né zeri finti', () => {
  const csv = toCsv(
    [{ a: null, b: undefined, c: 0 }],
    [
      { intestazione: 'A', valore: (r) => r.a },
      { intestazione: 'B', tipo: 'euro', valore: (r) => r.b },
      { intestazione: 'C', tipo: 'intero', valore: (r) => r.c },
    ],
    { bom: false },
  );
  assert.equal(csv.split('\r\n')[1], ';;0');
});

test('toCsv su elenco vuoto restituisce comunque le intestazioni', () => {
  const csv = toCsv([], COLONNE, { bom: false });
  assert.equal(csv, 'SKU;Quantità;Costo (€);Margine (%);Data\r\n');
});

test('nomeFileReport ripulisce il nome e riporta il periodo', () => {
  const p = risolviPeriodo({ da: '2026-01-01', a: '2026-03-31' }, '30g', OGGI);
  assert.equal(nomeFileReport('valorizzazione', p), 'valorizzazione_2026-01-01_2026-03-31.csv');
  assert.equal(
    nomeFileReport('../../etc/passwd"; drop', p),
    'etcpasswddrop_2026-01-01_2026-03-31.csv',
  );
});

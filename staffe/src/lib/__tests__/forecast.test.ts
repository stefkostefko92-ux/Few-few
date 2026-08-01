import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrotonda,
  consumoMedioGiornaliero,
  coefficienteDiVariazione,
  deviazioneStandard,
  eoq,
  giorniDiCopertura,
  livellamentoConTendenza,
  livellamentoStagionale,
  prevediConsumo,
  puntoDiRiordino,
  quantitaDiRiordino,
  rilevaLentiMovimenti,
  riepilogoTendenzeAcquisti,
  serieGiornaliera,
  valutaConfidenza,
  type UscitaMovimento,
} from '../forecast';

/** Data fissa: le previsioni devono essere deterministiche, anche nei test. */
const OGGI = new Date('2026-07-31T10:00:00');

function giorniFa(n: number): Date {
  const d = new Date(OGGI);
  d.setDate(d.getDate() - n);
  return d;
}

/** Serie sintetica: `qty` pezzi ogni giorno per `giorni` giorni. */
function costante(qty: number, giorni: number): UscitaMovimento[] {
  return Array.from({ length: giorni }, (_, i) => ({ data: giorniFa(i), qty }));
}

// ─────────────────────────── Serie e medie ───────────────────────────

test('serieGiornaliera raggruppa per giorno, dal più vecchio al più recente', () => {
  const serie = serieGiornaliera(
    [
      { data: giorniFa(0), qty: 5 },
      { data: giorniFa(0), qty: 2 },
      { data: giorniFa(2), qty: 3 },
    ],
    4,
    OGGI,
  );
  assert.deepEqual(serie, [0, 3, 0, 7]);
});

test('serieGiornaliera ignora movimenti fuori finestra, negativi o con data invalida', () => {
  const serie = serieGiornaliera(
    [
      { data: giorniFa(10), qty: 100 }, // fuori finestra
      { data: giorniFa(1), qty: -4 }, // quantità non positiva
      { data: 'non-una-data', qty: 9 },
      { data: new Date('2030-01-01'), qty: 50 }, // futuro
      { data: giorniFa(1), qty: 6 },
    ],
    3,
    OGGI,
  );
  assert.deepEqual(serie, [0, 6, 0]);
});

test('serieGiornaliera con finestra 0 restituisce serie vuota', () => {
  assert.deepEqual(serieGiornaliera(costante(5, 3), 0, OGGI), []);
});

test('consumoMedioGiornaliero divide per i giorni della finestra, non per i giorni con movimento', () => {
  // 30 pezzi in un solo giorno, finestra 30 giorni → 1 pezzo/giorno.
  const m = [{ data: giorniFa(3), qty: 30 }];
  assert.equal(consumoMedioGiornaliero(m, 30, OGGI), 1);
  assert.equal(consumoMedioGiornaliero(costante(4, 10), 10, OGGI), 4);
});

test('consumoMedioGiornaliero con finestra non positiva non divide per zero', () => {
  assert.equal(consumoMedioGiornaliero(costante(4, 10), 0, OGGI), 0);
  assert.equal(consumoMedioGiornaliero(costante(4, 10), -5, OGGI), 0);
  assert.equal(consumoMedioGiornaliero([], 30, OGGI), 0);
});

test('deviazioneStandard è campionaria e vale 0 sotto due punti', () => {
  assert.equal(deviazioneStandard([]), 0);
  assert.equal(deviazioneStandard([7]), 0);
  assert.equal(deviazioneStandard([2, 4, 4, 4, 5, 5, 7, 9]), 2.138089935299395);
  assert.equal(deviazioneStandard([3, 3, 3]), 0);
});

test('coefficienteDiVariazione non è definito con media nulla', () => {
  assert.equal(coefficienteDiVariazione([0, 0, 0]), null);
  assert.equal(arrotonda(coefficienteDiVariazione([2, 4, 6]) ?? -1, 4), 0.5);
});

// ─────────────────────────── Livellamento ───────────────────────────

test('livellamentoConTendenza su serie costante prevede la costante, senza tendenza', () => {
  const esito = livellamentoConTendenza(new Array(20).fill(10));
  assert.equal(arrotonda(esito.livello, 2), 10);
  assert.equal(arrotonda(esito.tendenza, 2), 0);
  assert.equal(arrotonda(esito.previsione(1), 2), 10);
});

test('livellamentoConTendenza riconosce una crescita lineare', () => {
  const serie = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
  const esito = livellamentoConTendenza(serie);
  assert.ok(esito.tendenza > 0.7, `tendenza attesa ~1, ottenuta ${esito.tendenza}`);
  assert.ok(esito.previsione(1) > 28);
});

test('livellamentoConTendenza non prevede mai un consumo negativo', () => {
  const serie = Array.from({ length: 20 }, (_, i) => Math.max(0, 20 - i)); // decrescente a 0
  assert.equal(livellamentoConTendenza(serie).previsione(30) >= 0, true);
});

test('livellamentoStagionale ricade su Holt quando i cicli non bastano', () => {
  const esito = livellamentoStagionale([1, 2, 3, 4, 5], 7);
  assert.deepEqual(esito.stagionalita, [0, 0, 0, 0, 0, 0, 0]);
});

test('livellamentoStagionale coglie il profilo settimanale', () => {
  // Lavorazione da lunedì a venerdì: sabato e domenica a zero.
  const settimana = [10, 10, 10, 10, 10, 0, 0];
  const serie = Array.from({ length: 8 }, () => settimana).flat();
  const esito = livellamentoStagionale(serie, 7);
  const previsti = Array.from({ length: 7 }, (_, k) => esito.previsione(k + 1));
  // Due giorni della settimana previsti quasi a zero, cinque intorno a 10.
  assert.equal(previsti.filter((v) => v < 3).length, 2);
  assert.equal(previsti.filter((v) => v > 7).length, 5);
});

// ─────────────────────────── prevediConsumo ───────────────────────────

test('prevediConsumo dichiara nessun_consumo quando non ci sono uscite', () => {
  const p = prevediConsumo([], { giorni: 90, riferimento: OGGI });
  assert.equal(p.stato, 'nessun_consumo');
  if (p.stato === 'nessun_consumo') {
    assert.match(p.motivo, /Nessuna uscita/);
  }
});

test('prevediConsumo dichiara dati_insufficienti con finestra troppo corta e NON inventa una previsione', () => {
  const p = prevediConsumo(costante(5, 5), { giorni: 7, riferimento: OGGI });
  assert.equal(p.stato, 'dati_insufficienti');
  if (p.stato === 'dati_insufficienti') {
    assert.equal(p.consumoOsservato, arrotonda((5 * 5) / 7, 4));
    assert.match(p.motivo, /almeno 14 giorni/);
    // Il tipo non espone alcun `consumoGiornaliero`: non c'è numero da leggere
    // come previsione.
    assert.equal('consumoGiornaliero' in p, false);
  }
});

test('prevediConsumo dichiara dati_insufficienti con pochi giorni movimentati', () => {
  const p = prevediConsumo(
    [
      { data: giorniFa(2), qty: 40 },
      { data: giorniFa(9), qty: 60 },
    ],
    { giorni: 60, riferimento: OGGI },
  );
  assert.equal(p.stato, 'dati_insufficienti');
  if (p.stato === 'dati_insufficienti') {
    assert.equal(p.giorniConMovimento, 2);
    assert.match(p.motivo, /troppo pochi/);
  }
});

test('prevediConsumo usa Holt fra 14 e 27 giorni di finestra', () => {
  const p = prevediConsumo(costante(6, 20), { giorni: 20, riferimento: OGGI });
  assert.equal(p.stato, 'ok');
  if (p.stato === 'ok') {
    assert.equal(p.metodo, 'holt');
    assert.equal(arrotonda(p.consumoGiornaliero, 1), 6);
    assert.equal(p.giorniConMovimento, 20);
  }
});

test('prevediConsumo passa a Holt-Winters da 28 giorni e resta vicino alla media', () => {
  const p = prevediConsumo(costante(6, 90), { giorni: 90, riferimento: OGGI });
  assert.equal(p.stato, 'ok');
  if (p.stato === 'ok') {
    assert.equal(p.metodo, 'holt_winters');
    assert.ok(Math.abs(p.consumoGiornaliero - 6) < 0.5);
    assert.equal(p.confidenza, 'alta');
  }
});

test('prevediConsumo rileva la crescita della domanda', () => {
  // Consumo che raddoppia nella seconda metà della finestra.
  const movimenti = [...costante(4, 30), ...costante(8, 15)];
  const p = prevediConsumo(movimenti, { giorni: 45, riferimento: OGGI });
  assert.equal(p.stato, 'ok');
  if (p.stato === 'ok') {
    assert.ok(p.tendenzaGiornaliera > 0, 'la tendenza deve essere positiva');
    assert.ok(p.consumoGiornaliero > 6);
  }
});

test('valutaConfidenza è nulla senza dati e bassa su serie molto irregolare', () => {
  assert.equal(valutaConfidenza([0, 0, 0], 90, 0), 'nulla');
  assert.equal(valutaConfidenza([1, 2, 3], 7, 3), 'nulla');
  const irregolare = [...new Array(89).fill(0), 500];
  assert.equal(valutaConfidenza(irregolare, 90, 1), 'bassa');
});

// ─────────────────────────── Copertura e riordino ───────────────────────────

test('giorniDiCopertura non divide per zero e non finge una copertura infinita', () => {
  assert.equal(giorniDiCopertura(100, 0), null);
  assert.equal(giorniDiCopertura(100, -3), null);
  assert.equal(giorniDiCopertura(100, Number.NaN), null);
  assert.equal(giorniDiCopertura(0, 5), 0);
  assert.equal(giorniDiCopertura(-4, 5), 0);
  assert.equal(giorniDiCopertura(100, 4), 25);
  assert.equal(giorniDiCopertura(10, 3), 3.3);
});

test('puntoDiRiordino somma domanda del lead time e scorta di sicurezza', () => {
  const r = puntoDiRiordino({
    consumoGiornaliero: 10,
    leadTimeGiorni: 9,
    deviazioneStandard: 2,
    livelloServizio: 95,
  });
  assert.equal(r.domandaLeadTime, 90);
  // 1,6449 × 2 × √9 = 9,87 → 10
  assert.equal(r.scortaSicurezza, 10);
  assert.equal(r.puntoDiRiordino, 100);
});

test('puntoDiRiordino senza variabilità e senza lead time resta prudente', () => {
  assert.equal(
    puntoDiRiordino({ consumoGiornaliero: 5, leadTimeGiorni: 0 }).puntoDiRiordino,
    0,
  );
  assert.equal(
    puntoDiRiordino({ consumoGiornaliero: 0, leadTimeGiorni: 30, deviazioneStandard: 0 })
      .puntoDiRiordino,
    0,
  );
  // Lead time negativo (dato sporco) non genera un punto di riordino negativo.
  assert.equal(
    puntoDiRiordino({ consumoGiornaliero: 5, leadTimeGiorni: -10 }).puntoDiRiordino,
    0,
  );
});

test('quantitaDiRiordino non ordina se la posizione di stock è sopra il punto di riordino', () => {
  const q = quantitaDiRiordino({ disponibile: 50, inArrivo: 80, puntoDiRiordino: 100 });
  assert.equal(q.quantita, 0);
  assert.match(q.nota, /nessun ordine/i);
});

test('quantitaDiRiordino riporta alla scorta massima tenendo conto della merce in arrivo', () => {
  const q = quantitaDiRiordino({
    disponibile: 20,
    inArrivo: 10,
    puntoDiRiordino: 100,
    maxStock: 300,
  });
  assert.equal(q.quantita, 270); // 300 − (20 + 10)
  assert.equal(q.obiettivo, 300);
});

test('quantitaDiRiordino senza scorta massima punta a una copertura obiettivo', () => {
  const q = quantitaDiRiordino({
    disponibile: 10,
    puntoDiRiordino: 40,
    consumoGiornaliero: 2,
    giorniObiettivo: 30,
  });
  assert.equal(q.obiettivo, 100); // 40 + 2 × 30
  assert.equal(q.quantita, 90);
  assert.match(q.nota, /Scorta massima non impostata/);
});

test('quantitaDiRiordino segnala la scorta massima incoerente col punto di riordino', () => {
  const q = quantitaDiRiordino({
    disponibile: 0,
    puntoDiRiordino: 120,
    maxStock: 50,
  });
  assert.equal(q.obiettivo, 120);
  assert.equal(q.quantita, 120);
  assert.match(q.nota, /rivedere i parametri/);
});

test('eoq calcola il lotto di Wilson e rifiuta ingressi senza senso', () => {
  // √(2 × 1000 × 5000 / 100) = √100000 ≈ 316,23 → 317
  assert.equal(eoq(1000, 5000, 100), 317);
  assert.equal(eoq(0, 5000, 100), null);
  assert.equal(eoq(1000, 0, 100), null);
  assert.equal(eoq(1000, 5000, 0), null);
  assert.equal(eoq(Number.NaN, 5000, 100), null);
});

// ─────────────────────────── Giacenza lenta e morta ───────────────────────────

test('rilevaLentiMovimenti separa morto, lento, regolare e senza giacenza', () => {
  const esito = rilevaLentiMovimenti(
    [
      { id: 'a', giacenza: 0, ultimaUscita: giorniFa(400) },
      { id: 'b', giacenza: 10, ultimaUscita: null },
      { id: 'c', giacenza: 10, ultimaUscita: giorniFa(200) },
      { id: 'd', giacenza: 10, ultimaUscita: giorniFa(5), copertura: 400 },
      { id: 'e', giacenza: 10, ultimaUscita: giorniFa(5), copertura: 20 },
      { id: 'f', giacenza: 10, ultimaUscita: giorniFa(5), copertura: null },
    ],
    { riferimento: OGGI },
  );
  assert.deepEqual(
    esito.map((x) => x.stato),
    ['senza_giacenza', 'morto', 'morto', 'lento', 'regolare', 'regolare'],
  );
  assert.equal(esito[1].giorniDaUltimaUscita, null);
  assert.equal(esito[2].giorniDaUltimaUscita, 200);
});

test('rilevaLentiMovimenti rispetta le soglie configurate', () => {
  const articoli = [{ id: 'a', giacenza: 5, ultimaUscita: giorniFa(45) }];
  assert.equal(rilevaLentiMovimenti(articoli, { riferimento: OGGI })[0].stato, 'regolare');
  assert.equal(
    rilevaLentiMovimenti(articoli, { giorniMorto: 30, riferimento: OGGI })[0].stato,
    'morto',
  );
});

// ─────────────────────────── Riepilogo ───────────────────────────

test('riepilogoTendenzeAcquisti compone frasi dai numeri, senza dati inventati', () => {
  const righe = riepilogoTendenzeAcquisti([
    {
      nome: 'STF-100',
      consumoGiornaliero: 5,
      tendenzaGiornaliera: 0.4,
      copertura: 3,
      quantitaSuggerita: 200,
      statoPrevisione: 'ok',
    },
    {
      nome: 'STF-200',
      consumoGiornaliero: 0,
      tendenzaGiornaliera: 0,
      copertura: null,
      quantitaSuggerita: 0,
      statoPrevisione: 'nessun_consumo',
    },
    {
      nome: 'STF-300',
      consumoGiornaliero: 1,
      tendenzaGiornaliera: -0.2,
      copertura: 400,
      quantitaSuggerita: 0,
      statoPrevisione: 'ok',
    },
  ]);
  const testo = righe.join(' ');
  // Accordo singolare/plurale: con UN solo articolo la frase deve essere al
  // singolare. Prima diceva «1 articoli … sono», e il test lo teneva in vita.
  assert.match(testo, /1 articolo su 3 è sotto il punto di riordino/);
  assert.match(testo, /200 pezzi/);
  assert.match(testo, /STF-100 \(3 gg\)/);
  assert.match(testo, /1 articolo in crescita, 1 in calo/);
  assert.match(testo, /1 articolo non ha avuto uscite/);
  assert.doesNotMatch(testo, /\b1 articoli\b/);
});

test('riepilogoTendenzeAcquisti su elenco vuoto non produce affermazioni', () => {
  assert.deepEqual(riepilogoTendenzeAcquisti([]), [
    'Nessun articolo da analizzare nel periodo selezionato.',
  ]);
});

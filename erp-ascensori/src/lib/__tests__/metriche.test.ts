import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  incrementa,
  osserva,
  esporta,
  azzera,
  classeStato,
  escapaEtichetta,
  BUCKET_SECONDI,
} from "../metriche";

beforeEach(() => azzera());

test("броячът излиза с име, етикети и стойност", () => {
  incrementa("erp_richieste_totale", { rotta: "/api/impianti", metodo: "GET", stato: "2xx" });
  incrementa("erp_richieste_totale", { rotta: "/api/impianti", metodo: "GET", stato: "2xx" });
  const out = esporta();
  assert.match(out, /# TYPE erp_richieste_totale counter/);
  assert.match(out, /erp_richieste_totale\{metodo="GET",rotta="\/api\/impianti",stato="2xx"\} 2/);
});

test("редът на етикетите НЕ зависи от извикващия", () => {
  incrementa("m", { b: "2", a: "1" });
  incrementa("m", { a: "1", b: "2" });
  // Иначе една и съща серия се брои като две и графиката се раздвоява.
  assert.match(esporta(), /m\{a="1",b="2"\} 2/);
});

test("хистограмата е кумулативна, както Prometheus я очаква", () => {
  osserva("d", 0.02, { rotta: "/x" });
  osserva("d", 0.4, { rotta: "/x" });
  osserva("d", 7, { rotta: "/x" });
  const out = esporta();

  // 0,02 попада в 0,025 и във всичко над него.
  assert.match(out, /d_bucket\{rotta="\/x",le="0\.025"\} 1/);
  assert.match(out, /d_bucket\{rotta="\/x",le="0\.5"\} 2/);
  assert.match(out, /d_bucket\{rotta="\/x",le="10"\} 3/);
  assert.match(out, /d_bucket\{rotta="\/x",le="\+Inf"\} 3/);
  assert.match(out, /d_count\{rotta="\/x"\} 3/);
  assert.match(out, /d_sum\{rotta="\/x"\} 7\.420000/);
});

test("стойност над последната граница влиза само в +Inf", () => {
  osserva("d", BUCKET_SECONDI[BUCKET_SECONDI.length - 1] + 1);
  const out = esporta();
  assert.match(out, /d_bucket\{le="10"\} 0/);
  assert.match(out, /d_bucket\{le="\+Inf"\} 1/);
});

test("статусът се групира в клас — 40 отделни стойности са безполезен ред", () => {
  assert.equal(classeStato(200), "2xx");
  assert.equal(classeStato(404), "4xx");
  assert.equal(classeStato(503), "5xx");
});

test("опасните знаци в етикет се екранират", () => {
  // Сурова кавичка чупи целия отговор за скрейпъра, не само своя ред.
  assert.equal(escapaEtichetta('a"b'), 'a\\"b');
  assert.equal(escapaEtichetta("a\\b"), "a\\\\b");
  assert.equal(escapaEtichetta("a\nb"), "a\\nb");
});

test("допълнителните показатели излизат с описание и тип", () => {
  const out = esporta([
    {
      nome: "erp_fatture_scadute",
      aiuto: "Fatture oltre la scadenza",
      tipo: "gauge",
      valore: 3,
    },
  ]);
  assert.match(out, /# HELP erp_fatture_scadute Fatture oltre la scadenza/);
  assert.match(out, /# TYPE erp_fatture_scadute gauge/);
  assert.match(out, /^erp_fatture_scadute 3$/m);
});

test("заглавието на серия се изписва ВЕДНЪЖ", () => {
  incrementa("erp_richieste_totale", { rotta: "/a" });
  incrementa("erp_richieste_totale", { rotta: "/b" });
  // Повторен `# TYPE` за същото име е невалиден за скрейпъра.
  assert.equal(esporta().match(/# TYPE erp_richieste_totale/g)?.length, 1);
});

test("изходът винаги завършва с нов ред", () => {
  incrementa("x");
  assert.match(esporta(), /\n$/);
});

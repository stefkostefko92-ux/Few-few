// Метрики във формата на Prometheus — без зависимост.
//
// Защо на ръка, а не `prom-client`: нужни са ни броячи и една хистограма, а
// библиотеката влачи глобален регистър, който в Next.js hot-reload се
// регистрира по два пъти и гърми с „metric already registered". Тридесет реда
// собствен код нямат този проблем и се четат наведнъж.
//
// ВАЖНО за тълкуването: процесът е ЕДИН, паметта е негова. При няколко
// инстанции всяка брои своето и Prometheus ги събира по `instance` — точно
// затова тук няма опит за споделено състояние.

/** Границите са в СЕКУНДИ и са подбрани около целта: p95 < 500 ms. */
export const BUCKET_SECONDI = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

interface Istogramma {
  conteggi: number[];
  somma: number;
  totale: number;
}

const contatori = new Map<string, number>();
const istogrammi = new Map<string, Istogramma>();

/** Стартът на процеса — за `process_start_time_seconds` и за uptime. */
const AVVIO = Date.now();

/** Етикетите като стабилен ключ: редът им НЕ бива да зависи от извикващия. */
function chiave(nome: string, etichette: Record<string, string>): string {
  const parti = Object.keys(etichette)
    .sort()
    .map((k) => `${k}="${escapaEtichetta(etichette[k])}"`);
  return parti.length ? `${nome}{${parti.join(",")}}` : nome;
}

/** Prometheus не понася сурови кавички, наклонени черти и нов ред в етикет. */
export function escapaEtichetta(v: string): string {
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export function incrementa(
  nome: string,
  etichette: Record<string, string> = {},
  di = 1,
): void {
  const k = chiave(nome, etichette);
  contatori.set(k, (contatori.get(k) ?? 0) + di);
}

export function osserva(
  nome: string,
  secondi: number,
  etichette: Record<string, string> = {},
): void {
  const k = chiave(nome, etichette);
  let h = istogrammi.get(k);
  if (!h) {
    h = {
      conteggi: new Array(BUCKET_SECONDI.length).fill(0),
      somma: 0,
      totale: 0,
    };
    istogrammi.set(k, h);
  }
  h.somma += secondi;
  h.totale += 1;
  for (let i = 0; i < BUCKET_SECONDI.length; i++)
    if (secondi <= BUCKET_SECONDI[i]) h.conteggi[i] += 1;
}

/** Само за тестове: изчиства регистъра между случаите. */
export function azzera(): void {
  contatori.clear();
  istogrammi.clear();
}

/** Разделя `nome{a="1"}` обратно на име и етикети — за изхода на хистограмата. */
function scomponi(k: string): { nome: string; etichette: string } {
  const i = k.indexOf("{");
  return i === -1
    ? { nome: k, etichette: "" }
    : { nome: k.slice(0, i), etichette: k.slice(i + 1, -1) };
}

export interface MetricaExtra {
  nome: string;
  aiuto: string;
  tipo: "gauge" | "counter";
  valore: number;
  etichette?: Record<string, string>;
}

const AIUTO: Record<string, string> = {
  erp_richieste_totale: "Numero di richieste HTTP servite",
  erp_richieste_durata_secondi: "Durata delle richieste HTTP",
  erp_errori_totale: "Errori non gestiti (HTTP 5xx)",
};

/**
 * Изходът във формата за Prometheus.
 *
 * `extra` са моментните стойности, които не се броят, а се ЧЕТАТ (просрочени
 * фактури, възраст на автоматизма, цялост на одита) — те идват от базата и се
 * подават отвън, за да остане този модул без зависимости.
 */
export function esporta(extra: MetricaExtra[] = []): string {
  const righe: string[] = [];
  const visti = new Set<string>();

  const intestazione = (nome: string, tipo: string, aiuto?: string) => {
    if (visti.has(nome)) return;
    visti.add(nome);
    righe.push(`# HELP ${nome} ${aiuto ?? AIUTO[nome] ?? nome}`);
    righe.push(`# TYPE ${nome} ${tipo}`);
  };

  for (const [k, v] of [...contatori].sort()) {
    intestazione(scomponi(k).nome, "counter");
    righe.push(`${k} ${v}`);
  }

  for (const [k, h] of [...istogrammi].sort()) {
    const { nome, etichette } = scomponi(k);
    intestazione(nome, "histogram");
    const con = (extraEt: string) =>
      etichette ? `${etichette},${extraEt}` : extraEt;
    for (let i = 0; i < BUCKET_SECONDI.length; i++)
      righe.push(
        `${nome}_bucket{${con(`le="${BUCKET_SECONDI[i]}"`)}} ${h.conteggi[i]}`,
      );
    righe.push(`${nome}_bucket{${con('le="+Inf"')}} ${h.totale}`);
    righe.push(
      `${nome}_sum${etichette ? `{${etichette}}` : ""} ${h.somma.toFixed(6)}`,
    );
    righe.push(`${nome}_count${etichette ? `{${etichette}}` : ""} ${h.totale}`);
  }

  for (const m of extra) {
    intestazione(m.nome, m.tipo, m.aiuto);
    righe.push(`${chiave(m.nome, m.etichette ?? {})} ${m.valore}`);
  }

  intestazione(
    "erp_uptime_secondi",
    "gauge",
    "Secondi dall'avvio del processo",
  );
  righe.push(`erp_uptime_secondi ${Math.floor((Date.now() - AVVIO) / 1000)}`);

  return righe.join("\n") + "\n";
}

/** Групира статуса в клас: етикет с 40 различни стойности е безполезен ред. */
export function classeStato(stato: number): string {
  return `${Math.floor(stato / 100)}xx`;
}

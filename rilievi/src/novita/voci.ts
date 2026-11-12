/**
 * Новините на портала (собственикът, 10 ноември 2026 — „Fai una pagina sul nostro sito web con tutte queste
 * cose. Al primo accesso di ogni utente dopo ogni aggiornamento fai uscire messaggio popup con descrizione
 * degli aggiornamenti fatti dal suo ultimo accesso“). ЕДИНСТВЕНИЯТ списък: публичната страница `/novita`,
 * емисията, sitemap, llms.txt, JSON-LD и прозорецът на портала идват оттук. Текстовете (раздел, заглавие,
 * описание — за външен читател) са в `locales/it/novita.json` (`novita.voci.<id>`), тестът пази двете
 * страни. Нова новина = ред НАЙ-ОТГОРЕ тук + текстовете ѝ; id-то не се сменя никога (котва на страницата,
 * ред в таблицата `Novita`). Чисто, без база.
 */

export interface VoceNovita {
  /** `<ден>-<дума>`: котвата на страницата и ключът в речника. */
  id: string;
  /** Денят на новината (YYYY-MM-DD) — на страницата и в емисията. */
  data: string;
}

/** Най-новите отгоре; в един ден — по важност. */
export const VOCI: readonly VoceNovita[] = [
  { id: '2026-11-12-versione-3-1', data: '2026-11-12' },
  { id: '2026-11-12-versione-3', data: '2026-11-12' },
  { id: '2026-11-12-pagamento-carta', data: '2026-11-12' },
  { id: '2026-11-12-prova-abbonamento', data: '2026-11-12' },
  { id: '2026-11-12-accesso-microsoft-google', data: '2026-11-12' },
  { id: '2026-11-12-csv-api', data: '2026-11-12' },
  { id: '2026-11-12-stato-servizio', data: '2026-11-12' },
  { id: '2026-11-12-annotazioni-foto', data: '2026-11-12' },
  { id: '2026-11-12-senza-rete', data: '2026-11-12' },
  { id: '2026-11-12-preventivi', data: '2026-11-12' },
  { id: '2026-11-12-quadro-geat', data: '2026-11-12' },
  { id: '2026-11-12-buono-lavoro', data: '2026-11-12' },
  { id: '2026-11-12-ordini-fornitori', data: '2026-11-12' },
  { id: '2026-11-12-approvazione', data: '2026-11-12' },
  { id: '2026-11-12-versioni', data: '2026-11-12' },
  { id: '2026-11-12-etichette-qr', data: '2026-11-12' },
  { id: '2026-11-12-copia-firmatario', data: '2026-11-12' },
  { id: '2026-11-12-pdfa', data: '2026-11-12' },
  { id: '2026-11-12-esportazione', data: '2026-11-12' },
  { id: '2026-11-12-cambio-fornitore', data: '2026-11-12' },
  { id: '2026-11-11-note-sezioni', data: '2026-11-11' },
  { id: '2026-11-10-menu', data: '2026-11-10' },
  { id: '2026-11-10-cerca', data: '2026-11-10' },
  { id: '2026-11-10-impostazioni', data: '2026-11-10' },
  { id: '2026-11-10-comunicazioni', data: '2026-11-10' },
  { id: '2026-11-10-condizioni', data: '2026-11-10' },
  { id: '2026-11-10-avvertenza-calcoli', data: '2026-11-10' },
  { id: '2026-11-10-novita', data: '2026-11-10' },
  { id: '2026-11-10-foto-stampa', data: '2026-11-10' },
  { id: '2026-11-10-schizzi', data: '2026-11-10' },
  { id: '2026-11-10-scatta-foto', data: '2026-11-10' },
  { id: '2026-11-10-operatore', data: '2026-11-10' },
  { id: '2026-11-10-matricola', data: '2026-11-10' },
  { id: '2026-11-10-porte-manuali', data: '2026-11-10' },
  { id: '2026-11-10-impaginazione', data: '2026-11-10' },
  { id: '2026-11-09-tubo-flessibile', data: '2026-11-09' },
  { id: '2026-11-09-limitatore-dpr', data: '2026-11-09' },
  { id: '2026-11-07-limitatore-semplice', data: '2026-11-07' },
  { id: '2026-11-05-limitatore', data: '2026-11-05' },
  { id: '2026-11-05-verbale', data: '2026-11-05' },
  { id: '2026-11-05-foto-compatte', data: '2026-11-05' },
  { id: '2026-11-05-pdf-iphone', data: '2026-11-05' },
  { id: '2026-11-05-installa', data: '2026-11-05' },
  { id: '2026-11-04-argano', data: '2026-11-04' },
];

/** Денят на последната новина — „Ultimo aggiornamento“, `lastmod` и `dateModified`. */
export const ULTIMO_AGGIORNAMENTO: string = VOCI[0]?.data ?? '2026-11-10';

/** Колко новини най-много в прозореца; другите — „e altre N“ с връзка към страницата. */
export const MAX_POPUP = 6;

/** Началото на деня (UTC) — кога е излязла новината на нова инсталация. */
export function inizioGiorno(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

/**
 * Новините, които още нямат ред в `Novita`, и кога са излезли. Празна таблица — нова инсталация (или база
 * за тестове): всяка в своя ден, защото няма обновяване, за което да се каже. Иначе — сега: портал, който
 * за пръв път тръгва с нея, е самото обновяване (денят на новината може да е преди деплоя).
 */
export function daRegistrare(
  esistenti: ReadonlySet<string>,
  ora: Date,
): Array<{ id: string; pubblicataAt: Date }> {
  const nuova = esistenti.size === 0;
  return VOCI.filter((v) => !esistenti.has(v.id)).map((v) => ({
    id: v.id,
    pubblicataAt: nuova ? inizioGiorno(v.data) : ora,
  }));
}

/**
 * Новините за прозореца: излезли след `lette` (последното „Ho capito“ на човека), най-новите първи, в един
 * момент — по реда на списъка. Ред в таблицата за новина, махната от списъка, не се показва.
 */
export function nonLette(pubblicate: ReadonlyMap<string, Date>, lette: Date): VoceNovita[] {
  return VOCI.map((voce, ordine) => ({ voce, ordine, quando: pubblicate.get(voce.id) }))
    .filter(
      (x): x is { voce: VoceNovita; ordine: number; quando: Date } =>
        x.quando !== undefined && x.quando.getTime() > lette.getTime(),
    )
    .sort((x, y) => y.quando.getTime() - x.quando.getTime() || x.ordine - y.ordine)
    .map((x) => x.voce);
}

/** Новините по дни за страницата — дните от най-новия, в деня — по реда на списъка. */
export function perGiorno(
  voci: readonly VoceNovita[],
): Array<{ data: string; voci: VoceNovita[] }> {
  const giorni: Array<{ data: string; voci: VoceNovita[] }> = [];
  for (const voce of voci) {
    const ultimo = giorni.at(-1);
    if (ultimo && ultimo.data === voce.data) ultimo.voci.push(voce);
    else giorni.push({ data: voce.data, voci: [voce] });
  }
  return giorni;
}

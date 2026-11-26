// Официални източници (проверени от Асансьорчика на 26.11.2026 спрямо действащия текст в Normattiva).
// Само закони и подзаконови актове — съдържание от UNI/EN норми НЕ влиза в сайта (лицензът е само вътрешен).

const NX = "https://www.normattiva.it/uri-res/N2Ls?urn:nir:";
const DPR162 = `${NX}stato:decreto.del.presidente.della.repubblica:1999-04-30;162`;
const CC = `${NX}stato:regio.decreto:1942-03-16;262`;

export const F = {
  dpr162: { label: "DPR 30 aprile 1999, n. 162 (testo vigente)", url: DPR162 },
  dpr162art2: { label: "DPR 162/1999, art. 2 (definizioni, modifiche costruttive alla lett. cc)", url: `${DPR162}~art2` },
  dpr162art12: { label: "DPR 162/1999, art. 12 (messa in esercizio)", url: `${DPR162}~art12` },
  dpr162art13: { label: "DPR 162/1999, art. 13 (verifiche periodiche)", url: `${DPR162}~art13` },
  dpr162art14: { label: "DPR 162/1999, art. 14 (verifiche straordinarie)", url: `${DPR162}~art14` },
  dpr162art15: { label: "DPR 162/1999, art. 15 (manutenzione)", url: `${DPR162}~art15` },
  dpr162art16: { label: "DPR 162/1999, art. 16 (libretto e targa)", url: `${DPR162}~art16` },
  dpr23: { label: "DPR 10 gennaio 2017, n. 23 (modifiche al DPR 162/1999)", url: `${NX}stato:decreto.del.presidente.della.repubblica:2017-01-10;23` },
  dpr8: { label: "DPR 19 gennaio 2015, n. 8 (modifiche al DPR 162/1999)", url: "https://www.normattiva.it/eli/id/2015/02/21/15G00022/ORIGINAL" },
  dm37art1: { label: "DM 22 gennaio 2008, n. 37, art. 1 (ambito, lettera f)", url: `${NX}ministero.sviluppo.economico:decreto:2008-01-22;37~art1` },
  dm37art7: { label: "DM 22 gennaio 2008, n. 37, art. 7 (dichiarazione di conformità)", url: `${NX}ministero.sviluppo.economico:decreto:2008-01-22;37~art7` },
  cc1117: { label: "Codice civile, art. 1117 (parti comuni)", url: `${CC}~art1117` },
  cc1124: { label: "Codice civile, art. 1124 (scale e ascensori)", url: `${CC}~art1124` },
  cc1130: { label: "Codice civile, art. 1130 (attribuzioni dell'amministratore)", url: `${CC}~art1130` },
  cc1135: { label: "Codice civile, art. 1135 (attribuzioni dell'assemblea)", url: `${CC}~art1135` },
  atsMilano: {
    label: "ATS Milano Città Metropolitana: verifiche periodiche e straordinarie di ascensori",
    url: "https://www.ats-milano.it/ats/carta-servizi/guida-servizi/lavoro/impiantistica/verifiche-periodiche-straordinarie-ascensori-montacarichi-piattaforme-elevatrici-disabili",
  },
};

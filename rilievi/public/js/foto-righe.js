// The rows of photos of the print in the browser — the same justified rows as src/schede/pdf-foto.ts
// (`righeFoto`, `DIMENSIONI`; a unit test runs this file and compares the output) and the page of the PDF
// (src/schede/pdf-layout.ts), for the preview in "Stampa e PDF" at the end of the sheet form
// (foto-ordine.js). Pure functions, no DOM.
(() => {
  'use strict';

  const ALTEZZA_RIGA = 140;
  const DIMENSIONI = {
    PICCOLE: { altezza: 100, maxPerRiga: 5, altezzaMax: 140 },
    MEDIE: { altezza: ALTEZZA_RIGA, maxPerRiga: 4, altezzaMax: ALTEZZA_RIGA * 1.4 },
    GRANDI: { altezza: 210, maxPerRiga: 3, altezzaMax: 294 },
    UNA: { altezza: 500, maxPerRiga: 1, altezzaMax: 500 },
  };
  const SPAZIO = 8;
  // The A4 page of the PDF (pt): margins, the footer space, the title "Foto" and the caption under a photo.
  const PAGINA = {
    larghezza: 595.28,
    altezza: 841.89,
    margine: 40,
    piede: 44,
    titolo: 40,
    didascalia: 14,
    sottoRiga: 8,
  };
  PAGINA.contenuto = PAGINA.larghezza - PAGINA.margine * 2;

  const righeFoto = (rapporti, larghezza, misura = DIMENSIONI.MEDIE) => {
    const { altezza, maxPerRiga, altezzaMax } = misura;
    const righe = [];
    const chiudi = (indici, piena) => {
      const somma = indici.reduce((s, i) => s + rapporti[i], 0);
      const libera = larghezza - SPAZIO * (indici.length - 1);
      const h = piena ? Math.min(libera / somma, altezzaMax) : Math.min(altezza, libera / somma);
      righe.push(indici.map((i) => ({ indice: i, larghezza: rapporti[i] * h, altezza: h })));
    };
    let corrente = [];
    for (let i = 0; i < rapporti.length; i += 1) {
      const prova = [...corrente, i];
      const somma = prova.reduce((s, j) => s + rapporti[j], 0);
      const libera = larghezza - SPAZIO * (prova.length - 1);
      if (somma * altezza < libera && prova.length < maxPerRiga) {
        corrente = prova;
        continue;
      }
      const conH = libera / somma;
      const senza = corrente.length
        ? (larghezza - SPAZIO * (corrente.length - 1)) /
          corrente.reduce((s, j) => s + rapporti[j], 0)
        : Infinity;
      if (
        corrente.length &&
        Math.abs(Math.min(senza, altezzaMax) - altezza) < Math.abs(conH - altezza)
      ) {
        chiudi(corrente, true);
        corrente = [i];
      } else {
        chiudi(prova, true);
        corrente = [];
      }
    }
    if (corrente.length) chiudi(corrente, false);
    return righe;
  };

  // The rows placed on pages, as the PDF does: "Foto" with the first row, a row never split, a new page
  // when the row does not fit above the footer. Each place: page, x, y, width, height (pt).
  const pagine = (rapporti, dimensione) => {
    const misura = DIMENSIONI[dimensione] || DIMENSIONI.MEDIE;
    const righe = righeFoto(rapporti, PAGINA.contenuto, misura);
    const fondo = PAGINA.altezza - PAGINA.margine - PAGINA.piede;
    const posti = [];
    let pagina = 0;
    let y = PAGINA.margine + PAGINA.titolo;
    for (const riga of righe) {
      const alta = riga[0].altezza + PAGINA.didascalia + PAGINA.sottoRiga;
      if (y + alta > fondo && y > PAGINA.margine + PAGINA.titolo) {
        pagina += 1;
        y = PAGINA.margine;
      }
      let x = PAGINA.margine;
      for (const posto of riga) {
        posti[posto.indice] = { pagina, x, y, larghezza: posto.larghezza, altezza: posto.altezza };
        x += posto.larghezza + SPAZIO;
      }
      y += alta;
    }
    return { posti, pagine: righe.length ? pagina + 1 : 0 };
  };

  window.rilieviFotoRighe = { DIMENSIONI, SPAZIO, PAGINA, righeFoto, pagine };
})();

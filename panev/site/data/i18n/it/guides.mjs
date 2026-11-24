// Italiano — Le due pagine di approfondimento: il brevetto e il fissaggio su murature irregolari.
// I fatti sono quelli del catalogo (pag. 02, 03, 04, 08, 10, 66) e di ../../products.mjs: niente di nuovo.

export default {
  guideSlugs: {
    patent: 'brevetto.html',
    walls: 'staffe-murature-irregolari.html',
  },
  guideMeta: {
    patent: {
      title: 'Brevetto staffe ascensore: modello di utilità UIBM | Panev',
      description: 'La soluzione di fissaggio regolabile delle staffe Panev è tutelata dal brevetto per Modello di Utilità N. 202023000002112 (UIBM), depositato il 19/05/2023.',
      keywords: ['brevetto staffe ascensore', 'brevetto staffa ascensore', 'modello di utilità 202023000002112', 'staffa di supporto brevettata', 'brevetto UIBM staffe ascensori', 'brevetto Panev', 'Panev Ascensori', 'Carbon Stealth'],
    },
    walls: {
      title: 'Staffe ascensore su muri irregolari e fuori squadra | Panev',
      description: 'Fissare guide del contrappeso e porte di piano su muri irregolari o fuori squadra: giunto articolato, corsa di estensione, montaggio in sei passi.',
      keywords: ['staffe ascensore muri irregolari', 'fissaggio guide ascensore muratura irregolare', 'staffe ascensore muro fuori squadra', 'montaggio staffe ascensore', 'fissaggio porta di piano muro non perpendicolare', 'Panev Ascensori', 'Carbon Stealth'],
    },
  },
  guides: {
    shared: {
      crumbsLabel: 'Percorso',
      relatedTitle: 'Le famiglie di staffe',
      relatedLabel: 'Famiglie di staffe',
      catalogPage: (n) => `Catalogo PDF · pag. ${String(n).padStart(2, '0')}`,
    },
    patent: {
      crumb: 'Brevetto',
      link: 'Il brevetto delle staffe Panev',
      kicker: 'Proprietà industriale · Modello di Utilità',
      h1: 'Il brevetto delle staffe Panev: Modello di Utilità N. 202023000002112',
      lead: 'Sì: la soluzione di fissaggio regolabile a giunto articolato delle staffe Panev è tutelata dal brevetto per Modello di Utilità N. 202023000002112, rilasciato dal Ministero delle Imprese e del Made in Italy (UIBM) il 7 gennaio 2025.',
      visualAlt: 'Staffa articolata per porta di piano: piastra A 65 170 7 con staffa B 65 320, render 3D',
      factsTitle: 'I dati del brevetto',
      titleRow: ['Titolo', 'Staffa di supporto per un componente strutturale di un impianto di ascensore o montacarichi'],
      officeRow: ['Ente', 'Ministero delle Imprese e del Made in Italy — UIBM'],
      scopeTitle: 'Che cosa protegge',
      anatomyTitle: 'Com’è fatta la staffa brevettata',
      anatomyLead: 'I componenti della staffa, come li descrive il catalogo tecnico secondo le tavole del brevetto.',
      anatomy: [
        ['Elemento di fissaggio', 'Fissato alla struttura muraria del vano di corsa.'],
        ['Elemento di supporto', 'Porta il componente strutturale, ortogonale all’elemento di fissaggio.'],
        ['Giunto articolato', 'Regola l’angolo tra fissaggio e supporto.'],
        ['Elemento di bloccaggio', 'Blocca l’angolo una volta regolato.'],
        ['Nervature di irrigidimento', 'Bordi ripiegati, più larghi presso il giunto.'],
        ['Fori asolati di fissaggio', 'Asole parallele al bordo, per il fissaggio a muro.'],
        ['Fori di collegamento', 'Per fissare il componente all’elemento di supporto.'],
      ],
      whereTitle: 'Dove è descritta la soluzione brevettata',
      whereLead: 'La soluzione è presentata nel catalogo tecnico 2027: il certificato a pagina 02, la descrizione e la tavola a pagina 03.',
      wallsLink: 'Come si monta su murature irregolari',
      faqTitle: 'Brevetto: domande frequenti',
      faq: [
        { q: 'Le staffe Panev sono brevettate?', a: 'Sì. La soluzione di fissaggio regolabile a giunto articolato delle staffe Panev è tutelata dal brevetto per Modello di Utilità N. 202023000002112, rilasciato a Roma il 7 gennaio 2025 dal Ministero delle Imprese e del Made in Italy (UIBM).' },
        { q: 'Fino a quando è valido il brevetto?', a: 'La durata massima è di dieci anni dal deposito: la domanda è del 19 maggio 2023, la scadenza massima è il 19 maggio 2033.' },
        { q: 'Che cosa protegge il brevetto?', a: 'Protegge la soluzione di fissaggio regolabile presentata nel catalogo: un elemento di fissaggio alla muratura e un elemento di supporto collegati da un giunto articolato, con un elemento di bloccaggio che fissa l’angolo regolato. Il titolo è «Staffa di supporto per un componente strutturale di un impianto di ascensore o montacarichi» (classifica B66B). Tutela la soluzione costruttiva, non i singoli codici del listino.' },
        { q: 'Dove si verifica il brevetto?', a: 'Nei registri dell’Ufficio Italiano Brevetti e Marchi (UIBM), con il numero 202023000002112. Il certificato è riprodotto a pagina 02 del catalogo tecnico.' },
      ],
    },
    walls: {
      crumb: 'Murature irregolari',
      kicker: 'Soluzioni · vano di corsa in muratura o calcestruzzo',
      h1: 'Fissare guide e porte di piano su murature irregolari',
      lead: 'Su murature irregolari o non perpendicolari le staffe Panev si regolano in opera: il giunto articolato compensa l’angolo (± 7° / ± 8° per le porte di piano), i fori asolati spostano il fissaggio e la staffa di giunzione SG scorre sul supporto per coprire la distanza tra muratura e guida.',
      problemTitle: 'Il problema del cantiere',
      problem: [
        'Lungo il vano di corsa il calcestruzzo gettato in opera presenta spesso sporgenze e rientranze, e la parete non è sempre perpendicolare al componente da fissare. Le staffe tradizionali non si adattano con facilità e costringono il montatore a modifiche sul posto.',
        'Il sistema Panev è forato, snodato e asolato: ideato per adattarsi a murature irregolari, non perpendicolari e con presenza di ferri d’armatura.',
      ],
      tableTitle: 'Quale regolazione per quale muro',
      tableHead: ['Condizione in cantiere', 'Come si compensa', 'Sistema'],
      // [condizione, come si compensa, sistema, pagina della famiglia]
      rows: [
        ['Muratura non perpendicolare alla porta di piano', 'Giunto articolato: regolazione angolare di ± 8° (serie 65) o ± 7° (serie 45 e 37)', 'Piastra A + staffa B', 'famDoors'],
        ['Distanza variabile tra muratura e guida del contrappeso', 'La staffa di giunzione SG scorre sul supporto entro la corsa di estensione della configurazione, ad esempio 45 – 155 mm per SU 220 160 con SG 80 150', 'Supporto SU o SC + SG', 'famGuides'],
        ['Muratura irregolare, fissaggio da decentrare', 'Base decentrata, per una maggiore flessibilità di posizionamento', 'Supporto SD + SG', 'famGuides'],
        ['Pareti d’angolo del vano corsa', 'Fissaggio diretto a parete con braccio rigido regolabile', 'SN 60 65, SN 65 200 e BRACCIO 160 190', 'famSpecial'],
        ['Sporgenza fuori standard', 'Misura di sporgenza “A” definita sul disegno esecutivo del cantiere', 'Supporto SC 50 170', 'famSpecial'],
      ],
      stepsTitle: 'Montaggio in sei passi',
      stepsLead: 'La staffa articolata si installa con tre attrezzi: trapano tassellatore, chiavi per bulloni e livella.',
      howToName: 'Montare una staffa articolata Panev su una muratura irregolare',
      steps: [
        { title: 'Tracciatura e foratura', body: 'Segna la posizione sulla muratura e fora con il trapano tassellatore, sfruttando i fori asolati dell’elemento di fissaggio.' },
        { title: 'Fissaggio a muro', body: 'Fissa l’elemento di fissaggio con i tasselli, verificando la verticalità con la livella prima del serraggio.' },
        { title: 'Regolazione dell’angolo', body: 'Ruota l’elemento di supporto attorno al giunto articolato per compensare murature sporgenti o rientranti.' },
        { title: 'Bloccaggio', body: 'Serra l’elemento di bloccaggio nell’asola per fissare definitivamente l’angolo impostato.' },
        { title: 'Regolazione e taglio', body: 'Regola la posizione longitudinale del supporto e, se necessario, taglialo a misura secondo le esigenze di montaggio.' },
        { title: 'Fissaggio del componente', body: 'Collega il componente — soglia, gruppo operatore o guida — ai fori di collegamento e verifica l’allineamento finale con la livella.' },
      ],
      stepsNote: 'Sintesi per installatori qualificati: fanno fede i disegni di montaggio del catalogo tecnico e il progetto dell’impianto.',
      patentLink: 'La staffa articolata è brevettata: i dati del brevetto',
      faqTitle: 'Murature irregolari: domande frequenti',
      faq: [
        { q: 'Come si fissano le guide del contrappeso su murature irregolari?', a: 'Con un supporto regolabile (SU, SD o SC) e la staffa di giunzione SG: il supporto si fissa alla muratura e la staffa di giunzione scorre su di esso entro la corsa di estensione indicata per ogni configurazione, con un’aletta di sormonto di 35 mm. Il supporto SD ha la base decentrata, per una maggiore flessibilità di posizionamento su murature irregolari.' },
        { q: 'Come si compensa un muro non perpendicolare alla porta di piano?', a: 'Con il giunto articolato delle staffe per porte di piano: l’elemento di supporto ruota rispetto a quello fissato al muro, di ± 8° sulla serie 65 e di ± 7° sulle serie 45 e 37, e un elemento di bloccaggio fissa l’angolo regolato.' },
        { q: 'Quali attrezzi servono per il montaggio?', a: 'Tre: trapano tassellatore, chiavi per bulloni e livella.' },
        { q: 'E se la misura che serve non è a listino?', a: 'Si realizza su misura: la sporgenza “A” del supporto SC 50 170 si definisce sul disegno esecutivo del cantiere. Invia disegno o misure a info@panevascensori.it e ricevi la quotazione su commessa.' },
      ],
    },
  },
};

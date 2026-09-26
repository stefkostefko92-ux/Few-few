// Italiano — Началната страница; order се ползва и от продуктите и контактите (шаблонът на имейла).

export default {
  hero: {
    kicker: 'Staffe & accessori per ascensori e montacarichi',
    title: 'Staffe brevettate per guide e porte di piano',
    lead: 'Sistema forato, snodato e asolato per il fissaggio regolabile di guide del contrappeso e porte di piano — ideato per adattarsi a murature irregolari, non perpendicolari e con ferri d’armatura. Brevetto per Modello di Utilità riconosciuto dal Ministero delle Imprese e del Made in Italy.',
    chips: ['Made in Italy', 'Acciaio zincato', 'Sistema ambidestro', 'Brevettato'],
    ctaProducts: 'Vedi prodotti e listino',
    ctaCatalog: 'Scarica il catalogo (PDF)',
    patentLabel: 'Brevetto per Modello di Utilità',
    numAbbr: 'N.',
    patentOffice: 'Ministero delle Imprese e del Made in Italy — UIBM · deposito 19/05/2023',
    visualAlt: 'Disegno tecnico delle staffe brevettate nelle versioni destra (DX) e sinistra (SX)',
  },
  stats: [
    { value: '± 8°', label: 'Regolazione angolare' },
    { value: '45 – 255', label: 'Corsa di estensione (mm)' },
    { value: 'DX / SX', label: 'Staffe ambidestre' },
    { value: '4 / 5', label: 'Spessore lamiera (mm)' },
  ],
  problem: {
    kicker: 'Il problema del cantiere',
    title: 'Muri storti, ferri d’armatura, tempi stretti',
    body1: 'Lungo il vano di corsa il calcestruzzo gettato in opera presenta spesso sporgenze e rientranze che rendono problematico un montaggio preciso. Le staffe tradizionali non si adattano e costringono il montatore a modifiche sul posto, con perdita di tempo e materiali aggiuntivi.',
    body2: 'La staffa Panev unisce un elemento di fissaggio alla muratura e un elemento di supporto per il componente, collegati da un giunto articolato che regola l’angolo e da un elemento di bloccaggio che lo fissa. Le nervature di irrigidimento sono più larghe proprio in prossimità del giunto — la zona più sollecitata in opera.',
    toolsLabel: 'Bastano tre attrezzi',
    tools: ['Trapano tassellatore', 'Chiavi per bulloni', 'Livella'],
    highlight: 'Rigidezza massima dove serve',
    highlightBody: 'Nervature contigue e più larghe presso il giunto articolato: la staffa resiste meglio proprio nel punto più sollecitato.',
  },
  applications: {
    kicker: 'Campi di impiego',
    title: 'Tre applicazioni, un solo sistema',
    items: [
      {
        img: 'prod-porte-overview',
        title: 'Soglia porta di piano',
        body: 'Fissaggio e regolazione in quota della soglia della porta di piano rispetto alla quota zero del pianerottolo.',
      },
      {
        img: 'sistema-overview',
        title: 'Gruppo operatore',
        body: 'Montaggio del gruppo operatore per l’apertura della porta di cabina, con la staffa fissata alla struttura del vano e alla cabina.',
      },
      {
        img: 'prod-SU-SG-overview',
        title: 'Guide del contrappeso',
        body: 'Fissaggio delle guide del contrappeso alla muratura del vano di corsa, con supporti regolabili serie SU · SD · SC.',
      },
    ],
    ambi: 'Sistema ambidestro. La nervatura di irrigidimento può essere disposta a sinistra o a destra: questo permette di aggirare i ferri d’armatura nelle pareti in calcestruzzo e di realizzare i fori nei punti più adatti, senza spostare i componenti della porta.',
  },
  featured: {
    kicker: 'Le famiglie di prodotto',
    title: 'Dal listino: le staffe più richieste',
    families: [
      {
        img: 'prod-porte-overview',
        title: 'Staffe porta di piano — serie A / B',
        body: 'Piastra forata + staffa asolata, regolazione ± 7° / ± 8° su murature non perpendicolari.',
      },
      {
        img: 'prod-SU-SG-overview',
        title: 'Supporti SU / SD + guida SG',
        body: 'Supporto universale o decentrato con staffa di giunzione, corsa di estensione 45 – 215 mm.',
      },
      {
        img: 'prod-SC-overview',
        title: 'Supporti scorrevoli SC + SG',
        body: 'Per le corse più ampie, fino a 235 mm, spessore 4 mm.',
      },
      {
        img: 'prod-SG220-overview',
        title: 'Staffe guida SG fisse',
        body: 'Larghezze 50 / 60 / 80 mm, lunghezze 130 – 220 mm, pronte per l’abbinamento diretto.',
      },
    ],
    fromPrice: 'da',
    vatNote: 'Prezzi IVA esclusa',
    seeAll: 'Listino completo con tutti i codici',
  },
  patent: {
    kicker: 'Proprietà industriale',
    title: 'Un sistema brevettato',
    body: 'La staffa di supporto Panev Ascensori è tutelata da brevetto per Modello di Utilità rilasciato dal Ministero delle Imprese e del Made in Italy (UIBM). Il titolo protegge la soluzione di fissaggio regolabile per i componenti strutturali di impianti di ascensore e montacarichi.',
    conformity: 'Prodotti conformi alla normativa UNI EN 81 (regole di sicurezza per ascensori), acciaio conforme UNI EN 10025, idonei al collaudo UNI 10411.',
    rows: [
      ['Numero', 'N. 202023000002112'],
      ['Tipo', 'Modello di Utilità'],
      ['Classifica', 'B66B'],
      ['Deposito', '19/05/2023'],
      ['Rilascio', 'Roma, 07/01/2025'],
      ['Validità', 'fino al 19/05/2033'],
    ],
  },
  order: {
    kicker: 'Come ordinare',
    title: 'Ordine diretto via email',
    lead: 'Nessun carrello, nessuna registrazione: scegli i codici dal listino e invia l’ordine via email. Rispondiamo con conferma d’ordine o preventivo.',
    steps: [
      {
        title: 'Scegli i codici',
        body: 'Consulta il listino o il catalogo PDF e annota codice, quantità e — dove previsto — la mano DX o SX.',
      },
      {
        title: 'Invia l’email',
        body: 'Scrivi a info@panevascensori.it con l’elenco dei codici. Il pulsante “Ordina via email” precompila il messaggio per te.',
      },
      {
        title: 'Ricevi la conferma',
        body: 'Ti rispondiamo con disponibilità, totale e tempi di consegna: standard 2 – 5 giorni lavorativi, express 24 – 48 ore su richiesta.',
      },
    ],
    freeShipping: 'Spedizione gratuita in tutta Italia per ordini superiori a 500 € (IVA esclusa).',
    b2b: 'Operatività esclusivamente B2B con partita IVA. Fattura elettronica via SdI.',
    mailSubject: 'Ordine staffe — [azienda]',
    mailBody: 'Spett.le Panev Ascensori,\n\ndesideriamo ordinare i seguenti articoli:\n\n- CODICE — quantità — mano DX/SX (se prevista)\n\nDati aziendali (ragione sociale, P.IVA, indirizzo di consegna):\n\nCordiali saluti',
  },
  faq: {
    kicker: 'Domande frequenti',
    title: 'FAQ — ordini, prezzi, spedizione',
    items: [
      {
        q: 'Come si ordina?',
        a: 'Via email a info@panevascensori.it: indica codice, quantità e — dove prevista — la mano DX o SX. Il pulsante „Ordina via email“ e la lista d’ordine precompilano il messaggio. Rispondiamo con conferma d’ordine, totale e tempi di consegna.',
      },
      {
        q: 'I prezzi includono l’IVA?',
        a: 'No: tutti i prezzi a listino sono in euro, IVA esclusa, riferiti a unità singole (listino 2026). La vendita è riservata a operatori professionali (B2B) con partita IVA; fattura elettronica via SdI.',
      },
      {
        q: 'Quanto costa la spedizione e in quanto tempo arriva?',
        a: 'La spedizione è gratuita in tutta Italia per ordini superiori a 500 € (IVA esclusa); sotto tale soglia le spese sono indicate nella conferma d’ordine. Consegna standard 2 – 5 giorni lavorativi, express 24 – 48 ore su richiesta.',
      },
      {
        q: 'Che cosa significano DX e SX?',
        a: 'Ogni staffa è ambidestra: DX indica la versione destra, SX la sinistra. Questo permette di aggirare i ferri d’armatura nel calcestruzzo e di forare nei punti più adatti. La mano desiderata va indicata in fase d’ordine.',
      },
      {
        q: 'Quale serie devo scegliere?',
        a: 'Per il fissaggio della porta di piano: serie A / B (sezioni 37 / 45 / 65 mm, regolazione ± 7° / ± 8°). Per le guide del contrappeso: supporti SU (universale), SD (decentrato) o SC (scorrevole) abbinati alla staffa di giunzione SG, con corsa 45 – 235 mm. Per misure fuori standard: soluzioni su disegno esecutivo, a preventivo.',
      },
      {
        q: 'Le staffe sono conformi alle normative e garantite?',
        a: 'Sì: prodotti conformi alla normativa UNI EN 81, acciaio zincato conforme UNI EN 10025, idonei al collaudo UNI 10411. Il sistema è tutelato da brevetto per Modello di Utilità UIBM N. 202023000002112, valido fino al 2033. Garanzia 2 anni sui difetti di fabbricazione.',
      },
    ],
  },
};

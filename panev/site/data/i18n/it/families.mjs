// Italiano — Страниците по семейства продукти (адреси, мета, H1, отговор отпред, FAQ). Фактите са
// от каталога и от ../../products.mjs: нищо ново, което каталогът не казва.

export default {
  familySlugs: {
    famDoors: 'staffe-porte-di-piano.html',
    famGuides: 'supporti-guide-contrappeso.html',
    famSg: 'staffe-guida-sg.html',
    famSpecial: 'staffe-su-misura.html',
  },
  familyMeta: {
    famDoors: {
      title: 'Staffe per porte di piano ascensore A/B | Panev',
      description: 'Staffe forate e snodate per porte di piano: piastre A e staffe B serie 37/45/65 mm, regolazione ±7°/±8°, DX/SX. Listino IVA esclusa, ordini via email.',
      keywords: ['staffe porte di piano', 'staffe porta di piano ascensore', 'piastra A staffa B ascensore', 'staffe regolabili porte di piano', 'fissaggio porte di piano ascensore', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famGuides: {
      title: 'Supporti guide contrappeso SU SD SC + SG | Panev',
      description: 'Supporti regolabili per guide del contrappeso: SU universale, SD decentrato, SC scorrevole con staffa di giunzione SG. Corsa 45–235 mm, listino IVA esclusa.',
      keywords: ['supporti guide contrappeso', 'staffa guida contrappeso', 'staffe regolabili guide ascensore', 'supporto SU SD SC', 'staffa di giunzione SG', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famSg: {
      title: 'Staffe guida SG fisse per ascensori | Panev',
      description: 'Staffe guida SG ad L in versione fissa: larghezze 50/60/80 mm, lunghezze 130–220 mm, lamiera 4 mm. 15 codici a listino IVA esclusa, ordine via email.',
      keywords: ['staffe guida SG', 'staffe guida ascensore', 'staffa ad L ascensore', 'staffaggio guide ascensore', 'staffa di giunzione guida', 'Panev Ascensori', 'Carbon Stealth'],
    },
    famSpecial: {
      title: 'Staffe su misura e fissaggio a parete | Panev',
      description: 'Su disegno esecutivo: supporto SC 50 170 con sporgenza A, guida SG 225 50, staffe SN e braccio rigido regolabile per il fissaggio a parete. A preventivo.',
      keywords: ['staffe su misura ascensore', 'fissaggio guide a parete', 'braccio rigido regolabile', 'staffa d’angolo SN', 'staffa a squadra ascensore', 'Panev Ascensori', 'Carbon Stealth'],
    },
  },
  families: {
    shared: {
      more: 'Pagina dedicata',
      familiesLabel: 'Famiglie di staffe',
      crumbsLabel: 'Percorso',
      faqKicker: 'Domande frequenti',
      otherTitle: 'Altre famiglie di staffe',
      fullList: 'Listino completo con tutti i codici',
      see3d: 'Vedi in 3D',
      catalogPages: (a, b) => `Catalogo PDF · pag. ${a}–${b}`,
      altDoor: (serie, codes) => `Staffa per porta di piano serie ${serie}: ${codes.join(' con ')}, render 3D`,
      altCfg: (sup, gui) => `Supporto ${sup} con staffa di giunzione ${gui} per guide del contrappeso, render 3D`,
    },
    famDoors: {
      crumb: 'Staffe per porte di piano',
      kicker: 'Fissaggio porta di piano · serie A / B',
      h1: 'Staffe per porte di piano di ascensori: serie A / B',
      lead: 'Staffe forate e snodate per fissare e allineare i componenti della porta di piano su qualsiasi muratura, anche non perpendicolare: piastra A e staffa B della stessa sezione (37, 45 o 65 mm), regolazione angolare ± 7° / ± 8°, versione destra o sinistra.',
      faqTitle: 'Staffe per porte di piano: domande frequenti',
      faq: [
        { q: 'Come sono fatte le staffe per porte di piano Panev?', a: 'Sono due pezzi: la piastra A, parte orizzontale forata, e la staffa B, parte verticale asolata, della stessa sezione (37, 45 o 65 mm). La regolazione angolare è di ± 8° sulla serie 65 e di ± 7° sulle serie 45 e 37; la lamiera è da 5 mm (serie 65 e 45) o da 4 mm (serie 37).' },
        { q: 'Posso abbinare piastre e staffe di serie diverse?', a: 'No: la piastra A è compatibile esclusivamente con le staffe B della stessa sezione. Le serie 37 / 45 / 65 non sono intercambiabili tra loro.' },
        { q: 'Le staffe sono destre o sinistre?', a: 'Sono ambidestre: disponibili in versione destra (DX) e sinistra (SX). Indica la mano desiderata in fase d’ordine.' },
      ],
    },
    famGuides: {
      crumb: 'Supporti per guide del contrappeso',
      kicker: 'Fissaggio guide del contrappeso · SU · SD · SC + SG',
      h1: 'Staffe e supporti regolabili per guide del contrappeso',
      lead: 'Tre supporti regolabili per fissare e allineare le guide del contrappeso, sempre con la staffa di giunzione SG: SU universale, SD con base decentrata per murature irregolari e SC scorrevole per le corse più ampie. Corsa di estensione da 45 a 235 mm, aletta di sormonto 35 mm.',
      faqTitle: 'Supporti per guide del contrappeso: domande frequenti',
      faq: [
        { q: 'Che differenza c’è tra i supporti SU, SD e SC?', a: 'SU è il supporto universale e SD quello con base decentrata, per una maggiore flessibilità di posizionamento su murature irregolari: entrambi in lamiera da 5 mm, corsa fino a 215 mm. SC è il supporto scorrevole, in lamiera da 4 mm, per le corse di estensione più ampie, fino a 235 mm.' },
        { q: 'Che cosa si ordina per una configurazione?', a: 'Due codici: il supporto (SU, SD o SC) e la staffa di giunzione SG indicata per quella configurazione, ad esempio SU 220 160 con SG 80 150. Entrambi sono a listino con il proprio prezzo, IVA esclusa.' },
        { q: 'Come si regola la distanza tra muratura e guida?', a: 'La staffa di giunzione scorre sul supporto entro la corsa di estensione indicata per ogni configurazione — ad esempio 45 – 155 mm per SU 220 160 con SG 80 150 — con un’aletta di sormonto di 35 mm.' },
      ],
    },
    famSg: {
      crumb: 'Staffe guida SG',
      kicker: 'Staffe guide standard · versione fissa',
      h1: 'Staffe guida SG fisse per ascensori',
      lead: 'Staffe guida ad L in versione fissa, in lamiera da 4 mm: tre larghezze (50, 60 e 80 mm) e cinque lunghezze (da 130 a 220 mm), 15 codici a listino, pronti per l’abbinamento con i supporti SU, SD, SC o con il fissaggio a braccio rigido.',
      faqTitle: 'Staffe guida SG: domande frequenti',
      faq: [
        { q: 'Quali misure sono disponibili?', a: 'Larghezze 50, 60 e 80 mm e lunghezze 130, 150, 170, 190 e 220 mm: 15 codici, tutti in lamiera da 4 mm, con prezzo a listino IVA esclusa.' },
        { q: 'Come si legge il codice SG?', a: 'SG indica la staffa di giunzione tra supporto e guida del contrappeso; il primo numero è la larghezza e il secondo la lunghezza in millimetri. SG 80 150 = larghezza 80 mm, lunghezza 150 mm.' },
        { q: 'Con che cosa si abbinano?', a: 'Con i supporti regolabili SU, SD e SC, oppure con il fissaggio a parete tramite braccio rigido regolabile.' },
      ],
    },
    famSpecial: {
      crumb: 'Staffe su misura',
      kicker: 'Soluzioni speciali e su misura',
      h1: 'Staffe su misura e fissaggio a parete con braccio rigido',
      lead: 'Per le installazioni non standard: il supporto SC 50 170, con misura di sporgenza “A” definita sul disegno esecutivo del cantiere, la guida componibile SG 225 50 e il fissaggio a parete con staffa d’angolo SN 60 65, staffa a squadra SN 65 200 e braccio rigido regolabile BRACCIO 160 190. Prezzi a preventivo.',
      faqTitle: 'Staffe su misura: domande frequenti',
      faq: [
        { q: 'Quando servono le soluzioni su misura?', a: 'Nelle condizioni di montaggio non standard: la misura di sporgenza “A” del supporto SC 50 170 si definisce in base al disegno esecutivo del cantiere; la guida SG 225 50 è componibile (150 + 30 mm, lamiera da 5 mm).' },
        { q: 'Che cos’è il fissaggio a parete con braccio rigido?', a: 'È una soluzione di ancoraggio per staffe guida SG abbinate a un supporto SC tramite braccio rigido regolabile, per il fissaggio diretto su pareti d’angolo del vano corsa. Comprende staffa d’angolo SN 60 65, staffa a squadra SN 65 200 e BRACCIO 160 190.' },
        { q: 'Come si ottiene il prezzo?', a: 'Le soluzioni speciali sono a preventivo: invia disegno o misure a info@panevascensori.it e ricevi la quotazione su commessa.' },
      ],
    },
  },
};

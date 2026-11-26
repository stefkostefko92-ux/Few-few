// Ръководства 5–8: оферти, въвеждане в експлоатация, край на работите, разходи в кондоминиума.

import { F } from "./fonti.mjs";
import { R } from "../routes.mjs";

const A = (href, text) => `<a href="${href}">${text}</a>`;

export const G_PREVENTIVI = {
  slug: "confrontare-preventivi-ascensore",
  menu: "Confrontare i preventivi",
  title: "Come confrontare i preventivi per l'ascensore | LiftCon",
  description:
    "Come rendere confrontabili i preventivi per manutenzione, riparazione o ammodernamento dell'ascensore: oggetto, voci, esclusioni, tempi, garanzie e pagamenti.",
  keywords: ["preventivi ascensore condominiale", "preventivo ascensore condominio", "confrontare preventivi ascensore", "costo sostituzione ascensore condominio", "capitolato ascensore", "Carbon Stealth"],
  h1: "Come confrontare i preventivi per l'ascensore del condominio",
  lead:
    "Per confrontare i preventivi dell'ascensore bisogna prima renderli omogenei: stesso oggetto, stesse voci, stesse esclusioni. Solo dopo ha senso guardare il prezzo. Questi sono i passaggi, nell'ordine in cui conviene farli.",
  howto: {
    name: "Confrontare i preventivi per l'ascensore",
    steps: [
      ["Definire lo stesso oggetto per tutti", "Una richiesta d'offerta unica, o un capitolato descrittivo, evita che ogni fornitore quoti un lavoro diverso."],
      ["Elencare le voci di ogni offerta", "Componenti indicati, quantità e lavorazioni, riportati su un'unica tabella con le stesse righe."],
      ["Segnare le esclusioni", "Opere edili, elettriche a monte dell'impianto, smaltimenti e oneri accessori: ciò che manca in un'offerta va aggiunto al confronto."],
      ["Controllare tempi e fermo dell'impianto", "Durata dei lavori, giorni di fermo e gestione dei disagi per chi abita ai piani alti."],
      ["Chiarire che cosa succede dopo i lavori", "Documenti consegnati, aggiornamento del libretto e, se l'intervento è una modifica costruttiva, la verifica straordinaria, le cui spese sono del proprietario."],
      ["Confrontare garanzie e pagamenti", "Durata e oggetto della garanzia, acconti, stati di avanzamento e saldo legato alla fine dei lavori."],
      ["Preparare il prospetto per l'assemblea", "Una tabella leggibile da tutti, con le differenze evidenziate e le domande ancora aperte."],
    ],
  },
  sezioni: [
    {
      h2: "Perché due preventivi per lo stesso lavoro non sono confrontabili?",
      html: `<p class="answer">Perché ogni fornitore descrive il lavoro a modo suo: componenti diversi, esclusioni diverse, condizioni diverse.</p><p>Un'offerta più bassa può escludere opere che un'altra comprende, o proporre un componente diverso. Il confronto ha senso solo dopo aver riportato tutte le offerte sulle stesse voci.</p>`,
    },
    {
      h2: "Quali domande fare ai fornitori?",
      html: `<p class="answer">Le domande che chiudono le differenze emerse dal confronto.</p><ul><li>Che cosa è escluso dall'offerta e chi lo esegue?</li><li>L'intervento è una modifica costruttiva? Chi prepara i documenti per la verifica straordinaria?</li><li>Quanti giorni resterà fermo l'impianto?</li><li>Quali documenti verranno consegnati a fine lavori?</li></ul>`,
    },
    {
      h2: "Che cosa decide l'assemblea?",
      html: `<p class="answer">Le opere di manutenzione straordinaria sono approvate dall'assemblea, che deve costituire un fondo speciale di importo pari a quello dei lavori, o ai singoli pagamenti se il contratto prevede stati di avanzamento (art. 1135 del Codice civile).</p><p>L'amministratore può ordinare lavori straordinari solo se urgenti, riferendone alla prima assemblea. Un ${A(
        R.preventivi,
        "prospetto comparativo",
      )} chiaro rende la discussione più rapida e la decisione più facile da motivare.</p>`,
    },
  ],
  faq: [
    {
      q: "Il preventivo più basso è sempre il più conveniente?",
      a: "Non necessariamente: può escludere opere che altri comprendono o proporre componenti diversi. Il prezzo si confronta solo dopo aver reso omogenee le offerte.",
    },
    {
      q: "Quanti preventivi bisogna chiedere?",
      a: "Dipende dalle decisioni dell'assemblea e dal regolamento di condominio. Conta soprattutto che le offerte rispondano alla stessa richiesta.",
    },
    {
      q: "Chi paga la verifica straordinaria dopo un ammodernamento?",
      a: "Il proprietario dello stabile (art. 14 del DPR 162/1999). Conviene comunque chiarire nel preventivo chi prepara i documenti e chi assiste alla verifica.",
    },
  ],
  fonti: [F.cc1135, F.dpr162art14, F.dpr162art2],
  correlati: ["preventivi", "controllo"],
};

export const G_ESERCIZIO = {
  slug: "messa-in-esercizio-matricola-ascensore",
  menu: "Messa in esercizio e matricola",
  title: "Messa in esercizio ascensore e matricola | LiftCon",
  description:
    "Entro quanto comunicare al Comune la messa in esercizio dell'ascensore, che cosa contiene la comunicazione e quando arriva la matricola (DPR 162/1999, art. 12).",
  keywords: ["messa in esercizio ascensore", "matricola ascensore", "matricola ascensore Comune", "comunicazione messa in esercizio ascensore", "richiesta matricola ascensore", "Carbon Stealth"],
  h1: "Messa in esercizio dell'ascensore e numero di matricola",
  lead:
    "Per mettere in esercizio un ascensore, il proprietario o il suo legale rappresentante deve comunicarlo al Comune entro 60 giorni dalla data della dichiarazione di conformità; entro 30 giorni il Comune assegna il numero di matricola (art. 12 del DPR 162/1999, come modificato dal DPR 23/2017).",
  sezioni: [
    {
      h2: "Che cosa contiene la comunicazione al Comune?",
      html: `<p class="answer">I dati che identificano l'impianto e i soggetti responsabili.</p><ul><li>Indirizzo dell'edificio.</li><li>Velocità, portata, corsa, numero delle fermate e tipo di azionamento.</li><li>Installatore dell'impianto.</li><li>Copia della dichiarazione di conformità.</li><li>Ditta di manutenzione e soggetto incaricato delle verifiche periodiche, entrambi con l'incarico accettato.</li></ul>`,
    },
    {
      h2: "Che cosa succede se si supera il termine di 60 giorni?",
      html: `<p class="answer">Alla comunicazione va allegato anche il verbale di una verifica straordinaria di attivazione.</p><p>La regola è stata introdotta dal DPR 23/2017 insieme all'estensione del termine, che nel testo originale era di 10 giorni: le guide scritte prima del 2017 riportano ancora il vecchio termine.</p>`,
    },
    {
      h2: "Quando arriva la matricola?",
      html: `<p class="answer">Entro 30 giorni dalla comunicazione il Comune assegna il numero di matricola e lo comunica al proprietario e al soggetto incaricato delle verifiche.</p><p>La matricola va riportata sulla ${A("/guide/libretto-ascensore-targa-cabina/", "targa esposta in cabina")} e compare nel libretto dell'impianto.</p>`,
    },
    {
      h2: "Dopo una modifica costruttiva serve una nuova comunicazione?",
      html: `<p class="answer">Sì: il proprietario rinnova la comunicazione al Comune e al soggetto delle verifiche periodiche, e l'impianto va sottoposto a ${A(
        "/guide/verifica-straordinaria-ascensore/",
        "verifica straordinaria",
      )}.</p><p>Tenere in esercizio un impianto con comunicazioni mancanti o non aggiornate dopo una modifica non è consentito.</p>`,
    },
  ],
  faq: [
    { q: "Entro quando va comunicata la messa in esercizio dell'ascensore?", a: "Entro 60 giorni dalla data della dichiarazione di conformità, secondo l'articolo 12 del DPR 162/1999 nel testo vigente." },
    { q: "Chi assegna il numero di matricola?", a: "L'ufficio comunale competente, entro 30 giorni dalla comunicazione di messa in esercizio." },
    {
      q: "Perché alcune guide parlano di 10 giorni?",
      a: "Era il termine del testo originale del 1999; il DPR 23/2017 lo ha portato a 60 giorni.",
    },
  ],
  fonti: [F.dpr162art12, F.dpr23, F.dpr162art16],
  correlati: ["relazioni", "supporto"],
};

export const G_FINELAVORI = {
  slug: "fine-lavori-ascensore-cosa-controllare",
  menu: "Fine lavori: cosa controllare",
  title: "Fine lavori ascensore: cosa controllare | LiftCon",
  description:
    "Che cosa controllare a fine lavori sull'ascensore prima del saldo: lavori ordinati e dichiarati, componenti sostituiti, documenti consegnati e anomalie.",
  keywords: ["fine lavori ascensore", "lavori ascensore condominio", "dichiarazione di conformità ascensore", "saldo lavori ascensore", "controllo lavori ascensore", "Carbon Stealth"],
  h1: "Fine lavori sull'ascensore: che cosa controllare prima del saldo",
  lead:
    "Prima di pagare il saldo di un intervento sull'ascensore conviene confrontare tre cose: ciò che era stato ordinato, ciò che l'impresa dichiara di aver fatto e ciò che si osserva sull'impianto, insieme ai documenti consegnati.",
  howto: {
    name: "Controllare la fine dei lavori sull'ascensore",
    steps: [
      ["Riprendere preventivo, ordine o capitolato", "Sono il riferimento: elencano lavorazioni e componenti attesi."],
      ["Chiedere l'elenco dei lavori eseguiti", "Con i componenti sostituiti e i relativi documenti di fornitura."],
      ["Raccogliere i documenti consegnati", "Dichiarazioni previste, manuali, istruzioni e rapportini; annotazioni sul libretto."],
      ["Osservare l'impianto", "Un sopralluogo di riscontro sulle lavorazioni visibili, coordinato con il manutentore."],
      ["Mettere per iscritto anomalie e attività mancanti", "Un elenco con ubicazione e fotografie, da consegnare all'impresa."],
      ["Controllare se serve la verifica straordinaria", "Se l'intervento è una modifica costruttiva, l'impianto va sottoposto a verifica straordinaria."],
      ["Saldare dopo il riscontro delle correzioni", "Un secondo sopralluogo registra le correzioni dichiarate."],
    ],
  },
  sezioni: [
    {
      h2: "Quali documenti chiedere a fine lavori?",
      html: `<p class="answer">Dipende dall'intervento; tra i più comuni ci sono le dichiarazioni previste dalla legge, le schede dei componenti, i manuali e le istruzioni, i rapportini.</p><p>Per gli impianti di sollevamento rientranti nella lettera f) del DM 37/2008, l'impresa installatrice consegna al committente la dichiarazione di conformità al termine dei lavori (art. 7). Per un ascensore che entra in esercizio il DPR 162/1999 richiede la dichiarazione di conformità prevista dal regolamento stesso.</p>`,
    },
    {
      h2: "Che cosa fare se qualcosa non corrisponde?",
      html: `<p class="answer">Metterlo per iscritto, con ubicazione e fotografie, e chiedere all'impresa di correggere prima del saldo.</p><p>Il ${A(
        R.controllo,
        "controllo qualità dei lavori",
      )} LiftCon produce proprio questo elenco e, dopo le correzioni dichiarate, un rapporto di riscontro.</p>`,
    },
    {
      h2: "Il controllo di fine lavori sostituisce il collaudo o la verifica?",
      html: `<p class="answer">No: descrive lavorazioni visibili e documenti; collaudi, verifiche straordinarie e dichiarazioni spettano ai soggetti previsti dalle norme.</p>`,
    },
  ],
  faq: [
    {
      q: "Quando conviene controllare i lavori sull'ascensore?",
      a: "Prima del saldo, e idealmente anche prima dei lavori: con il preventivo come riferimento, il confronto finale è più semplice e più preciso.",
    },
    {
      q: "Chi rilascia la dichiarazione di conformità?",
      a: "L'impresa installatrice abilitata, al termine dei lavori, nei casi previsti dal DM 37/2008 (art. 7). LiftCon non rilascia dichiarazioni di conformità.",
    },
    {
      q: "Serve sempre la verifica straordinaria dopo i lavori?",
      a: "No: serve dopo le modifiche costruttive elencate dal DPR 162/1999, come la sostituzione del macchinario, del quadro elettrico o delle porte di piano.",
    },
  ],
  fonti: [F.dm37art7, F.dm37art1, F.dpr162art2, F.dpr162art14],
  correlati: ["controllo", "relazioni"],
};

export const G_SPESE = {
  slug: "spese-ascensore-condominio-ripartizione",
  menu: "Ripartizione delle spese",
  title: "Ripartizione spese ascensore in condominio | LiftCon",
  description:
    "Come si ripartiscono le spese di manutenzione e sostituzione dell'ascensore in condominio (art. 1124 c.c.) e chi decide i lavori straordinari (art. 1135 c.c.).",
  keywords: ["ripartizione spese ascensore", "spese ascensore condominio", "ripartizione spese ascensore codice civile", "ripartizione spese ascensore per piano", "sostituzione ascensore condominio chi paga", "Carbon Stealth"],
  h1: "Ripartizione delle spese dell'ascensore in condominio",
  lead:
    "Le spese di manutenzione e sostituzione dell'ascensore sono a carico dei proprietari delle unità a cui l'impianto serve e si dividono per metà in base al valore delle unità, cioè i millesimi, e per metà in proporzione all'altezza di ciascun piano dal suolo (art. 1124 del Codice civile).",
  sezioni: [
    {
      h2: "L'ascensore è una parte comune?",
      html: `<p class="answer">Sì: dal 2013, con la riforma del condominio (L. 220/2012), gli ascensori sono citati espressamente tra le parti comuni dell'edificio, salvo che il titolo disponga diversamente (art. 1117).</p>`,
    },
    {
      h2: "Come funziona la ripartizione dell'articolo 1124?",
      html: `<p class="answer">Metà della spesa si divide secondo il valore delle unità immobiliari, l'altra metà in proporzione all'altezza del piano dal suolo.</p><p>Chi abita più in alto contribuisce quindi di più per la seconda metà. La regola riguarda sia la manutenzione sia la sostituzione dell'impianto; regolamento e accordi tra i condomini possono incidere sul caso concreto.</p>`,
    },
    {
      h2: "Chi decide i lavori straordinari sull'ascensore?",
      html: `<p class="answer">L'assemblea, che deve anche costituire un fondo speciale pari all'importo dei lavori (art. 1135, comma 1, n. 4); se il contratto prevede pagamenti per stati di avanzamento, il fondo può essere costituito in relazione ai singoli pagamenti.</p><p>L'amministratore può ordinare lavori di manutenzione straordinaria solo se urgenti, e deve riferirne alla prima assemblea. Spetta a lui anche compiere gli atti conservativi sulle parti comuni (art. 1130).</p>`,
    },
    {
      h2: "Dove serve il supporto di un tecnico?",
      html: `<p class="answer">Nel rendere comprensibile all'assemblea che cosa si sta approvando e nel controllare che venga eseguito.</p><p>${A(R.preventivi, "Preventivi confrontabili")}, ${A(
        R.supporto,
        "assistenza in assemblea",
      )} e ${A(R.controllo, "controllo dei lavori")} riducono le discussioni e documentano le decisioni. La ripartizione delle spese resta materia dell'amministratore e, nei casi dubbi, di un legale.</p>`,
    },
  ],
  faq: [
    {
      q: "Come si dividono le spese dell'ascensore in condominio?",
      a: "Per metà in base ai millesimi delle unità servite e per metà in proporzione all'altezza di ciascun piano dal suolo (art. 1124 del Codice civile).",
    },
    {
      q: "L'amministratore può ordinare lavori sull'ascensore senza l'assemblea?",
      a: "Sì per la manutenzione ordinaria e gli atti conservativi, che rientrano nelle sue attribuzioni (art. 1130). I lavori di manutenzione straordinaria li decide l'assemblea; l'amministratore può ordinarli da solo solo se urgenti, riferendone nella prima assemblea (art. 1135 del Codice civile).",
    },
    {
      q: "Questa guida vale come parere legale?",
      a: "No: riassume le norme del Codice civile a scopo informativo. Per casi specifici, regolamenti particolari o contestazioni serve un professionista legale.",
    },
  ],
  fonti: [F.cc1124, F.cc1117, F.cc1135, F.cc1130],
  correlati: ["preventivi", "supporto"],
};

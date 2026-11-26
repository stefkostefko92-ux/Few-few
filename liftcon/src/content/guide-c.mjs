// Ръководство 9: ammodernamento — най-силното търговско намерение в реалните заявки („ammodernamento
// ascensore in condominio“, „… ripartizione spese“, „sostituzione ascensore condominio“). Само проверени факти.

import { F } from "./fonti.mjs";
import { R } from "../routes.mjs";

const A = (href, text) => `<a href="${href}">${text}</a>`;

export const G_AMMODERNAMENTO = {
  slug: "ammodernamento-ascensore-condominio",
  menu: "Ammodernamento dell'ascensore",
  title: "Ammodernamento ascensore in condominio: guida | LiftCon",
  description:
    "Ammodernamento dell'ascensore in condominio: quando è una modifica costruttiva, chi decide, come si ripartiscono le spese e come controllare i lavori.",
  keywords: [
    "ammodernamento ascensore condominio",
    "ammodernamento ascensore",
    "ammodernamento ascensore ripartizione spese",
    "sostituzione ascensore condominio",
    "lavori straordinari ascensore condominio",
    "Carbon Stealth",
  ],
  h1: "Ammodernamento dell'ascensore in condominio: decidere, spendere, controllare",
  lead:
    "Ammodernare l'ascensore significa sostituire o adeguare componenti importanti dell'impianto. In condominio la decisione spetta all'assemblea e le spese si ripartiscono secondo l'articolo 1124 del Codice civile; se l'intervento rientra tra le modifiche costruttive del DPR 162/1999, a lavori finiti l'impianto va sottoposto a verifica straordinaria.",
  howto: {
    name: "Organizzare l'ammodernamento dell'ascensore",
    steps: [
      ["Fotografare la situazione di partenza", "Un sopralluogo descrittivo e l'esame di libretto, ultimi verbali e prescrizioni aperte."],
      ["Definire che cosa si vuole ottenere", "Un capitolato descrittivo con gli interventi richiesti, uguale per tutti i fornitori."],
      ["Raccogliere preventivi confrontabili", "Offerte che rispondono alla stessa richiesta, con esclusioni e condizioni evidenti."],
      ["Portare in assemblea un prospetto chiaro", "Le differenze tra le offerte e le domande ancora aperte, leggibili da tutti."],
      ["Controllare i lavori", "Avanzamento e componenti sostituiti, confrontati con l'ordine."],
      ["Chiudere con documenti e verifica", "Documenti di fine lavori, comunicazione al Comune e verifica straordinaria se si tratta di una modifica costruttiva."],
    ],
  },
  sezioni: [
    {
      h2: "Quando l'ammodernamento è una modifica costruttiva?",
      html: `<p class="answer">Quando comprende uno degli interventi elencati all'articolo 2, comma 1, lettera cc) del DPR 162/1999.</p><ul><li>Cambio della velocità, della portata, della corsa o del tipo di azionamento.</li><li>Sostituzione del macchinario, della cabina con la sua intelaiatura, del quadro elettrico, del gruppo cilindro-pistone, delle porte di piano, delle difese del vano o di altri componenti principali.</li></ul><p>In questi casi il proprietario rinnova la comunicazione al Comune e al soggetto delle verifiche (art. 12, comma 4) e fa eseguire la ${A(
        "/guide/verifica-straordinaria-ascensore/",
        "verifica straordinaria",
      )} (art. 14, comma 3).</p>`,
    },
    {
      h2: "Chi decide l'ammodernamento in condominio?",
      html: `<p class="answer">L'assemblea, che approva le opere di manutenzione straordinaria e costituisce un fondo speciale pari all'importo dei lavori (art. 1135 del Codice civile).</p><p>L'amministratore può ordinare lavori straordinari solo se urgenti, riferendone alla prima assemblea. Per decidere servono offerte confrontabili: l'${A(
        R.preventivi,
        "analisi dei preventivi",
      )} le mette sulle stesse voci.</p>`,
    },
    {
      h2: "Come si ripartiscono le spese dell'ammodernamento?",
      html: `<p class="answer">Per la manutenzione e la sostituzione dell'ascensore l'articolo 1124 del Codice civile prevede che metà della spesa si divida secondo il valore delle unità servite e metà in proporzione all'altezza di ciascun piano dal suolo.</p><p>Regolamento e accordi tra i condomini possono incidere sul caso concreto; per i dettagli, la guida sulla ${A(
        "/guide/spese-ascensore-condominio-ripartizione/",
        "ripartizione delle spese dell'ascensore",
      )}.</p>`,
    },
    {
      h2: "Come controllare i lavori di ammodernamento?",
      html: `<p class="answer">Confrontando, fase per fase, ciò che è stato ordinato con ciò che l'impresa dichiara e con ciò che si osserva sull'impianto.</p><p>Il ${A(
        R.controllo,
        "controllo qualità dei lavori",
      )} documenta l'avanzamento, i componenti dichiarati come sostituiti e le anomalie da correggere prima del saldo; non sostituisce la verifica straordinaria né il collaudo.</p>`,
    },
  ],
  faq: [
    {
      q: "Sostituire il quadro elettrico dell'ascensore richiede la verifica straordinaria?",
      a: "Sì: la sostituzione del quadro elettrico è tra le modifiche costruttive dell'articolo 2, comma 1, lettera cc) del DPR 162/1999.",
    },
    {
      q: "Chi paga l'ammodernamento dell'ascensore in condominio?",
      a: "I proprietari delle unità servite dall'impianto, con la ripartizione dell'articolo 1124 del Codice civile: metà secondo il valore delle unità, metà secondo l'altezza dei piani.",
    },
    {
      q: "Quanto costa ammodernare un ascensore?",
      a: "Dipende dall'impianto e dagli interventi scelti: non esiste un prezzo standard. Per questo conviene confrontare preventivi resi omogenei, voce per voce.",
    },
  ],
  fonti: [F.dpr162art2, F.dpr162art12, F.dpr162art14, F.cc1124, F.cc1135],
  correlati: ["preventivi", "controllo"],
};

// Каталогът на услугите — групиран по т. 1–4 на каталога, който клиентът ни даде.

import { SOPRALLUOGO, CONTROLLO, PREVENTIVI } from "./servizi-a.mjs";
import { SUPPORTO, VERIFICA, RELAZIONI } from "./servizi-b.mjs";

export const SERVIZI = [SOPRALLUOGO, CONTROLLO, PREVENTIVI, SUPPORTO, VERIFICA, RELAZIONI];

export const BY_KEY = Object.fromEntries(SERVIZI.map((s) => [s.key, s]));

export const GRUPPI = [
  {
    key: "consulenza",
    nome: "Consulenza tecnica indipendente",
    testo: "Sopralluoghi descrittivi e controllo dei lavori per sapere com'è l'impianto e che cosa è stato fatto.",
  },
  {
    key: "supporto",
    nome: "Supporto ad amministratori e proprietari",
    testo: "Preventivi confrontabili, incontri preparati e documenti in ordine.",
  },
  {
    key: "preverifica",
    nome: "Prima della verifica straordinaria",
    testo: "Fascicolo, prescrizioni e punti aperti prima della verifica ufficiale.",
  },
  {
    key: "documenti",
    nome: "Relazioni e documenti",
    testo: "Il documento scritto che chiude ogni incarico.",
  },
];

// „Facciamo / Non facciamo“ — т. 1–4 срещу т. 8 на каталога. Показва се на началната, на /servizi/ и на /metodo/.
export const FACCIAMO = [
  "Sopralluoghi descrittivi delle condizioni osservabili dell'impianto",
  "Controllo qualità dei lavori rispetto a preventivo, ordine o capitolato",
  "Confronto dei preventivi e capitolati descrittivi per i fornitori",
  "Esame documentale e preparazione alla verifica straordinaria",
  "Relazioni firmate e report fotografici",
  "Supporto al committente negli incontri e in assemblea",
];

export const NON_FACCIAMO = [
  "Verifiche periodiche o straordinarie ufficiali ai sensi del DPR 162/1999",
  "Verbali ufficiali o attestazioni riservate agli organismi competenti",
  "Certificazioni di sicurezza o di conformità dell'ascensore",
  "Progettazione, calcoli o asseverazioni riservati a professionisti abilitati",
  "Perizie giudiziarie",
  "Dichiarazioni di conformità ai sensi del DM 37/2008",
  "Prove o manovre sull'impianto: le esegue il manutentore",
];

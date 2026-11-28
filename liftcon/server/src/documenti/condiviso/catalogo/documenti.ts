// Документите, които обикновено се разглеждат при esame documentale на съществуващ асансьор в Италия.
// `riferimento` — само проверен спрямо действащия текст в Normattiva (Асансьорчика, 26.11.2026):
// DPR 162/1999 чл. 2 (lett. cc), 12, 13, 14, 15, 16 (в сила от 16.03.2017; чл. 15 — от 12.12.2017);
// DM 37/2008 чл. 7 (в сила от 27.03.2008). Където няма проверен член, полето липсва.
import type { VoceDocumentale } from "../tipi.js";

export const VOCI_DOCUMENTALI: VoceDocumentale[] = [
  {
    id: "libretto",
    nome: "Libretto dell'impianto",
    aiuto: "Vi si annotano o allegano verbali di verifica, esiti delle visite di manutenzione, dichiarazioni di conformità, comunicazioni con il Comune e matricola.",
    riferimento: "DPR 162/1999, art. 16, c. 1",
  },
  {
    id: "verbali-periodici",
    nome: "Verbali delle verifiche periodiche",
    aiuto: "Raccogliere gli ultimi verbali disponibili; annotare data, soggetto incaricato, esito ed eventuali prescrizioni.",
    riferimento: "DPR 162/1999, art. 13",
  },
  {
    id: "prescrizioni-evase",
    nome: "Documentazione dell'esecuzione delle prescrizioni dei verbali",
    aiuto: "Rapporti del manutentore, fatture o dichiarazioni che indicano come e quando sono state eseguite le prescrizioni.",
  },
  {
    id: "verbali-straordinari",
    nome: "Verbali di verifica straordinaria (se eseguite)",
    aiuto: "Ad esempio dopo un esito negativo, un incidente o una modifica costruttiva.",
    riferimento: "DPR 162/1999, art. 14",
  },
  {
    id: "comunicazione-esercizio",
    nome: "Comunicazione di messa in esercizio al Comune",
    aiuto: "Per gli impianti più vecchi chiedere quale atto di esercizio, rilasciato con il regime precedente, sia disponibile.",
    riferimento: "DPR 162/1999, art. 12, cc. 1-2",
  },
  {
    id: "matricola",
    nome: "Comunicazione del numero di matricola assegnato dal Comune",
    riferimento: "DPR 162/1999, art. 12, c. 3",
  },
  {
    id: "dichiarazione-conformita",
    nome: "Dichiarazione di conformità dell'impianto rilasciata dall'installatore",
    aiuto: "Una copia accompagna la comunicazione di messa in esercizio.",
    riferimento: "DPR 162/1999, art. 12, c. 2",
  },
  {
    id: "incarico-verifiche",
    nome: "Incarico al soggetto delle verifiche periodiche e sua accettazione",
    riferimento: "DPR 162/1999, artt. 12, c. 2, e 13",
  },
  {
    id: "contratto-manutenzione",
    nome: "Contratto di manutenzione in corso",
    aiuto: "Annotare ditta, data, durata, prestazioni comprese ed escluse, servizio di soccorso, reperibilità.",
    riferimento: "DPR 162/1999, art. 15",
  },
  {
    id: "visite-manutenzione",
    nome: "Registrazioni delle visite di manutenzione",
    aiuto: "Nel libretto o in rapporti separati; annotare la frequenza effettiva delle visite.",
    riferimento: "DPR 162/1999, artt. 15 e 16, c. 1",
  },
  {
    id: "rapporti-guasti",
    nome: "Rapporti di intervento per guasti e chiamate di soccorso",
  },
  {
    id: "modifiche-costruttive",
    nome: "Documentazione delle modifiche costruttive eseguite",
    aiuto: "Progetto o descrizione dei lavori, dichiarazioni della ditta, verbale di verifica straordinaria collegato.",
    riferimento: "DPR 162/1999, art. 2, c. 1, lett. cc), e art. 14",
  },
  {
    id: "targa-avvertenze",
    nome: "Targa e avvertenze d'uso in cabina (riscontro fotografico)",
    riferimento: "DPR 162/1999, art. 16, c. 3",
  },
  {
    id: "istruzioni",
    nome: "Istruzioni per l'uso e la manutenzione del fabbricante o dell'installatore",
  },
  {
    id: "istruzioni-emergenza",
    nome: "Istruzioni per la manovra di emergenza e il recupero delle persone",
  },
  {
    id: "schemi-elettrici",
    nome: "Schemi elettrici del quadro di manovra",
  },
  {
    id: "schemi-idraulici",
    nome: "Schema del circuito idraulico e dati della centralina",
    applicabile: ["oleodinamico", "piattaforma"],
  },
  {
    id: "componenti-sicurezza",
    nome: "Dichiarazioni e attestati dei componenti di sicurezza installati",
    aiuto: "Ad esempio serrature delle porte di piano, paracadute, limitatore di velocità, ammortizzatori, valvola di blocco.",
  },
  {
    id: "dichiarazione-macchine",
    nome: "Dichiarazione CE di conformità e istruzioni della piattaforma",
    applicabile: ["piattaforma"],
  },
  {
    id: "allarme-servizio",
    nome: "Documentazione del servizio di ricezione delle chiamate di allarme",
    aiuto: "Contratto o indicazione del centro che risponde e della linea utilizzata.",
  },
  {
    id: "dichiarazione-linea-elettrica",
    nome: "Dichiarazione di conformità della linea elettrica che alimenta l'impianto (impianto elettrico dell'edificio)",
    aiuto: "Riguarda la parte dell'impianto elettrico condominiale a monte dell'interruttore generale dell'ascensore.",
    riferimento: "DM 37/2008, art. 7",
  },
  {
    id: "prevenzione-incendi",
    nome: "Documenti di prevenzione incendi dell'edificio che riguardano vano, locale macchina o porte di piano (se l'edificio vi è soggetto)",
  },
  {
    id: "delibere",
    nome: "Delibere assembleari e comunicazioni relative all'impianto",
  },
  {
    id: "preventivi",
    nome: "Preventivi e offerte di lavori proposti o in corso",
  },
];

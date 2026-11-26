// Типични позиции от оферта за модернизация или ремонт — подсказки при попълване на controllo qualità.
// Само наименования на работи, без стойности, марки и цени.
import type { CategoriaLavori } from "../tipi.js";

export const CATEGORIE_LAVORI: CategoriaLavori[] = [
  {
    id: "quadro-manovra",
    titolo: "Quadro di manovra",
    voci: [
      "Sostituzione del quadro di manovra",
      "Inverter per il controllo della velocità",
      "Rifacimento dei cablaggi nel locale e nel vano",
      "Nuovo cavo flessibile della cabina",
      "Dispositivo di manovra di emergenza automatica",
      "Interruttore generale e protezioni dell'alimentazione",
      "Schemi elettrici aggiornati",
    ],
  },
  {
    id: "porte-piano",
    titolo: "Porte di piano",
    voci: [
      "Sostituzione delle porte di piano",
      "Sostituzione delle serrature e dei contatti",
      "Chiudiporta delle porte di piano",
      "Soglie e guide delle porte di piano",
      "Sostituzione dei vetri delle porte",
      "Ripristino delle finiture",
    ],
  },
  {
    id: "porte-cabina",
    titolo: "Porta di cabina e operatore",
    voci: [
      "Installazione o sostituzione della porta di cabina",
      "Sostituzione dell'operatore porte",
      "Barriera di protezione in chiusura",
      "Pattini, cinghie e guide della porta di cabina",
    ],
  },
  {
    id: "argano",
    titolo: "Macchinario di trazione",
    voci: [
      "Sostituzione dell'argano o del motore",
      "Sostituzione della puleggia di trazione",
      "Revisione o sostituzione del freno",
      "Sostituzione dei supporti antivibranti",
      "Cambio dell'olio del riduttore",
      "Protezioni delle parti rotanti",
    ],
  },
  {
    id: "funi",
    titolo: "Funi e sospensione",
    voci: [
      "Sostituzione delle funi o delle cinghie di trazione",
      "Sostituzione della fune del limitatore",
      "Attacchi delle funi e molle",
      "Pulegge di rinvio",
    ],
  },
  {
    id: "sicurezze",
    titolo: "Dispositivi di sicurezza",
    voci: [
      "Sostituzione del limitatore di velocità",
      "Sostituzione o revisione del paracadute",
      "Puleggia tenditrice del limitatore",
      "Ammortizzatori",
      "Interruttori di fine corsa",
      "Dispositivo contro il movimento incontrollato della cabina",
    ],
  },
  {
    id: "oleodinamica",
    titolo: "Centralina e circuito oleodinamico",
    voci: [
      "Sostituzione della centralina",
      "Sostituzione del gruppo valvole",
      "Sostituzione dei tubi flessibili",
      "Sostituzione dell'olio",
      "Guarnizioni del cilindro",
      "Sostituzione del cilindro e del pistone",
      "Valvola di blocco",
    ],
  },
  {
    id: "bottoniere",
    titolo: "Pulsantiere e segnalazioni",
    voci: [
      "Pulsantiera di cabina",
      "Pulsantiere di piano",
      "Indicatori di posizione e di direzione",
      "Sintesi vocale",
      "Caratteri in rilievo e Braille",
    ],
  },
  {
    id: "cabina",
    titolo: "Cabina",
    voci: [
      "Rifacimento delle pareti e dei rivestimenti",
      "Pavimento della cabina",
      "Illuminazione della cabina",
      "Illuminazione di emergenza della cabina",
      "Corrimano, specchio e accessori",
      "Aerazione della cabina",
      "Targa e avvertenze d'uso",
    ],
  },
  {
    id: "allarme",
    titolo: "Allarme e comunicazione",
    voci: [
      "Dispositivo di allarme bidirezionale",
      "Collegamento al centro di ricezione delle chiamate",
      "Pulsanti di allarme in fossa e sopra la cabina",
      "Comunicazione tra cabina e locale macchina",
    ],
  },
  {
    id: "vano-fossa",
    titolo: "Vano, fossa e testata",
    voci: [
      "Illuminazione del vano",
      "Dispositivo di arresto e presa in fossa",
      "Scala di accesso alla fossa",
      "Balaustra sul tetto di cabina",
      "Pulsantiera di ispezione sul tetto di cabina",
      "Chiusura di aperture nel vano",
      "Separazione del percorso del contrappeso",
      "Impermeabilizzazione della fossa",
    ],
  },
  {
    id: "locale-macchina",
    titolo: "Locale macchina e accessi",
    voci: [
      "Illuminazione del locale",
      "Porta e serratura del locale",
      "Aerazione del locale",
      "Protezione di botole e dislivelli",
      "Percorso di accesso al locale",
    ],
  },
  {
    id: "opere-accessorie",
    titolo: "Opere accessorie e pratiche",
    voci: [
      "Opere murarie e di finitura",
      "Smontaggio e smaltimento dei materiali rimossi",
      "Progetto e documentazione tecnica della modifica",
      "Dichiarazioni della ditta a fine lavori",
      "Assistenza alla verifica straordinaria (a cura del proprietario e dell'organismo incaricato)",
      "Aggiornamento del libretto e della targa",
    ],
  },
];

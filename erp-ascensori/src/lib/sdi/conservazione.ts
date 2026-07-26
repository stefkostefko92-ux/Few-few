// Пакетът за предаване към съхранение (conservazione a norma).
//
// ЧЕСТНО ЗА ОБХВАТА, ПЪРВО. Съхранението по норма е УСЛУГА, която се извършва
// от акредитиран доставчик под отговорността на „responsabile della
// conservazione" — с времеви печати, годишни печати за затваряне и одитна
// следа, каквито се произвеждат от него, не от нас. Продуктът НЕ съхранява по
// норма и не твърди, че го прави.
//
// Това, което липсваше, е ПРЕДАВАНЕТО: клиентът трябва да може да изнесе
// изготвените документи в подредена пратка и да я даде на доставчика си. Досега
// това ставаше файл по файл през браузъра.
//
// КАКВО ИМА В ПАКЕТА:
//   • XML-ите такива, каквито са били издадени — байт по байт;
//   • индекс (`indice.json`) с по един ред на документ: номер, дата, получател,
//     данъчен номер, тотал, SHA-256 на файла;
//   • `README.txt` на италиански, който казва какво е това и какво НЕ е.
//
// ОТПЕЧАТЪКЪТ Е СЪЩЕСТВЕНАТА ЧАСТ. Без него пратката е папка с файлове: няма
// как да се докаже, че полученото е изпратеното. С него всяко разминаване се
// открива с една команда — включително след години, от човек, който не познава
// нито нас, нито доставчика.

import { createHash } from "node:crypto";
import { creaZip, nomeVoceSicuro, type VoceZip } from "@/lib/zip";

export interface DocumentoConservazione {
  numero: string;
  data: Date;
  /** Името на файла по правилата на SDI — то е и името в пакета. */
  nomeFile: string;
  xml: string;
  destinatario: string;
  partitaIvaDestinatario: string | null;
  codiceFiscaleDestinatario: string | null;
  /** Тотал в центесими — цяло число, никакъв float. */
  totaleCentesimi: number;
  tipoDocumento: string;
}

export interface VoceIndice {
  nomeFile: string;
  numero: string;
  data: string;
  tipoDocumento: string;
  destinatario: string;
  partitaIva: string | null;
  codiceFiscale: string | null;
  totale: string;
  sha256: string;
}

export interface Indice {
  /** Версия на формата на самия индекс — пакетът се чете след години. */
  formato: "erp-ascensori/conservazione/1";
  generatoIl: string;
  produttore: {
    ragioneSociale: string;
    partitaIva: string | null;
    codiceFiscale: string | null;
  };
  periodo: { dal: string | null; al: string | null };
  documenti: VoceIndice[];
  /** Отпечатък на самия списък — лови и махнат ред, не само сменен файл. */
  sha256Indice?: string;
}

function centesimiToStringa(c: number): string {
  const segno = c < 0 ? "-" : "";
  const a = Math.abs(Math.round(c));
  return `${segno}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export function impronta(dati: Uint8Array | string): string {
  return createHash("sha256")
    .update(typeof dati === "string" ? Buffer.from(dati, "utf8") : dati)
    .digest("hex");
}

const README = `PACCHETTO DI VERSAMENTO — FATTURE ELETTRONICHE

COSA CONTIENE
  • i file XML delle fatture, esattamente come sono stati emessi;
  • indice.json, con una riga per documento e l'impronta SHA-256 di ciascun file;
  • questo file.

COME VERIFICARE L'INTEGRITÀ
  Per ogni documento, l'impronta SHA-256 del file deve coincidere con il campo
  "sha256" della riga corrispondente in indice.json.

      Linux o macOS:  sha256sum fatture/IT01234567890_00001.xml
      Windows:        certutil -hashfile fatture\IT01234567890_00001.xml SHA256

  Un solo byte diverso produce un'impronta completamente diversa.

  L'indice ha una propria impronta, nel campo "sha256Indice": è calcolata sul
  contenuto dell'indice PRIVATO di quel campo. Per verificarla, togliere la
  riga "sha256Indice" dal file, salvare il resto e calcolarne lo SHA-256: se
  coincide, dall'elenco non è stato tolto né aggiunto alcun documento.

CHE COSA QUESTO PACCHETTO NON È
  Questo NON è un sistema di conservazione a norma. La conservazione a norma è
  un servizio svolto da un conservatore, sotto la responsabilità del
  responsabile della conservazione, con marche temporali e pacchetti di
  archiviazione secondo le Linee guida AgID. Questo pacchetto serve a CONSEGNARE
  i documenti al conservatore in forma ordinata e verificabile.

  I file NON sono firmati digitalmente da questo software. La firma, dove
  richiesta, è apposta dal legale rappresentante o dall'intermediario.

  Questo pacchetto non contiene le ricevute dello SdI né i metadati previsti
  dall'Allegato 5 delle Linee guida AgID sul documento informatico: li produce
  il conservatore.

  L'obbligo di conservazione resta in capo al contribuente (art. 39 D.P.R.
  633/1972 e art. 2220 c.c.); le regole tecniche sono quelle del D.M.
  17.06.2014 e delle Linee guida AgID in vigore dal 01.01.2022.
`;

export interface EsitoPacchetto {
  zip: Uint8Array;
  indice: Indice;
  nomeFile: string;
}

/**
 * Сглобява пратката.
 *
 * `quando` идва отвън: пакет, чието съдържание зависи от часовника, не може да
 * бъде проверен с тест за точно съдържание — а точно това е нещото, което
 * трябва да е проверимо.
 */
export function creaPacchetto(
  documenti: DocumentoConservazione[],
  produttore: Indice["produttore"],
  quando: Date,
  periodo: { dal: Date | null; al: Date | null } = { dal: null, al: null },
): EsitoPacchetto {
  const voci: VoceZip[] = [];
  const enc = new TextEncoder();
  const usati = new Set<string>();

  const righe: VoceIndice[] = documenti.map((d) => {
    // Името може да се повтори, ако два документа са с еднакъв прогресив —
    // мълчаливото презаписване в архива би загубило документ.
    let nome = nomeVoceSicuro(d.nomeFile);
    let n = 2;
    while (usati.has(nome)) nome = nomeVoceSicuro(`${n++}_${d.nomeFile}`);
    usati.add(nome);

    const dati = enc.encode(d.xml);
    voci.push({ nome: `fatture/${nome}`, dati });

    return {
      nomeFile: `fatture/${nome}`,
      numero: d.numero,
      data: d.data.toISOString().slice(0, 10),
      tipoDocumento: d.tipoDocumento,
      destinatario: d.destinatario,
      partitaIva: d.partitaIvaDestinatario,
      codiceFiscale: d.codiceFiscaleDestinatario,
      totale: centesimiToStringa(d.totaleCentesimi),
      sha256: impronta(dati),
    };
  });

  const indice: Indice = {
    formato: "erp-ascensori/conservazione/1",
    generatoIl: quando.toISOString(),
    produttore,
    periodo: {
      dal: periodo.dal ? periodo.dal.toISOString().slice(0, 10) : null,
      al: periodo.al ? periodo.al.toISOString().slice(0, 10) : null,
    },
    documenti: righe,
  };

  // Отпечатъкът на индекса се смята върху индекса БЕЗ него самия — иначе е
  // отпечатък на нещо, което го съдържа, тоест безсмислен. Той лови МАХНАТ ред:
  // отпечатъците по файлове не биха забелязали изчезнал документ.
  const senza = JSON.stringify(indice, null, 2);
  indice.sha256Indice = impronta(senza);

  voci.push({
    nome: "indice.json",
    dati: enc.encode(JSON.stringify(indice, null, 2)),
  });
  voci.push({ nome: "README.txt", dati: enc.encode(README) });

  const stampo = quando.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    zip: creaZip(voci, quando),
    indice,
    nomeFile: `conservazione_${stampo}.zip`,
  };
}

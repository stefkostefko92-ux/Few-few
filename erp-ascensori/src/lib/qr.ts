// QR кодове за импиантите — стикерът в машинното помещение.
//
// Техникът стои пред асансьора с телефон в ръка и мазни ръкавици. Всичко, което
// иска, е да види ТОЗИ импиант: историята му, сроковете, отворените ордини.
// Търсенето по матрикола в списък от 400 машини на телефон не е работещ отговор.
//
// Кодът сочи МАТРИКОЛАТА, не UUID-то. Три причини:
//   • матриколата е на табелката — при отлепен стикер човек я въвежда на ръка;
//   • UUID в URL е 36 знака шум, който прави кода по-гъст и по-труден за
//     сканиране върху лепенка с драскотини;
//   • стикерът преживява миграция на базата, а UUID-ите — не непременно.
//
// Изходът е SVG, не PNG: лепенката се печата, а растер на 300 dpi или е огромен,
// или е размазан. SVG е няколко килобайта и е остър на всякаква големина.

import qrcode from "qrcode-generator";

/**
 * Ниво на корекция на грешките.
 *
 * `M` (≈15 %) е компромисът за среда, в която стикерът се цапа и протрива, без
 * кодът да става прекалено гъст. `L` не преживява машинно помещение.
 */
const CORREZIONE = "M" as const;

/** Типът се избира автоматично (0 = най-малкият, който побира данните). */
const TIPO_AUTO = 0;

export interface OpzioniQr {
  /** Размер на модула в потребителски единици. */
  modulo?: number;
  /** Тиха зона в МОДУЛИ. Под 4 много четци не хващат кода. */
  margine?: number;
}

/**
 * QR като SVG път.
 *
 * Един `<path>` вместо хиляда `<rect>`: файлът пада няколко пъти по големина, а
 * принтерите се справят по-добре с една фигура.
 */
export function qrSvg(dati: string, opzioni: OpzioniQr = {}): string {
  if (!dati) throw new Error("QR: dati vuoti");
  const modulo = opzioni.modulo ?? 4;
  const margine = opzioni.margine ?? 4;

  const qr = qrcode(TIPO_AUTO, CORREZIONE);
  qr.addData(dati);
  qr.make();

  const conteggio = qr.getModuleCount();
  const lato = (conteggio + margine * 2) * modulo;

  const parti: string[] = [];
  for (let riga = 0; riga < conteggio; riga++) {
    for (let colonna = 0; colonna < conteggio; colonna++) {
      if (!qr.isDark(riga, colonna)) continue;
      const x = (colonna + margine) * modulo;
      const y = (riga + margine) * modulo;
      parti.push(`M${x} ${y}h${modulo}v${modulo}h-${modulo}z`);
    }
  }

  // `shape-rendering="crispEdges"` пази ръбовете при мащабиране — без него
  // изглаждането размива модулите и четецът се затруднява на дребен печат.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" width="${lato}" height="${lato}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="${lato}" height="${lato}" fill="#fff"/><path d="${parti.join("")}" fill="#000"/></svg>`;
}

/**
 * Адресът, който стикерът носи.
 *
 * АБСОЛЮТЕН, защото телефонът чете кода извън браузър — относителен път няма
 * към какво да се отнесе. Базата идва от конфигурацията, не от заявката:
 * `Host` хедърът се подправя, а сгрешена база значи стикери, водещи към чужд
 * сървър, залепени по четиристотин асансьора.
 */
export function urlImpianto(base: string, matricola: string): string {
  return `${base.replace(/\/+$/, "")}/i/${encodeURIComponent(matricola)}`;
}

/** Публичната база от конфигурацията; при липса — относително (само за dev). */
export function basePubblica(): string {
  return (process.env.APP_URL ?? "").replace(/\/+$/, "");
}

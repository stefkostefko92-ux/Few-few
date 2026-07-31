// Sottopercorso esplicito `/node`: la root `bwip-js` risolve tramite
// `exports` condizionali (browser/electron/react-native/node) che il
// resolver "bundler" di TypeScript non seleziona di default — qui si punta
// dritti alla build Node, l'unica che serve a una API route del server.
import bwipjs from 'bwip-js/node';

/**
 * Generazione di codici a barre e QR — usa `bwip-js` (unica dipendenza
 * ammessa). Il testo dei simboli in SVG di bwip-js è disegnato come percorsi
 * vettoriali del font (non come nodi `<text>` letterali): il rischio XSS via
 * SVG è quindi già ridotto a monte, ma qui si valida comunque in modo severo
 * — sia per bloccare input che il tipo di simbolo non può codificare, sia per
 * limitare la lunghezza (un testo arbitrariamente lungo rallenta il rendering
 * e apre a un DoS banale su una rotta pubblica dell'app).
 */

export class BarcodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BarcodeError';
  }
}

export type TipoBarcode = 'code128' | 'ean13' | 'qr';

const LUNGHEZZA_MASSIMA: Record<TipoBarcode, number> = {
  code128: 48,
  ean13: 13,
  qr: 300,
};

// Code128 può codificare l'intero set ASCII stampabile: qui si resta al
// sottoinsieme che serve per SKU e codici documento — niente caratteri di
// controllo, che sarebbero comunque respinti dal simbolo.
const RE_CODE128 = /^[A-Za-z0-9 \-._/#:]+$/;
const RE_EAN13_INPUT = /^\d{12,13}$/;
// Il payload del QR è sempre un percorso interno dell'app (mai un URL
// assoluto arbitrario): si resta al set che i percorsi Next.js possono
// generare.
const RE_QR_PAYLOAD = /^[A-Za-z0-9/_-]+$/;

/** Calcola la cifra di controllo EAN-13 dati i 12 dati numerici. Funzione pura, testabile senza DB. */
export function ean13CheckDigit(dodici: string): number {
  if (!/^\d{12}$/.test(dodici)) {
    throw new BarcodeError('Servono esattamente 12 cifre per calcolare il controllo EAN-13.');
  }
  let somma = 0;
  for (let i = 0; i < 12; i += 1) {
    const cifra = Number(dodici[i]);
    // Posizioni dispari (1ª, 3ª, ...) peso 1; pari peso 3 — indice 0-based quindi invertito.
    somma += i % 2 === 0 ? cifra : cifra * 3;
  }
  return (10 - (somma % 10)) % 10;
}

/** Vero se `codice` sono 13 cifre con la cifra di controllo EAN-13 corretta. */
export function isValidEan13(codice: string): boolean {
  if (!/^\d{13}$/.test(codice)) return false;
  return ean13CheckDigit(codice.slice(0, 12)) === Number(codice[12]);
}

/** Completa 12 cifre con la cifra di controllo, restituendo un EAN-13 valido. */
export function completeEan13(dodici: string): string {
  return `${dodici}${ean13CheckDigit(dodici)}`;
}

/**
 * Normalizza un input di 12 o 13 cifre in un EAN-13 valido: se sono 12 calcola
 * il controllo, se sono 13 verifica che il controllo sia corretto (altrimenti
 * errore — non si stampa mai un codice che non scannerizza).
 */
function normalizzaEan13(input: string): string {
  if (/^\d{12}$/.test(input)) return completeEan13(input);
  if (/^\d{13}$/.test(input) && isValidEan13(input)) return input;
  throw new BarcodeError('Codice EAN-13 non valido: servono 12 cifre, oppure 13 con cifra di controllo corretta.');
}

function validaInput(testo: string, tipo: TipoBarcode): string {
  if (testo.length < 1 || testo.length > LUNGHEZZA_MASSIMA[tipo]) {
    throw new BarcodeError(`Testo non valido per il codice ${tipo}: lunghezza non ammessa.`);
  }
  if (tipo === 'code128') {
    if (!RE_CODE128.test(testo)) {
      throw new BarcodeError('Testo non valido per Code128: sono ammessi solo lettere, cifre e - . _ / # : spazio.');
    }
    return testo;
  }
  if (tipo === 'ean13') {
    if (!RE_EAN13_INPUT.test(testo)) {
      throw new BarcodeError('Testo non valido per EAN-13: servono 12 o 13 cifre.');
    }
    return normalizzaEan13(testo);
  }
  // qr
  if (!RE_QR_PAYLOAD.test(testo)) {
    throw new BarcodeError('Payload QR non valido: sono ammessi solo percorsi interni (lettere, cifre, / _ -).');
  }
  return testo;
}

const BCID: Record<TipoBarcode, string> = {
  code128: 'code128',
  ean13: 'ean13',
  qr: 'qrcode',
};

/** Genera l'SVG di un Code128 o di un EAN-13, con il testo leggibile sotto le barre. */
export function generaBarcodeSvg(testo: string, tipo: 'code128' | 'ean13'): string {
  const valore = validaInput(testo, tipo);
  return bwipjs.toSVG({
    bcid: BCID[tipo],
    text: valore,
    scale: 2,
    height: 12,
    includetext: true,
    textxalign: 'center',
    textsize: 9,
  });
}

/** Genera l'SVG di un QR code (nessun testo leggibile sotto, il payload è per lo scanner). */
export function generaQrSvg(payload: string): string {
  const valore = validaInput(payload, 'qr');
  return bwipjs.toSVG({
    bcid: BCID.qr,
    text: valore,
    scale: 2,
  });
}

/**
 * Payload QR stabile per aprire la scheda prodotto dallo smartphone:
 * `/prodotti/<id>`. L'id è un cuid Prisma — si valida il formato per non
 * incorporare mai un valore arbitrario nel simbolo stampato.
 */
export function payloadQrProdotto(id: string): string {
  if (!/^[a-z0-9]{20,40}$/i.test(id)) {
    throw new BarcodeError('Identificativo prodotto non valido per il payload QR.');
  }
  return `/prodotti/${id}`;
}

export type SkuBarcode = { tipo: 'code128' | 'ean13'; valore: string };

/**
 * Sceglie il tipo di codice per lo SKU di un prodotto: EAN-13 solo se lo SKU
 * è già un codice commerciale numerico da 12/13 cifre, altrimenti Code128
 * senza alcuna trasformazione (lo SKU alfanumerico interno passa così com'è).
 */
export function skuBarcode(sku: string): SkuBarcode {
  if (RE_EAN13_INPUT.test(sku)) {
    return { tipo: 'ean13', valore: normalizzaEan13(sku) };
  }
  return { tipo: 'code128', valore: sku };
}

/** SVG pronto per lo SKU di un prodotto, scegliendo automaticamente il tipo. */
export function generaSkuBarcodeSvg(sku: string): string {
  const { tipo, valore } = skuBarcode(sku);
  return generaBarcodeSvg(valore, tipo);
}

import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { AttachmentKind } from '@prisma/client';
import type { Permission } from './rbac';

/**
 * Archiviazione degli allegati (disegni, PDF, CAD, foto, istruzioni).
 *
 * Il caricamento di file è la porta d'ingresso più usata contro un gestionale:
 * qui si chiude con quattro chiavi, tutte necessarie.
 *
 *  1. **Elenco chiuso** di estensioni e tipi MIME. Ciò che non è nell'elenco non
 *     entra — nessun `.svg` (script incorporati), nessun `.html`, nessun
 *     eseguibile.
 *  2. **Il nome del file NON diventa mai un percorso.** La chiave di
 *     archiviazione la genera il server (`randomUUID` + estensione verificata):
 *     un nome come `../../etc/passwd` o `..\\web.config` non ha alcun modo di
 *     uscire dalla cartella, perché non viene usato per costruire il percorso.
 *     Il nome originale sopravvive solo come metadato da mostrare.
 *  3. **Tetto di dimensione** applicato ai byte realmente letti, non al valore
 *     dichiarato dal client.
 *  4. **Il download passa dall'applicazione**, mai da `public/`: si controllano i
 *     permessi sul documento collegato e si serve con
 *     `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, così
 *     il browser non esegue nulla nell'origine dell'applicazione.
 */

export const MAX_BYTES_ALLEGATO = 20 * 1024 * 1024; // 20 MB

export class UploadError extends Error {
  constructor(
    readonly status: 400 | 413 | 415 | 500,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

type Regola = {
  /** Tipo servito in download: sempre il nostro, mai quello dichiarato dal client. */
  readonly mime: string;
  /** Tipi accettati in caricamento. `''` = il browser non ha dichiarato nulla. */
  readonly accettati: readonly string[];
  readonly kind: AttachmentKind;
};

/**
 * I formati CAD non hanno un tipo MIME registrato stabile: i browser inviano
 * spesso `application/octet-stream` o stringa vuota. Si accetta solo per quelle
 * estensioni, mai per PDF e immagini (dove il tipo è invece affidabile).
 */
const OCTET = ['application/octet-stream', ''] as const;

const AMMESSI: Record<string, Regola> = {
  pdf: { mime: 'application/pdf', accettati: ['application/pdf'], kind: 'PDF' },
  png: { mime: 'image/png', accettati: ['image/png'], kind: 'FOTO' },
  jpg: { mime: 'image/jpeg', accettati: ['image/jpeg'], kind: 'FOTO' },
  jpeg: { mime: 'image/jpeg', accettati: ['image/jpeg'], kind: 'FOTO' },
  webp: { mime: 'image/webp', accettati: ['image/webp'], kind: 'FOTO' },
  dxf: {
    mime: 'image/vnd.dxf',
    accettati: ['image/vnd.dxf', 'application/dxf', 'image/x-dxf', ...OCTET],
    kind: 'CAD',
  },
  dwg: {
    mime: 'image/vnd.dwg',
    accettati: ['image/vnd.dwg', 'application/acad', 'image/x-dwg', ...OCTET],
    kind: 'CAD',
  },
  step: {
    mime: 'model/step',
    accettati: ['model/step', 'application/step', 'application/x-step', ...OCTET],
    kind: 'CAD',
  },
  stp: {
    mime: 'model/step',
    accettati: ['model/step', 'application/step', 'application/x-step', ...OCTET],
    kind: 'CAD',
  },
  igs: {
    mime: 'model/iges',
    accettati: ['model/iges', 'application/iges', 'text/plain', ...OCTET],
    kind: 'CAD',
  },
};

export const ESTENSIONI_AMMESSE = Object.keys(AMMESSI);

/** Elenco leggibile per l'interfaccia e per i messaggi di errore. */
export const ESTENSIONI_TESTO = ESTENSIONI_AMMESSE.map((e) => `.${e}`).join(', ');

/**
 * Chiave di archiviazione generata dal server: UUID + estensione verificata.
 * Il formato è verificato di nuovo in lettura (difesa in profondità): anche se
 * un giorno una riga del database venisse manomessa, non si potrebbe leggere un
 * file fuori dalla cartella degli allegati.
 */
const CHIAVE_VALIDA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,4}$/;

/** Cartella di archiviazione, verificata. Fallisce chiuso se non è configurata. */
export function cartellaAllegati(): string {
  const configurata = process.env.UPLOAD_DIR;
  if (!configurata || !configurata.trim()) {
    throw new UploadError(
      500,
      'Archivio degli allegati non configurato: contattare l’amministratore.',
    );
  }
  const percorso = resolve(configurata.trim());
  // Dentro `public/` i file sarebbero serviti da Next senza alcun controllo dei
  // permessi: un disegno riservato diventerebbe pubblico a chi indovina il nome.
  if (percorso.split(sep).includes('public')) {
    throw new UploadError(
      500,
      'Archivio degli allegati configurato male: contattare l’amministratore.',
    );
  }
  return percorso;
}

function percorsoDi(storageKey: string): string {
  if (!CHIAVE_VALIDA.test(storageKey)) {
    throw new UploadError(400, 'Riferimento del file non valido.');
  }
  const base = cartellaAllegati();
  const percorso = join(base, storageKey);
  // Ridondante rispetto al controllo sulla chiave, ed è voluto: due controlli
  // indipendenti sullo stesso invariante (il file resta dentro la cartella).
  if (percorso !== resolve(base, storageKey) || !percorso.startsWith(base + sep)) {
    throw new UploadError(400, 'Riferimento del file non valido.');
  }
  return percorso;
}

/** Estensione in minuscolo, solo se compresa nell'elenco chiuso. */
export function estensioneAmmessa(filename: string): string | null {
  const punto = filename.lastIndexOf('.');
  if (punto < 0) return null;
  const ext = filename.slice(punto + 1).toLowerCase();
  return Object.prototype.hasOwnProperty.call(AMMESSI, ext) ? ext : null;
}

export function kindPredefinito(ext: string): AttachmentKind {
  return AMMESSI[ext]?.kind ?? 'ALTRO';
}

export function tipoCanonico(ext: string): string {
  return AMMESSI[ext]?.mime ?? 'application/octet-stream';
}

/**
 * Nome originale ripulito: resta solo un'etichetta da mostrare e da proporre in
 * download. Niente separatori di percorso, niente caratteri di controllo (che in
 * un'intestazione HTTP permetterebbero di iniettare righe).
 */
export function nomeFileSicuro(nome: string): string {
  const pulito = nome
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex -- si tolgono proprio i caratteri di controllo
    .replace(/[\x00-\x1f\x7f"]/g, '')
    .trim();
  const finale = pulito.replace(/^\.+/, '').slice(0, 180);
  return finale || 'allegato';
}

/** Firme dei formati che ne hanno una affidabile. */
function firmaCoerente(ext: string, byte: Uint8Array): boolean {
  const inizia = (...atteso: number[]) =>
    atteso.every((b, i) => byte[i] === b);
  const testo = (atteso: string, da = 0) =>
    new TextDecoder('latin1').decode(byte.slice(da, da + atteso.length)) === atteso;

  switch (ext) {
    case 'pdf':
      return testo('%PDF-');
    case 'png':
      return inizia(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpg':
    case 'jpeg':
      return inizia(0xff, 0xd8, 0xff);
    case 'webp':
      return testo('RIFF') && testo('WEBP', 8);
    case 'step':
    case 'stp':
      return testo('ISO-10303-21');
    case 'dwg':
      return testo('AC');
    default:
      // DXF e IGES non hanno una firma stabile (ASCII, binario, con o senza
      // intestazione): li proteggono l'elenco chiuso e il download forzato.
      return true;
  }
}

export type AllegatoSalvato = {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
};

/**
 * Scrive il file e restituisce i metadati da registrare. Il chiamante deve
 * cancellare il file (`eliminaAllegato`) se la scrittura a database fallisce,
 * altrimenti resta un file orfano sul disco.
 */
export async function salvaAllegato(file: File): Promise<AllegatoSalvato> {
  const nome = nomeFileSicuro(file.name || '');
  const ext = estensioneAmmessa(nome);
  if (!ext) {
    throw new UploadError(
      415,
      `Formato non ammesso. Sono accettati: ${ESTENSIONI_TESTO}.`,
    );
  }
  const regola = AMMESSI[ext];
  const dichiarato = (file.type || '').toLowerCase().split(';')[0].trim();
  if (!regola.accettati.includes(dichiarato)) {
    throw new UploadError(
      415,
      `Il tipo di file dichiarato non corrisponde all’estensione .${ext}.`,
    );
  }
  // Il `size` dichiarato serve solo a rifiutare presto: la misura che conta è
  // quella dei byte effettivamente letti, poco sotto.
  if (file.size > MAX_BYTES_ALLEGATO) {
    throw new UploadError(
      413,
      `File troppo grande: il limite è ${Math.floor(MAX_BYTES_ALLEGATO / (1024 * 1024))} MB.`,
    );
  }

  const byte = new Uint8Array(await file.arrayBuffer());
  if (byte.byteLength === 0) {
    throw new UploadError(400, 'Il file è vuoto.');
  }
  if (byte.byteLength > MAX_BYTES_ALLEGATO) {
    throw new UploadError(
      413,
      `File troppo grande: il limite è ${Math.floor(MAX_BYTES_ALLEGATO / (1024 * 1024))} MB.`,
    );
  }
  if (!firmaCoerente(ext, byte)) {
    throw new UploadError(
      415,
      `Il contenuto del file non corrisponde a un .${ext} valido.`,
    );
  }

  const storageKey = `${randomUUID()}.${ext}`;
  const base = cartellaAllegati();
  await mkdir(base, { recursive: true });
  // `wx`: mai sovrascrivere un file esistente, nemmeno per collisione improbabile.
  await writeFile(percorsoDi(storageKey), byte, { flag: 'wx', mode: 0o640 });

  return {
    storageKey,
    filename: nome,
    mimeType: regola.mime,
    sizeBytes: byte.byteLength,
    kind: regola.kind,
  };
}

export async function leggiAllegato(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(percorsoDi(storageKey));
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError(500, 'File non più disponibile nell’archivio.');
  }
}

/** La cancellazione del file non deve far fallire quella della riga a database. */
export async function eliminaAllegato(storageKey: string): Promise<void> {
  try {
    await unlink(percorsoDi(storageKey));
  } catch (err) {
    console.error('[staffe] rimozione allegato non riuscita:', err);
  }
}

/**
 * Intestazioni del download. Il file esce SEMPRE come allegato e con `nosniff`:
 * anche se qualcosa fosse sfuggito ai controlli in ingresso, il browser non lo
 * interpreterebbe come pagina nell'origine dell'applicazione.
 */
export function intestazioniDownload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Record<string, string> {
  const sicuro = nomeFileSicuro(filename);
  // `filename` ASCII per i client vecchi, `filename*` per gli accenti italiani.
  const ascii = sicuro.replace(/[^\x20-\x7e]/g, '_');
  return {
    'Content-Type': mimeType,
    'Content-Length': String(sizeBytes),
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(sicuro)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
}

// ─────────────────────── Permessi in base al documento ───────────────────────

export type RiferimentoAllegato = {
  productId?: string | null;
  purchaseOrderId?: string | null;
  salesOrderId?: string | null;
  goodsReceiptId?: string | null;
};

/**
 * L'allegato eredita i permessi del documento a cui è appeso: chi non può
 * leggere l'ordine non ne scarica gli allegati, chi non può modificarlo non ne
 * carica né cancella.
 */
export function permessiAllegato(rif: RiferimentoAllegato): {
  leggi: Permission;
  scrivi: Permission;
} {
  if (rif.productId) return { leggi: 'prodotti:leggi', scrivi: 'prodotti:scrivi' };
  if (rif.purchaseOrderId) return { leggi: 'acquisti:leggi', scrivi: 'acquisti:scrivi' };
  if (rif.salesOrderId) return { leggi: 'vendite:leggi', scrivi: 'vendite:scrivi' };
  if (rif.goodsReceiptId) return { leggi: 'acquisti:leggi', scrivi: 'ricevimenti:scrivi' };
  // Allegato senza documento: non esiste per costruzione (lo schema di
  // validazione ne impone esattamente uno). Se accadesse, si chiude tutto.
  return { leggi: 'utenti:gestisci', scrivi: 'utenti:gestisci' };
}

import sharp from 'sharp';
import { immagineModello, type ModelloCartello, type ModelloId } from './modelli.js';

/**
 * Голият шаблон (изчистен, без главата на фирмата), 480 px широк, WebP — картинката на табелата само
 * там, където pdftoppm липсва (машина за разработка, cartelli/vista.ts). Прави се веднъж за процеса.
 */
const LARGHEZZA = 480;

const cache = new Map<ModelloId, Promise<Buffer>>();

export function anteprimaModello(modello: ModelloCartello): Promise<Buffer> {
  const id = modello.id as ModelloId;
  let pronta = cache.get(id);
  if (!pronta) {
    pronta = immagineModello(modello).then((jpeg) =>
      sharp(jpeg).resize({ width: LARGHEZZA }).webp({ quality: 78 }).toBuffer(),
    );
    cache.set(id, pronta);
    pronta.catch(() => cache.delete(id));
  }
  return pronta;
}

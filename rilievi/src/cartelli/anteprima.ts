import sharp from 'sharp';
import { immagineModello, type ModelloCartello, type ModelloId } from './modelli.js';

/**
 * Умалената картинка на шаблона за избора в настройките: изчистеният шаблон (без примерните данни), 480 px
 * широк, WebP. Прави се веднъж за процеса.
 */
export const LARGHEZZA_ANTEPRIMA = 480;

const cache = new Map<ModelloId, Promise<Buffer>>();

export function anteprimaModello(modello: ModelloCartello): Promise<Buffer> {
  const id = modello.id as ModelloId;
  let pronta = cache.get(id);
  if (!pronta) {
    pronta = immagineModello(modello).then((jpeg) =>
      sharp(jpeg).resize({ width: LARGHEZZA_ANTEPRIMA }).webp({ quality: 78 }).toBuffer(),
    );
    cache.set(id, pronta);
    pronta.catch(() => cache.delete(id));
  }
  return pronta;
}

/** Височината на умалената картинка (за width/height в страницата — без прескачане при зареждане). */
export const altezzaAnteprima = (modello: ModelloCartello): number =>
  Math.round((modello.altezza * LARGHEZZA_ANTEPRIMA) / modello.larghezza);

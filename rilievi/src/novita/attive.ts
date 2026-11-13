import { fornitoriConfigurati } from '../auth/oidc.js';
import { VOCI, type VoceNovita } from './voci.js';

/**
 * Новините, които важат за ТОЗИ портал (одитът от 12 ноември 2026 — Правният Разбирач: публично се обявяваше вход
 * с Microsoft/Google, който не е включен; Дир. 2006/114): новина с условие (`se`) излиза само когато нещото е
 * включено на сървъра. Включи ли се по-късно, новината се записва тогава и прозорецът я показва като нова.
 */
export function vociAttive(): readonly VoceNovita[] {
  const esterno = fornitoriConfigurati().length > 0;
  return VOCI.filter((v) => v.se !== 'accessoEsterno' || esterno);
}

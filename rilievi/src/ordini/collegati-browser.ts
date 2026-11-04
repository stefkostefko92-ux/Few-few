import type { Translator } from '../i18n.js';
import { fieldByKey } from '../schede/fields.js';
import { COLLEGAMENTI, confrontato, type MembroNumero, type MembroScelta } from './collegamenti.js';
import { SLOTS } from './registry.js';

/** Кой пише картата — за полетата на модулите с фирмата и човека (public/js/moduli.js). */
export interface ContestoBrowser {
  azienda: string;
  utente: string;
  ruolo: string;
  email: string;
}

/**
 * Полето на картата за браузъра: видът и границите му — стойност от модул влиза в него само ако пасва
 * („480 kg“ → 480 в товара; „1,6“ не е брой спирки).
 */
function campoScheda(key: string) {
  const field = fieldByKey(key);
  if (!field) return {};
  return {
    kind: field.kind,
    ...('min' in field ? { min: field.min, max: field.max } : {}),
    ...('maxLength' in field ? { maxLength: field.maxLength } : {}),
  };
}

/**
 * Връзките за браузъра (public/js/collegati.js и moduli.js) — с имената им и на местата, без нищо от
 * данните на картата. `colonne`: модулите на една колона (таблото — Pelazza и MoviLift) си дават
 * стойностите при смяна на марката. `contesto`: фирмата и човекът, които пишат.
 */
export function collegatiPerBrowser(t: Translator, contesto: ContestoBrowser): string {
  const membri = (list: readonly (MembroNumero | MembroScelta)[]) =>
    list.map((m) => (m.luogo === 'scheda' ? { ...m, ...campoScheda(m.campo) } : m));
  const data = {
    colonne: Object.fromEntries(SLOTS.map((slot) => [slot.prefix, slot.column])),
    luoghi: Object.fromEntries(
      (['scheda', ...SLOTS.map((slot) => slot.prefix)] as const).map((luogo) => [
        luogo,
        t(`collegati.luogo.${luogo}`),
      ]),
    ),
    gruppi: COLLEGAMENTI.map((link) => ({
      ...link,
      nome: t(`collegati.${link.key}`),
      confronto: confrontato(link),
      membri: membri(link.membri),
    })),
    contesto,
  };
  // В <script type="application/json">: „<“ не бива да затвори елемента.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Страниците за приемане в портала: условията и правилата, подписът с код, копието на администратора. */
import { CONDIZIONI_PATH } from '../seo/paths.js';
import { versioneDaFirmare, VERSIONE } from './versioni.js';

export { CONDIZIONI_PATH };
export const ACCETTA_PATH = '/condizioni/accetta';
export const FIRMA_PATH = '/condizioni/firma';
export const COPIA_PATH = '/condizioni/copia';

/**
 * Къде се чете текстът, който се подписва: действащият — на `/condizioni`; версия, която влиза сама след дни
 * (`versioneDaFirmare`) — на `/condizioni/prossima` (същата страница, с това, което се сменя).
 */
export const percorsoDaFirmare = (): string =>
  versioneDaFirmare('CONDIZIONI') === VERSIONE.CONDIZIONI
    ? CONDIZIONI_PATH
    : `${CONDIZIONI_PATH}/prossima`;

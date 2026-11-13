import { errorMessage, logger } from './logger.js';

/**
 * Стъпките на часовата поддръжка, всяка сама за себе си (одитът от 12 ноември 2026): преди бяха една верига от
 * `await` — първата паднала (фирма, която не се трие; Revolut, който не отговаря) спираше всички след нея, всеки
 * час, с един ред в лога. Последното пускане стои в паметта на процеса за „Salute del sistema“ (master/sistema.ts).
 */

export type Passo = readonly [nome: string, esegui: () => Promise<number>];

export interface EsitoPassi {
  at: Date;
  /** Имената на падналите стъпки. */
  falliti: string[];
  /** Колко е направила всяка минала стъпка. */
  conteggi: Record<string, number>;
}

export async function eseguiPassi(
  passi: readonly Passo[],
  at: Date = new Date(),
): Promise<EsitoPassi> {
  const esito: EsitoPassi = { at, falliti: [], conteggi: {} };
  for (const [nome, esegui] of passi) {
    try {
      esito.conteggi[nome] = await esegui();
    } catch (error) {
      esito.falliti.push(nome);
      logger.error(
        { evento: 'manutenzione.passo', passo: nome, err: errorMessage(error) },
        'поддръжката: стъпката се провали',
      );
    }
  }
  return esito;
}

let ultima: EsitoPassi | null = null;
export const ricordaManutenzione = (esito: EsitoPassi): void => {
  ultima = esito;
};
export const ultimaManutenzione = (): EsitoPassi | null => ultima;

/** Колко без пускане е твърде дълго: поддръжката е на час. */
const TROPPO_MS = 2 * 60 * 60_000;

/** Светлината в конзолата: паднала стъпка или никакво пускане от два часа — червено. */
export function esitoManutenzione(
  ultimo: EsitoPassi | null,
  now: Date,
  accesoDaMs: number,
): 'ok' | 'errore' {
  if (!ultimo) return accesoDaMs > TROPPO_MS ? 'errore' : 'ok';
  if (ultimo.falliti.length > 0) return 'errore';
  return now.getTime() - ultimo.at.getTime() > TROPPO_MS ? 'errore' : 'ok';
}

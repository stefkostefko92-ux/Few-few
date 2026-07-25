// Защита от груба сила: 5 поредни неуспешни входа → 15 минути блокада.
// Чиста логика — решенията се тестват без база.

export const MAX_TENTATIVI = 5;
export const BLOCCO_MINUTI = 15;

export interface StatoAccesso {
  tentativi: number;
  bloccatoFino: Date | null;
}

export interface EsitoTentativo {
  bloccato: boolean;
  /** оставащи опити преди блокада (само при неуспех, не блокиран) */
  tentativiRimasti?: number;
  /** нова стойност за tentativi */
  tentativi: number;
  /** нова стойност за bloccatoFino */
  bloccatoFino: Date | null;
}

/** Вярно, ако акаунтът е под активна блокада в момента `ora`. */
export function eBloccato(stato: StatoAccesso, ora: Date): boolean {
  return stato.bloccatoFino !== null && stato.bloccatoFino.getTime() > ora.getTime();
}

/** Регистрира неуспешен опит и решава дали се стига до блокада. */
export function registraFallimento(stato: StatoAccesso, ora: Date): EsitoTentativo {
  const tentativi = stato.tentativi + 1;
  if (tentativi >= MAX_TENTATIVI) {
    return {
      bloccato: true,
      tentativi,
      bloccatoFino: new Date(ora.getTime() + BLOCCO_MINUTI * 60_000),
    };
  }
  return {
    bloccato: false,
    tentativiRimasti: MAX_TENTATIVI - tentativi,
    tentativi,
    bloccatoFino: null,
  };
}

/** Успешен вход — броячът се нулира. */
export function registraSuccesso(): Pick<EsitoTentativo, "tentativi" | "bloccatoFino"> {
  return { tentativi: 0, bloccatoFino: null };
}

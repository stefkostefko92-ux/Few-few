// Политика за паролите — чиста логика, тествана без база.
//
// Правилата следват NIST SP 800-63B, а не навика от двехилядните: дължината
// носи силата, а принудителната смяна на всеки 90 дни води до „Parola1!",
// „Parola2!", „Parola3!". Затова тук няма изискване за специални знаци и
// срокът е дълъг — но има проверка срещу очевидното.

/** Минимум за обикновен потребител. */
export const LUNGHEZZA_MINIMA = 12;
/** Минимум за ADMIN и MASTER — те могат всичко. */
export const LUNGHEZZA_MINIMA_PRIVILEGIATA = 14;

/**
 * Срок на паролата в дни. Дълъг нарочно: NIST не препоръчва периодична смяна
 * без причина. Стойността е за клиенти, чиято вътрешна политика я изисква.
 */
export const GIORNI_SCADENZA = 365;

/** Най-често използваните и очевидните за този домейн. */
const PROIBITE = new Set([
  "password",
  "password1",
  "passw0rd",
  "123456",
  "12345678",
  "123456789",
  "qwerty",
  "abc123",
  "iloveyou",
  "admin",
  "amministratore",
  "ascensore",
  "ascensori",
  "erpascensori",
  "manutenzione",
  "benvenuto",
  "cambiami",
]);

export interface EsitoPassword {
  valida: boolean;
  /** Италианско съобщение за потребителя. */
  errore?: string;
}

export function validaPassword(
  password: string,
  opzioni: { privilegiata?: boolean; email?: string; nome?: string; cognome?: string } = {},
): EsitoPassword {
  const minima = opzioni.privilegiata ? LUNGHEZZA_MINIMA_PRIVILEGIATA : LUNGHEZZA_MINIMA;
  if (password.length < minima)
    return { valida: false, errore: `La password deve avere almeno ${minima} caratteri` };
  // Горна граница срещу претоварване: bcrypt и без това реже на 72 байта.
  if (password.length > 200)
    return { valida: false, errore: "La password non può superare i 200 caratteri" };

  const basso = password.toLowerCase();
  if (PROIBITE.has(basso))
    return { valida: false, errore: "Password troppo comune: sceglierne un'altra" };

  // Един и същи знак повторен цялата дължина („aaaaaaaaaaaa") минава проверката
  // за дължина, но не носи никаква ентропия.
  if (new Set(password).size < 5)
    return { valida: false, errore: "Password troppo ripetitiva: variare i caratteri" };

  // Част от собствените данни в паролата е първото, което се пробва.
  const parti = [opzioni.email?.split("@")[0], opzioni.nome, opzioni.cognome]
    .filter((x): x is string => !!x && x.length >= 4)
    .map((x) => x.toLowerCase());
  if (parti.some((p) => basso.includes(p)))
    return {
      valida: false,
      errore: "La password non può contenere il nome o l'indirizzo e-mail",
    };

  return { valida: true };
}

/** Изтекла ли е паролата. `null` = никога не е сменяна → иска смяна. */
export function passwordScaduta(cambiataAt: Date | null | undefined, oggi = new Date()): boolean {
  if (!cambiataAt) return false; // сийднат акаунт: не блокираме първия вход
  const scadenza = new Date(cambiataAt.getTime() + GIORNI_SCADENZA * 86_400_000);
  return oggi > scadenza;
}

/** Ролите, за които вторият фактор е задължителен, а не по избор. */
export const RUOLI_MFA_OBBLIGATORIO = ["MASTER", "ADMIN"] as const;

export function mfaObbligatorio(ruolo: string): boolean {
  return (RUOLI_MFA_OBBLIGATORIO as readonly string[]).includes(ruolo);
}

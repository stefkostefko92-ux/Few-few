// Демо стенд: публични демо акаунти, вход с едно натискане, без втори фактор.
// Чисто — без база.
//
// ВКЛЮЧВА СЕ САМО ОТ СЪРВЪРА (`DEMO=1` в .env), никога по подразбиране и
// никога при клиент: демо акаунтите имат ПУБЛИЧНА парола (README, сийдът, тази
// страница за вход). Включен режим значи три неща:
//
//   1. Страницата за вход показва акаунтите — хората разглеждат, без да питат.
//   2. Вторият фактор не се налага (общ акаунт не може да носи личен TOTP).
//   3. Демо акаунтите са ЗАМРАЗЕНИ: парола, втори фактор, имейл, ниво, спиране
//      и изтриване се отказват. Иначе първият посетител, сменил паролата на
//      „direzione", заключва всички останали — тоест демото пада от един клик.
//      По същата причина неуспешните опити не ги блокират: паролата е публична,
//      а блокадата би била бутон „спри демото за 15 минути" за всеки.

/** Паролата на демо акаунтите — същата като в сийда и в README-то. */
export const PASSWORD_DEMO = "Ascensori!2026";

export interface AccountDemo {
  email: string;
  /** Италианско име на нивото, както е в менюто. */
  livello: string;
  /** Какво се вижда с този акаунт — за избора на страницата за вход. */
  descrizione: string;
}

/** Акаунтите, които сийдът създава, от най-показния към най-ограничения. */
export const ACCOUNT_DEMO: readonly AccountDemo[] = [
  {
    email: "direzione@erp-ascensori.local",
    livello: "Direzione",
    descrizione: "Tutto il gestionale, fatture e redditività comprese",
  },
  {
    email: "master@erp-ascensori.local",
    livello: "Master",
    descrizione: "Anche utenti, registro operazioni e amministrazione",
  },
  {
    email: "responsabile@erp-ascensori.local",
    livello: "Responsabile",
    descrizione: "Impianti, contratti, ordini e magazzino",
  },
  {
    email: "tecnico@erp-ascensori.local",
    livello: "Tecnico",
    descrizione: "Ordini di lavoro e rapportini sul campo",
  },
  {
    email: "operatore@erp-ascensori.local",
    livello: "Operatore",
    descrizione: "Anagrafiche e inserimento dati",
  },
  {
    email: "cliente@erp-ascensori.local",
    livello: "Cliente",
    descrizione: "Area cliente di un amministratore di condomìni",
  },
  {
    email: "admin@erp-ascensori.local",
    livello: "Amministratore di sistema",
    descrizione: "Utenti e impostazioni dell'azienda",
  },
];

type Env = Record<string, string | undefined>;

/** Демо режимът — само изричното `DEMO=1`. */
export function demoAttiva(env: Env = process.env): boolean {
  return env.DEMO === "1";
}

/** Демо акаунт ли е (без значение от регистъра и интервалите). */
export function eAccountDemo(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ACCOUNT_DEMO.some((a) => a.email === e);
}

/**
 * Замразен ли е акаунтът срещу промени по сигурността. `true` само в демо
 * режим и само за демо акаунт — истинските акаунти на стенда се държат
 * нормално.
 */
export function accountBloccatoDemo(
  email: string | null | undefined,
  env: Env = process.env,
): boolean {
  return demoAttiva(env) && eAccountDemo(email);
}

export const MESSAGGIO_DEMO =
  "Funzione disattivata nella demo: gli account dimostrativi sono condivisi da tutti i visitatori.";

// Политика за срок на съхранение — ЧИСТА логика, без база, за да е тестваема
// и за да стои правното решение на едно четимо място.
//
// GDPR чл. 5(1)(д) („ограничение на съхранението") изисква личните данни да не се
// пазят по-дълго от необходимото. Одитът обаче носи и ЗАДЪЛЖИТЕЛНО съхранение по
// италианското право. Двете не са в конфликт — просто различните редове имат
// различни срокове, и точно това кодира този модул.
//
// Правни основания (проверявани при промяна, не приемани наизуст):
//   • чл. 2220 Codice Civile + чл. 22 D.P.R. 600/1973 — счетоводните записи и
//     подкрепящите ги следи се пазят ДЕСЕТ години.
//   • Provv. Garante 27/11/2008 („amministratori di sistema", потвърдено с
//     Provv. 467/2018) — записите за ДОСТЪП се пазят не по-малко от ШЕСТ месеца;
//     „не по-малко" не значи „безсрочно" — след това отпада основанието.
//   • Оперативната телеметрия (пускания на автоматизми) не е лична данна и се
//     пази толкова, колкото е полезна за диагностика — 90 дни.
//
// ВАЖНО: това не е правен съвет. Сроковете се сверяват с адвоката на клиента,
// преди инсталацията да мине в продукция.

/** Действия, които представляват ДОСТЪП до системата (по-кратък срок). */
export const AZIONI_ACCESSO = ["LOGIN", "LOGOUT"] as const;

/** Месеци за записите за достъп (мин. 6 по Provv. Garante). */
export const MESI_ACCESSO = 6;

/** Години за счетоводно относимите следи (чл. 2220 c.c.). */
export const ANNI_CONTABILE = 10;

/** Дни за оперативната телеметрия на автоматизмите. */
export const GIORNI_TELEMETRIA = 90;

export interface Soglie {
  /** редове за достъп по-стари от това се трият */
  accesso: Date;
  /** останалите одит редове по-стари от това се трият */
  contabile: Date;
  /** пускания на автоматизми по-стари от това се трият */
  telemetria: Date;
}

function meno(base: Date, { anni = 0, mesi = 0, giorni = 0 }): Date {
  const d = new Date(base.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - anni);
  d.setUTCMonth(d.getUTCMonth() - mesi);
  d.setUTCDate(d.getUTCDate() - giorni);
  return d;
}

/** Праговите дати за дадена „днешна" дата. */
export function soglie(oggi: Date): Soglie {
  return {
    accesso: meno(oggi, { mesi: MESI_ACCESSO }),
    contabile: meno(oggi, { anni: ANNI_CONTABILE }),
    telemetria: meno(oggi, { giorni: GIORNI_TELEMETRIA }),
  };
}

/**
 * Изтрива ли се даден одит ред на дадена дата.
 *
 * Изнесено като предикат, защото е решението с правна тежест: сгрешено в едната
 * посока трие доказателства, в другата — държи лични данни без основание.
 */
export function daEliminare(
  riga: { azione: string; createdAt: Date },
  oggi: Date,
): boolean {
  const s = soglie(oggi);
  const eAccesso = (AZIONI_ACCESSO as readonly string[]).includes(riga.azione);
  return riga.createdAt < (eAccesso ? s.accesso : s.contabile);
}

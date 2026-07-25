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
//     подкрепящите ги следи се пазят ДЕСЕТ години. Обхватът им са счетоводните
//     книги и фактурите — НЕ всяка операция в системата.
//   • Provv. Garante 27 ноември 2008 („amministratori di sistema"), в сила по
//     силата на чл. 22, ал. 4 D.Lgs. 101/2018 — записите за ДОСТЪП се пазят не
//     по-малко от ШЕСТ месеца; „не по-малко" не значи „безсрочно".
//     (Provv. 467/2018 е списъкът на обработките, изискващи DPIA — различен акт;
//     по-ранната препратка тук беше сгрешена.)
//   • Останалите операции — 24 месеца по чл. 5(1)(д) GDPR. Одитен ред „UPDATE
//     dipendente" не е счетоводен запис и няма основание за десет години.
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

/** Месеци за всичко останало (чл. 5(1)(д) GDPR — ограничение на съхранението). */
export const MESI_ORDINARIO = 24;

/**
 * Ентитетите, чиито следи са счетоводно относими → дългият срок.
 *
 * БЯЛ списък нарочно. Обратното („всичко освен входовете е счетоводно") дава на
 * всяко ново действие десетгодишен срок по подразбиране. За фиска това е
 * безопасната посока, но за защитата на данните е точно обратната — и то върху
 * следите за поведението на служители. При съмнение → краткият срок.
 */
export const ENTITA_CONTABILI = [
  "fatture",
  "ddt",
  "preventivi",
  "ordini_lavoro",
  "movimenti_magazzino",
  "articoli_magazzino",
] as const;

/** Дни за оперативната телеметрия на автоматизмите. */
export const GIORNI_TELEMETRIA = 90;

export interface Soglie {
  /** редове за достъп по-стари от това се трият */
  accesso: Date;
  /** счетоводно относимите редове по-стари от това се трият */
  contabile: Date;
  /** всички останали редове по-стари от това се трият */
  ordinario: Date;
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
    ordinario: meno(oggi, { mesi: MESI_ORDINARIO }),
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
  riga: { azione: string; entita?: string; createdAt: Date },
  oggi: Date,
): boolean {
  return riga.createdAt < sogliaPerRiga(riga, oggi);
}

/** Прагът, който важи за конкретния ред. */
export function sogliaPerRiga(
  riga: { azione: string; entita?: string },
  oggi: Date,
): Date {
  const s = soglie(oggi);
  if ((AZIONI_ACCESSO as readonly string[]).includes(riga.azione)) return s.accesso;
  if (riga.entita && (ENTITA_CONTABILI as readonly string[]).includes(riga.entita))
    return s.contabile;
  return s.ordinario;
}

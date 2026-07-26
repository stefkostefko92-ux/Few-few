// Row-Level Security: изолацията по фирма СЛИЗА под приложението.
//
// Приложният филтър (`filtroTenant`) остава първата линия — той е по-бърз и
// дава по-добри съобщения. RLS е втората: код, който утре забрави филтъра,
// вече не вижда чужди редове, защото самият Postgres не му ги дава.
//
// Механиката: заявката задава `app.tenant_id` за своята ТРАНЗАКЦИЯ, а
// политиките сравняват с него. `SET LOCAL` е задължителен — обикновеното `SET`
// би останало върху връзката и следващият потребител, взел я от пула, би
// наследил чужд обхват.
//
// ЧЕСТНО ЗА ОБХВАТА. Prisma не връзва връзка за цялата заявка на приложението,
// затова стойността не може да се зададе „веднъж на HTTP заявка" — само в
// транзакция. Затова политиките са ПРОПУСКЛИВИ, когато обхват изобщо не е
// зададен: иначе всяка заявка извън `conRls` би връщала нула редове и
// приложението просто не би работило. Тоест RLS тук пази пътищата, които
// заявяват обхват (`conRls`), а не замества приложния филтър.

import { prisma } from "@/lib/prisma";
import type { Sessione } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

/** Таблиците с `tenantId`, върху които важат политиките. */
export const TABELLE_CON_TENANT = [
  "dati_azienda",
  "users",
  "audit_log",
  "impianti",
  "impianti_media",
  "allegati",
  "verifiche_impianti",
  "scadenze_impianti",
  "assegnazioni_tecnici",
  "condomini",
  "amministratori",
  "dipendenti",
  "automezzi",
  "cottimisti",
  "squadre",
  "articoli_magazzino",
  "movimenti_magazzino",
  "preventivi",
  "contratti",
  "ordini_lavoro",
  "rapportini",
  "fatture",
  "pagamenti",
  "notifiche_sdi",
  "contatori_sdi",
  "ddt",
  "documenti",
  "api_keys",
  "webhooks",
  "webhook_consegne",
] as const;

/** Обхватът на доставчика: вижда всички фирми. */
export const OBHVAT_TUTTI = "*";
/** Обхватът на еднофирмената инсталация (`tenantId IS NULL`). */
export const OBHVAT_NULLO = "-";

/**
 * Стойността на `app.tenant_id` за дадена сесия.
 *
 * MASTER е нивото на доставчика — за него се задава `*`. Това е СЪЗНАТЕЛНА
 * вратичка, без която поддръжката на клиент е невъзможна; и точно затова
 * действията на MASTER си остават в одита като всички останали.
 */
export function obhvatRls(s: Sessione): string {
  if (s.ruolo === "MASTER") return OBHVAT_TUTTI;
  return s.tenantId ?? OBHVAT_NULLO;
}

/** Изпълнява `fn` в транзакция с наложен обхват по фирма. */
export async function conRls<T>(
  s: Sessione,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Параметризирано: стойността идва от подписан токен, но правилото „никога
    // конкатенация в SQL" не се нарушава заради това.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${obhvatRls(s)}, true)`;
    return fn(tx);
  });
}

/**
 * Ролята на приложението не бива да е суперпотребител.
 *
 * Суперпотребителят (както и `BYPASSRLS`) заобикаля политиките БЕЗУСЛОВНО —
 * дори при `FORCE ROW LEVEL SECURITY`. Тоест целият слой би бил украса, без
 * нищо в лога да го подскаже. Затова проверката е явна и се вижда в здравния
 * маршрут.
 */
export async function rlsAttiva(): Promise<{
  attiva: boolean;
  motivo?: string;
}> {
  const [r] = await prisma.$queryRaw<
    { super: boolean; bypass: boolean; policy: bigint }[]
  >`
    SELECT
      r.rolsuper       AS "super",
      r.rolbypassrls   AS "bypass",
      (SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_isolation') AS "policy"
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;
  if (!r) return { attiva: false, motivo: "ruolo applicativo non trovato" };
  if (Number(r.policy) === 0)
    return { attiva: false, motivo: "policy tenant_isolation assente" };
  if (r.super)
    return { attiva: false, motivo: "il ruolo applicativo è superuser" };
  if (r.bypass)
    return { attiva: false, motivo: "il ruolo applicativo ha BYPASSRLS" };
  return { attiva: true };
}

/** SQL-ът, който включва политиките. Ползва се и от миграцията, и от теста. */
export function sqlAbilitaRls(): string {
  const parti: string[] = [];
  for (const t of TABELLE_CON_TENANT) {
    parti.push(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    parti.push(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY;`);
    parti.push(`DROP POLICY IF EXISTS tenant_isolation ON "${t}";`);
    // Три неща в едно условие:
    //
    //  • празно/незададено ('') — обхват не е поискан, политиката пропуска;
    //    приложният филтър остава единствената линия (виж бележката горе);
    //  • '*' — нивото на доставчика;
    //  • иначе се сравнява с `tenantId`, като '-' означава NULL обхват.
    //
    // `IS NOT DISTINCT FROM` вместо `=`: NULL = NULL е NULL в SQL, а точно
    // NULL е обхватът на еднофирмената инсталация — с обикновено равенство
    // политиката би скрила всичко при най-честия случай.
    //
    // `::text` е задължително: колоната е `uuid`, а `current_setting` връща
    // текст — без изричното привеждане Postgres отказва („operator does not
    // exist: uuid = text"). Обратната посока би гърмяла при невалидна стойност.
    const conditione = `(
    coalesce(current_setting('app.tenant_id', true), '') IN ('', '${OBHVAT_TUTTI}')
    OR "tenantId"::text IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id', true), '${OBHVAT_NULLO}')
  )`;
    parti.push(
      `CREATE POLICY tenant_isolation ON "${t}"\n  USING ${conditione}\n  WITH CHECK ${conditione};`,
    );
  }
  return parti.join("\n");
}

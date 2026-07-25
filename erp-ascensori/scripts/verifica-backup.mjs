#!/usr/bin/env node
// Проверка на бекъпа чрез РЕАЛНО възстановяване.
//
//   node scripts/verifica-backup.mjs /percorso/erp-20260725.dump[.age]
//
// Защо съществува: „pg_dump мина без грешка" не е доказателство. Доказателство е
// възстановен дъмп, в който таблиците имат редове И одитът се проверява като
// цял. Всичко останало е надежда.
//
// Проверката тече в ОТДЕЛНА база с временно име и я трие накрая — никога не
// пипа работната. Излиза с код 1, ако нещо не се получи, за да върши работа в
// cron и в мониторинга.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dump = process.argv[2];
if (!dump) {
  console.error("Uso: node scripts/verifica-backup.mjs <file.dump[.age]>");
  process.exit(2);
}
if (!existsSync(dump)) {
  console.error(`✖ Файлът не съществува: ${dump}`);
  process.exit(1);
}

const ADMIN_URL = process.env.BACKUP_PG_ADMIN_URL ?? "postgresql://erp:erp@127.0.0.1:5433/postgres";
// Името носи времева отметка, за да не се сблъскат две едновременни проверки.
const DB = `erp_verifica_${Date.now().toString(36)}`;
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

/** Минималният брой редове, под който „възстановено" значи „празно". */
const ATTESI_MINIMI = {
  users: 1,
  impianti: 0,
  audit_log: 1,
};

/**
 * Живата база — за сверяване РЕД ПО РЕД срещу възстановеното.
 *
 * Това е същинската проверка, откакто има RLS: `pg_dump` върху таблица с
 * политика може да излезе успешно и пак да е ЧАСТИЧЕН, ако ролята вижда само
 * част от редовете. Тогава „бекъпът мина" е най-опасното изречение в системата.
 * Задай `BACKUP_SORGENTE_URL`, за да се включи сравнението.
 */
const SORGENTE_URL = process.env.BACKUP_SORGENTE_URL ?? null;

/** Обхватът на доставчика — с него източникът се брои ЦЯЛ, както и дъмпът. */
const OPZIONI_SCOPE = { ...process.env, PGOPTIONS: "-c app.tenant_id=*" };

function psql(sql, url = ADMIN_URL) {
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-Atc", sql], {
    encoding: "utf8",
    env: OPZIONI_SCOPE,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Имената на таблиците с редове — за пълното сравнение с източника. */
function tabelle(url) {
  return psql(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY 1`,
    url,
  )
    .split("\n")
    .filter(Boolean);
}

function conteggi(url) {
  const out = {};
  for (const t of tabelle(url)) out[t] = Number(psql(`SELECT count(*) FROM "${t}"`, url));
  return out;
}

let temp = null;
let creata = false;

function pulisci() {
  if (creata) {
    try {
      // Без `WITH (FORCE)`: то иска правото да прекратява чужди процеси, а
      // приложната роля вече НЕ е суперпотребител (заради RLS). Собствените
      // връзки са затворени — всеки `psql` излиза сам, — тоест няма какво да
      // се прекратява и обикновеното DROP минава.
      psql(`DROP DATABASE IF EXISTS ${DB}`);
    } catch (e) {
      console.error(`⚠ Проверочната база ${DB} остана: ${e.message}`);
    }
  }
  if (temp) rmSync(temp, { recursive: true, force: true });
}

process.on("exit", pulisci);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(130));

function main() {
  let file = dump;

  // Криптираният бекъп се разшифрова във ВРЕМЕННА директория, не до оригинала:
  // разшифрован дъмп, забравен в /backup, обезсмисля криптирането.
  if (dump.endsWith(".age")) {
    const chiave = process.env.BACKUP_AGE_KEY;
    if (!chiave) {
      console.error("✖ BACKUP_AGE_KEY не е зададен — криптираният дъмп не може да се отвори.");
      process.exit(1);
    }
    temp = mkdtempSync(join(tmpdir(), "verifica-backup-"));
    file = join(temp, "erp.dump");
    console.log("▸ разшифроване");
    execFileSync("age", ["-d", "-i", chiave, "-o", file, dump], { stdio: "inherit" });
  }

  console.log(`▸ проверочна база ${DB}`);
  psql(`CREATE DATABASE ${DB}`);
  creata = true;

  // Източникът се брои ПРЕДИ възстановяването: ако бекъпът е от снощи, а днес
  // има нови редове, разликата е обяснима — затова сравнението е „не по-малко
  // от очакваното", а не точно равенство, и празната таблица е твърд провал.
  const sorgente = SORGENTE_URL ? conteggi(SORGENTE_URL) : null;
  if (!sorgente)
    console.log("⚠ BACKUP_SORGENTE_URL не е зададен — пропускам сверяването с източника");

  console.log("▸ възстановяване");
  // `--no-owner`: дъмпът носи собственика от продукцията, който на проверочната
  // машина може да не съществува — това би дало шум, не сигнал.
  //
  // `--exit-on-error` НЕ е излишно: по подразбиране `pg_restore` изрежда
  // грешките, накрая пише „errors ignored on restore: 3" и излиза с код НУЛА.
  // Без този флаг частично възстановена база минава за успешна — точно
  // обратното на това, за което съществува скриптът.
  execFileSync("pg_restore", ["-d", DB_URL, "--no-owner", "--no-privileges", "--exit-on-error", file], {
    env: OPZIONI_SCOPE,
    stdio: ["ignore", "pipe", "inherit"],
  });

  console.log("▸ съдържание");
  const problemi = [];
  for (const [tabella, minimo] of Object.entries(ATTESI_MINIMI)) {
    const esiste = psql(`SELECT to_regclass('public.${tabella}') IS NOT NULL`, DB_URL);
    if (esiste !== "t") {
      problemi.push(`таблица ${tabella} липсва`);
      continue;
    }
    const n = Number(psql(`SELECT count(*) FROM "${tabella}"`, DB_URL));
    console.log(`  ${tabella}: ${n}`);
    if (n < minimo) problemi.push(`${tabella}: ${n} реда, очаквани поне ${minimo}`);
  }

  if (sorgente) {
    console.log("▸ сверяване с източника");
    const ripristinati = conteggi(DB_URL);
    for (const [t, n] of Object.entries(sorgente)) {
      const r = ripristinati[t];
      if (r === undefined) {
        problemi.push(`таблица ${t} я няма във възстановеното`);
        continue;
      }
      // Празна при непразен източник = частичен дъмп. Точно това прави RLS,
      // когато дъмпът е пуснат без обхват.
      if (n > 0 && r === 0) problemi.push(`${t}: източник ${n} реда, възстановено 0`);
      // Под 90 % също не е „почти същото": липсва цяла фирма.
      else if (n > 0 && r < n * 0.9)
        problemi.push(`${t}: източник ${n}, възстановено ${r} — дъмпът е частичен`);
    }
  }

  // Веригата на одита — ЕДИНСТВЕНАТА проверка, която доказва, че редовете са
  // възстановени в реда, в който са писани, а не просто налични.
  const catena = psql(
    `SELECT count(*) FROM (
       SELECT "hmacPrecedente", lag(hmac) OVER (PARTITION BY "tenantId" ORDER BY seq) AS atteso,
              row_number() OVER (PARTITION BY "tenantId" ORDER BY seq) AS n
       FROM audit_log WHERE "versioneFirma" >= 3
     ) t WHERE n > 1 AND "hmacPrecedente" IS DISTINCT FROM atteso`,
    DB_URL,
  );
  console.log(`  прекъсвания във веригата на одита: ${catena}`);
  // Прочистването по срок оставя ЗАКОННИ прекъсвания — затова прагът не е нула,
  // а „катастрофално много". Нула би вдигала аларма при всяко retention.
  const soglia = Number(process.env.BACKUP_MAX_CATENA_ROTTA ?? 5);
  if (Number(catena) > soglia)
    problemi.push(`веригата на одита е прекъсната ${catena} пъти (праг ${soglia})`);

  // Политиките за изолация НЕ пътуват в `pg_dump -Fc`, ако е правен само на
  // данни — проверяваме дали ги има, преди някой да пусне възстановената база.
  const politiche = Number(
    psql(`SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_isolation'`, DB_URL),
  );
  console.log(`  политики за изолация: ${politiche}`);
  if (politiche === 0)
    problemi.push("политиките tenant_isolation липсват — възстановената база няма изолация");

  if (problemi.length) {
    console.error("\n✖ Бекъпът НЕ е годен:");
    for (const p of problemi) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log("\n✔ Бекъпът е възстановим и съдържанието е смислено.");
}

try {
  main();
} catch (e) {
  console.error(`✖ Проверката се провали: ${e.message}`);
  process.exit(1);
}

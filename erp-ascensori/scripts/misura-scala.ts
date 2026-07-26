// Как се държи базата при РЕАЛЕН обем — измерено, не предположено.
//
//   npm run misura:scala
//
// Защо съществува. Индексите са мястото, където „изглежда добре“ и „работи при
// клиента“ се разминават мълчаливо. С хиляда реда всеки план е бърз; проблемът
// излиза на петдесет хиляди — тоест към третата година на средна фирма — и то
// като „системата стана бавна“, без нищо в лога и без виновен комит.
//
// Скриптът пълни ОТДЕЛНА база с обем, който клиент реално достига, и пуска
// `EXPLAIN ANALYZE` върху заявките, които приложението наистина прави.
// Последователно сканиране на главна таблица е ПРОВАЛ, не забележка.
//
// Нула нови зависимости: Prisma и psql вече са тук.

import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgresql://erp:erp@127.0.0.1:5433/postgres";
const DB = "erp_ascensori_scala_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${DB}`);

/** Обемът на средна фирма след няколко години работа. */
const FATTURE = Number(process.env.SCALA_FATTURE ?? 50_000);
const IMPIANTI = Number(process.env.SCALA_IMPIANTI ?? 3_000);
const AUDIT = Number(process.env.SCALA_AUDIT ?? 40_000);
/** Над този праг заявката е бавна за списък, който човек чака пред екрана. */
const SOGLIA_MS = Number(process.env.SCALA_SOGLIA_MS ?? 50);

const DIM = "\x1b[2m";
const RST = "\x1b[0m";

function psql(sql: string, url = ADMIN_URL): void {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

const TENANT = "11111111-1111-1111-1111-111111111111";
/**
 * Втора фирма — не е украса.
 *
 * С една-единствена стойност в колоната планировчикът вижда, че индексът „не
 * подбира нищо“, и избира сканиране. Реалната инсталация има няколко фирми и
 * това мени плана — измерване без втора фирма мери грешното нещо.
 */
const ALTRO = "22222222-2222-2222-2222-222222222222";

interface Misura {
  nome: string;
  sql: string;
  /** Какво прави приложението с това — влиза в доклада. */
  perche: string;
  /**
   * Сканирането тук е ПРАВИЛНИЯТ план и не е дефект.
   *
   * Има заявки, при които индексът не помага по устройство: агрегат върху
   * голяма част от таблицата чете по-евтино последователно, отколкото през
   * индекс. Такива случаи се следят по ВРЕМЕ (прага в милисекунди), не по вид
   * на плана — иначе докладът вика вълк и човек спира да го гледа.
   */
  scansioneAttesa?: string;
}

const QUERY: Misura[] = [
  {
    nome: "fatture · списък по фирма",
    perche: "първият екран на счетоводството",
    sql: `SELECT * FROM fatture WHERE "tenantId" = '${TENANT}' ORDER BY data DESC LIMIT 50`,
  },
  {
    nome: "fatture · филтър по статус в SDI",
    perche: "„кои чакат известие“",
    sql: `SELECT * FROM fatture WHERE "tenantId" = '${TENANT}' AND "statoSdi" = 'INVIATA' ORDER BY data DESC LIMIT 50`,
  },
  {
    nome: "fatture · филтър по статус на плащане",
    perche: "хапчето „Non pagate“ в списъка — приложението филтрира по РАВЕНСТВО",
    sql: `SELECT * FROM fatture WHERE "tenantId" = '${TENANT}' AND "statoPagamento" = 'NON_PAGATA' ORDER BY data DESC LIMIT 50`,
  },
  {
    nome: "fatture · брой за страницирането",
    perche: "прави се при ВСЯКО отваряне на списъка",
    // Агрегат върху ~80 % от таблицата. Индексът не би помогнал: четенето на
    // 40 000 индексни записа струва повече от последователното минаване. РАСТЕ
    // линейно с таблицата и това е известната граница — над ~500 000 фактури
    // точното броене при всяко отваряне ще трябва да падне на „над 10 000“.
    scansioneAttesa: "агрегат върху по-голямата част от таблицата",
    sql: `SELECT count(*) FROM fatture WHERE "tenantId" = '${TENANT}'`,
  },
  {
    nome: "impianti · списък",
    perche: "основната анагрифика",
    sql: `SELECT * FROM impianti WHERE "tenantId" = '${TENANT}' ORDER BY matricola ASC LIMIT 50`,
  },
  {
    nome: "scadenze · какво изтича",
    perche: "СЪРЦЕТО на продукта — върти се и от автоматизма всяка нощ",
    sql: `SELECT * FROM scadenze_impianti WHERE "tenantId" = '${TENANT}' AND completata = false
            AND "dataScadenza" < now() + interval '90 days' ORDER BY "dataScadenza" ASC LIMIT 100`,
  },
  {
    nome: "audit · последните действия",
    perche: "регистърът расте най-бързо от всичко",
    sql: `SELECT * FROM audit_log WHERE "tenantId" = '${TENANT}' ORDER BY seq DESC LIMIT 50`,
  },
];

interface Piano {
  "Execution Time": number;
  [k: string]: unknown;
}

interface Nodo {
  "Node Type"?: string;
  "Actual Rows"?: number;
  "Plan Rows"?: number;
  Plans?: Nodo[];
  [k: string]: unknown;
}

/** Над колко прочетени реда сканирането престава да е приемливо. */
const RIGHE_GRANDI = Number(process.env.SCALA_RIGHE_GRANDI ?? 10_000);

/** Има ли в плана сканиране на ГОЛЯМА таблица. */
function scansioneGrande(piano: Piano): boolean {
  const visita = (n: Nodo): boolean => {
    if (
      n["Node Type"] === "Seq Scan" &&
      // Броят на РЕАЛНО минатите редове, не на върнатите: филтърът може да
      // остави петдесет, след като е прочел петдесет хиляди.
      Number(n["Actual Rows"] ?? 0) + Number(n["Rows Removed by Filter"] ?? 0) > RIGHE_GRANDI
    )
      return true;
    return (n.Plans ?? []).some(visita);
  };
  return visita(piano.Plan as Nodo);
}

async function main(): Promise<void> {
  console.log(`▸ база ${DB} · ${FATTURE} фактури · ${IMPIANTI} импианта · ${AUDIT} одитни реда`);
  psql(`DROP DATABASE IF EXISTS ${DB}`);
  psql(`CREATE DATABASE ${DB}`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });

  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

  console.log("▸ пълня…");
  await db.$executeRawUnsafe(`
    INSERT INTO tenants (id, slug, "ragioneSociale", email, attivo, "createdAt", "updatedAt")
    VALUES ('${TENANT}','a','A','a@t.local',true,now(),now()),
           ('${ALTRO}','b','B','b@t.local',true,now(),now())`);

  await db.$executeRawUnsafe(`
    INSERT INTO impianti (id, matricola, marca, modello, stato, tipo, regime, "tenantId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), 'M-'||g, 'Schindler', '3300', 'ATTIVO', 'ASCENSORE', 'DIRETTIVA_2014_33',
           CASE WHEN g %% 5 = 0 THEN '${ALTRO}'::uuid ELSE '${TENANT}'::uuid END, now(), now()
    FROM generate_series(1, ${IMPIANTI}) g`.replace(/%%/g, "%"));

  await db.$executeRawUnsafe(`
    INSERT INTO fatture (id, numero, tipo, stato, "statoSdi", "statoPagamento", data, "dataScadenza",
                         "totaleNetto", "totaleIva", "totaleLordo", "tenantId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), 'FT-'||g, 'EMESSA',
           (ARRAY['BOZZA','EMESSA','INVIATA','PAGATA','SCADUTA'])[1 + g % 5]::"StatoFattura",
           (ARRAY['NON_INVIATA','GENERATA','INVIATA','CONSEGNATA','SCARTATA'])[1 + g % 5]::"StatoSdi",
           (ARRAY['NON_PAGATA','PARZIALE','PAGATA'])[1 + g % 3]::"StatoPagamentoFattura",
           now() - (g || ' hours')::interval,
           now() - (g || ' hours')::interval + interval '30 days',
           100, 22, 122,
           CASE WHEN g % 5 = 0 THEN '${ALTRO}'::uuid ELSE '${TENANT}'::uuid END, now(), now()
    FROM generate_series(1, ${FATTURE}) g`);

  await db.$executeRawUnsafe(`
    INSERT INTO scadenze_impianti (id, "impiantoId", tipo, "dataScadenza", completata, "tenantId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), i.id, 'revisione',
           now() + ((random()*700 - 100) || ' days')::interval, (random() < 0.3),
           i."tenantId", now(), now()
    FROM impianti i`);

  await db.$executeRawUnsafe(`
    INSERT INTO audit_log (id, azione, entita, "entitaId", hmac, "tenantId", "createdAt")
    SELECT gen_random_uuid(), 'CREATE', 'fatture', gen_random_uuid(), md5(g::text),
           CASE WHEN g % 5 = 0 THEN '${ALTRO}'::uuid ELSE '${TENANT}'::uuid END,
           now() - (g || ' minutes')::interval
    FROM generate_series(1, ${AUDIT}) g`);

  // VACUUM, не само ANALYZE. Без свежа статистика планировчикът решава по
  // празна таблица; а без картата на видимостта няма index-only scan и `count`
  // изглежда бавен изкуствено. Реалната инсталация има и двете от автовакуума.
  await db.$executeRawUnsafe("VACUUM ANALYZE");

  console.log("\n▸ планове\n");
  let problemi = 0;
  for (const q of QUERY) {
    const r = await db.$queryRawUnsafe<{ "QUERY PLAN": Piano[] }[]>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`,
    );
    const piano = r[0]["QUERY PLAN"][0];
    const ms = piano["Execution Time"];
    const testo = JSON.stringify(piano);
    // Сканирането е проблем само при ГОЛЯМА таблица. На няколко хиляди реда то
    // е ПРАВИЛНИЯТ план — индексът би струвал повече, отколкото пести. Инструмент,
    // който вика вълк при всяко сканиране, учи човека да не гледа доклада.
    const seqScan = scansioneGrande(piano);
    const sortDisco = /"Sort Method": ?"external/.test(testo);

    const scansioneGrave = seqScan && !q.scansioneAttesa;
    const male = ms > SOGLIA_MS || scansioneGrave || sortDisco;
    if (male) problemi++;
    const segni = [
      scansioneGrave ? "ПОСЛЕДОВАТЕЛНО СКАНИРАНЕ" : "",
      sortDisco ? "сортиране на диск" : "",
      ms > SOGLIA_MS ? `над прага` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `${male ? "✗" : "✔"} ${q.nome.padEnd(34)} ${ms.toFixed(1).padStart(7)} ms` +
        `${segni ? `  ← ${segni}` : ""}`,
    );
    if (male) console.log(`    ${q.perche}`);
    else if (seqScan && q.scansioneAttesa)
      console.log(`    ${DIM}сканиране по замисъл: ${q.scansioneAttesa}${RST}`);
  }

  await db.$disconnect();
  psql(`DROP DATABASE IF EXISTS ${DB}`);
  console.log(
    problemi
      ? `\n✗ ${problemi} заявки под очакването (праг ${SOGLIA_MS} ms, без сканиране на главна таблица)`
      : `\n✔ всички заявки под ${SOGLIA_MS} ms и през индекс`,
  );
  process.exit(problemi ? 1 : 0);
}

main().catch((e: Error) => {
  console.error("✗", e.message);
  try {
    psql(`DROP DATABASE IF EXISTS ${DB}`);
  } catch {
    /* базата може и да не е стигнала до създаване */
  }
  process.exit(2);
});

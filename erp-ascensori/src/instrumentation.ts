// Точка за старт на процеса: проверка на конфигурацията ПРИ БУТ (fail-fast) и
// грациозно спиране.
//
// Без това `segreto()` хвърля чак при първата заявка — процесът стартира
// „здрав", деплоят изглежда успешен, а приложението е тотално счупено.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { log, descriviErrore } = await import("@/lib/log");
  const mancanti: string[] = [];

  const sessione = process.env.SESSION_SECRET;
  const audit = process.env.AUDIT_HMAC_KEY;
  if (!sessione || sessione.length < 32) mancanti.push("SESSION_SECRET (min 32 знака)");
  if (!audit || audit.length < 32) mancanti.push("AUDIT_HMAC_KEY (min 32 знака)");
  if (sessione && audit && sessione === audit)
    mancanti.push("SESSION_SECRET и AUDIT_HMAC_KEY трябва да са РАЗЛИЧНИ");
  if (!process.env.DATABASE_URL) mancanti.push("DATABASE_URL");

  if (mancanti.length > 0) {
    // Не ползваме структурирания логер: това е фатално и трябва да е четимо.
    console.error(
      `[avvio] конфигурацията е непълна — процесът спира:\n  - ${mancanti.join("\n  - ")}`
    );
    process.exit(1);
  }

  log.info("avvio completato", { esito: "ok" });

  const { prisma } = await import("@/lib/prisma");
  let inChiusura = false;
  const chiudi = async (segnale: string) => {
    if (inChiusura) return;
    inChiusura = true;
    log.info("arresto in corso", { esito: segnale });
    try {
      await prisma.$disconnect();
    } catch {
      /* при спиране нищо не бива да пречи на изхода */
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void chiudi("SIGTERM"));
  process.on("SIGINT", () => void chiudi("SIGINT"));
  process.on("unhandledRejection", (motivo) => {
    log.error("promessa non gestita", descriviErrore(motivo));
  });
}

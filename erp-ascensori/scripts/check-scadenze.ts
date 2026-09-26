// Cron задача (на 24 часа): node --env-file=.env скриптът пуска автоматизма.
//   0 6 * * *  cd /opt/erp-ascensori && npm run scadenze:check
import { controllaScadenzeTracciato } from "../src/lib/scadenze-runner";
import { prisma } from "../src/lib/prisma";

controllaScadenzeTracciato()
  .then((esito) => {
    console.log("[scadenze]", JSON.stringify(esito));
  })
  .catch((e) => {
    console.error("[scadenze] errore:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

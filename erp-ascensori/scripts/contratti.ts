// Cron задача (на 24 часа): ражда периодичните посещения и фактурите за canone.
//   0 5 * * *  cd /opt/erp-ascensori && npm run contratti
import { elaboraContrattiTracciato } from "../src/lib/contratti-runner";
import { prisma } from "../src/lib/prisma";

elaboraContrattiTracciato()
  .then((esito) => {
    console.log("[contratti]", JSON.stringify(esito));
  })
  .catch((e) => {
    console.error("[contratti] errore:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

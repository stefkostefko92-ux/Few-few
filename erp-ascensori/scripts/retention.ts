// Cron задача (седмично): прилага политиката за срок на съхранение.
//   0 4 * * 0  cd /opt/erp-ascensori && npm run retention
import { applicaRetentionTracciato } from "../src/lib/retention-runner";
import { prisma } from "../src/lib/prisma";

applicaRetentionTracciato()
  .then((esito) => {
    console.log("[retention]", JSON.stringify(esito));
  })
  .catch((e) => {
    console.error("[retention] errore:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

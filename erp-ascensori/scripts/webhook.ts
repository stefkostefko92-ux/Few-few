// Доставя чакащите известия. Пуска се често (cron на 5 минути).
//
// Отделен процес, а не част от заявката: бавен или паднал получател иначе бави
// смяната на статуса, тоест чужд сървър решава дали фактурата ни ще се издаде.

import { consegnaInAttesaTracciato } from "../src/lib/webhook/emetti";
import { prisma } from "../src/lib/prisma";

async function main() {
  // Проследеният вариант: пускът оставя следа, върху която стои dead-man-ът.
  const esito = await consegnaInAttesaTracciato(
    Number(process.env.WEBHOOK_LOTTO ?? 100),
  );
  console.log(
    `▸ consegne: tentate ${esito.tentate} · riuscite ${esito.riuscite} · fallite ${esito.fallite}` +
      (esito.webhookDisattivati
        ? ` · webhook disattivati ${esito.webhookDisattivati}`
        : ""),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(
    "✗ доставката се провали:",
    e instanceof Error ? e.constructor.name : typeof e,
  );
  await prisma.$disconnect();
  process.exit(1);
});

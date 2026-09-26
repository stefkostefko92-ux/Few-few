// Праща чакащите известия. Пуска се често (cron на 15 минути).
//
// Отделен процес, а не част от автоматизма за сроковете: бавно или паднало
// пощенско реле иначе би провалило целия пуск, тоест чужд сървър би решавал
// дали срокът по чл. 13 D.P.R. 162/1999 ще бъде вдигнат.

import { inviaInAttesaTracciato } from "../src/lib/notifiche/coda";
import { prisma } from "../src/lib/prisma";

async function main() {
  const esito = await inviaInAttesaTracciato(
    Number(process.env.NOTIFICHE_LOTTO ?? 50),
  );
  if (esito.smtpAssente) {
    // Не е грешка — функцията просто не е конфигурирана. Излиза с 0, за да не
    // вдига cron аларма всеки четвърт час на инсталация, която не праща поща.
    console.log("▸ notifiche: SMTP non configurato, coda intatta");
  } else {
    console.log(
      `▸ notifiche: tentate ${esito.tentate} · inviate ${esito.riuscite} · fallite ${esito.fallite}` +
        (esito.abbandonate ? ` · abbandonate ${esito.abbandonate}` : ""),
    );
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(
    "✗ изпращането се провали:",
    e instanceof Error ? e.constructor.name : typeof e,
  );
  await prisma.$disconnect();
  process.exit(1);
});

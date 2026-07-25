// Автоматизъм „Controllo scadenze" (на 24 часа): прагове 90/60/30 за impianti,
// цветен статус на automezzi, изтичане на preventivi и fatture.
// Вика се от /api/scadenze/check и от scripts/check-scadenze.ts (cron).

import { prisma } from "@/lib/prisma";
import { sogliePendenti, statoAutomezzo } from "@/lib/scadenze-logic";
import { log, descriviErrore } from "@/lib/log";

export interface EsitoControllo {
  notificheScadenze: number;
  automezziAggiornati: number;
  preventiviScaduti: number;
  fattureScadute: number;
}

/**
 * Пуска автоматизма и ЗАПИСВА следа от пускането.
 *
 * Без записа спрян cron или рестартирала машина остава невидим: срокът минава,
 * никой не разбира. Следата е и източникът за dead-man проверката
 * (`/api/healthz/automatismi`).
 */
export async function controllaScadenzeTracciato(oggi = new Date()): Promise<EsitoControllo> {
  const run = await prisma.automatismoRun.create({ data: { nome: "scadenze" } });
  const inizio = Date.now();
  try {
    const esito = await controllaScadenze(oggi);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "OK",
        durataMs: Date.now() - inizio,
        dettagli: { ...esito },
      },
    });
    log.info("automatismo scadenze", { esito: "OK", durata_ms: Date.now() - inizio });
    return esito;
  } catch (e) {
    const err = descriviErrore(e);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "ERRORE",
        durataMs: Date.now() - inizio,
        errore: `${err.err_tipo}:${err.err_codice}`,
      },
    });
    log.error("automatismo scadenze fallito", { ...err, esito: "ERRORE" });
    throw e;
  }
}

export async function controllaScadenze(oggi = new Date()): Promise<EsitoControllo> {
  let notificheScadenze = 0;

  // 1) Законови срокове на импиантите — флаговете се вдигат еднократно
  const scadenze = await prisma.scadenzaImpianto.findMany({ where: { completata: false } });
  for (const s of scadenze) {
    const soglie = sogliePendenti(s, oggi);
    if (soglie.length === 0) continue;
    await prisma.scadenzaImpianto.update({
      where: { id: s.id },
      data: {
        notificato90: s.notificato90 || soglie.includes(90),
        notificato60: s.notificato60 || soglie.includes(60),
        notificato30: s.notificato30 || soglie.includes(30),
      },
    });
    notificheScadenze += soglie.length;
  }

  // 2) Цветен статус на автопарка
  let automezziAggiornati = 0;
  const automezzi = await prisma.automezzo.findMany({ where: { attivo: true } });
  for (const a of automezzi) {
    const stato = statoAutomezzo(
      [a.scadenzaRevisione, a.scadenzaAssicurazione, a.scadenzaTagliando],
      oggi
    );
    if (stato !== a.stato) {
      await prisma.automezzo.update({ where: { id: a.id }, data: { stato } });
      automezziAggiornati++;
    }
  }

  // 3) Preventivi: изпратени и извън validitaGiorni → SCADUTO
  const inviati = await prisma.preventivo.findMany({ where: { stato: "INVIATO" } });
  let preventiviScaduti = 0;
  for (const p of inviati) {
    const limite = new Date(p.createdAt.getTime() + p.validitaGiorni * 86_400_000);
    if (limite < oggi) {
      await prisma.preventivo.update({ where: { id: p.id }, data: { stato: "SCADUTO" } });
      preventiviScaduti++;
    }
  }

  // 4) Fatture: просрочен падеж → SCADUTA
  const { count: fattureScadute } = await prisma.fattura.updateMany({
    where: {
      stato: { in: ["EMESSA", "INVIATA"] },
      dataScadenza: { lt: oggi },
    },
    data: { stato: "SCADUTA" },
  });

  return { notificheScadenze, automezziAggiornati, preventiviScaduti, fattureScadute };
}

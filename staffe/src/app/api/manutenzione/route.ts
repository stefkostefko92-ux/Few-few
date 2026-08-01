import { purgeExpiredSessions, requirePermission } from '@/lib/auth';
import { audit, pruneAuditLog, retentionGiorni } from '@/lib/audit';
import { ok, route } from '@/lib/api';

/**
 * Manutenzione periodica dei dati che scadono.
 *
 * Esisteva già `purgeExpiredSessions()`, ma non la chiamava nessuno: il
 * `SECURITY.md` prometteva che le sessioni scadute vengono eliminate e nella
 * sistema reale restavano lì con il loro `userAgent`. Una politica di
 * conservazione senza codice che la esegue è un documento che dice il falso.
 *
 * Va invocata da un lavoro pianificato sul server (cron/systemd timer), con le
 * credenziali di un amministratore — non da un utente qualsiasi e non
 * automaticamente a ogni richiesta: cancellare è irreversibile e deve restare
 * un'operazione voluta, registrata e attribuibile.
 *
 *   curl -sS -X POST --cookie "staffe_session=…" https://…/api/manutenzione
 */
export const POST = route(async () => {
  const utente = await requirePermission('utenti:gestisci');

  const giorni = retentionGiorni();
  const [sessioniRimosse, auditRimossi] = await Promise.all([
    purgeExpiredSessions(),
    pruneAuditLog(giorni),
  ]);

  await audit({
    userId: utente.id,
    action: 'MANUTENZIONE',
    entity: 'Sistema',
    summary: `Sessioni scadute rimosse: ${sessioniRimosse}; righe di audit oltre ${giorni} giorni rimosse: ${auditRimossi}.`,
  });

  return ok({ sessioniRimosse, auditRimossi, retentionGiorni: giorni });
});

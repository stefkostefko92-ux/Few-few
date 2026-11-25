import { config } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { allarme } from './allarmi/servizio.js';
import { eseguiPassi, ricordaManutenzione } from './manutenzione-passi.js';
import { aggiornaContestazioniAperte } from './pagamenti/contestazioni.js';
import { ricordaNoteInScadenza } from './pagamenti/note-credito.js';
import { riconciliaRimborsi } from './pagamenti/rimborsi-riconcilia.js';
import { pulisciSegnalazioni } from './segnalazioni/servizio.js';
import { pulisciArrivi } from './allegati/archivio.js';
import { concludiCambi } from './aziende/cambio.js';
import { caricaAnnunci } from './legale/annunci.js';
import { eliminaAziendeScadute } from './aziende/eliminazione.js';
import { pulisciProve } from './legale/emissioni.js';
import { pulisciErrori } from './auth/rete.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { pulisciSfide } from './services/login-2fa.js';
import { purgeOldRequests } from './requests/service.js';
import { INVITI_SCADUTI_GIORNI } from './services/invites.js';
import { DAY, HOUR } from './time.js';
import { avvisaScadenze } from './abbonamenti/scadenze.js';
import { riconciliaInSospeso } from './pagamenti/riconcilia.js';
import { avviaPianiInCoda } from './abbonamenti/servizio.js';

/**
 * Чистене веднъж на час: изтекли сесии и входове, чакали кода на 2FA, грешните опити по мрежа (след ден),
 * стари покани и връзки за парола (след 30 дни — дотогава се
 * виждат като „изтекли“), заявки за достъп след срока си, одит по-стар от срока, качено от прекъсната
 * заявка (по-старо от ден), доказателствата след срока им. Грешка в една стъпка не спира нито процеса, нито
 * другите стъпки — опитва пак след час; последното пускане се вижда в „Salute del sistema“.
 */
export async function runMaintenance(): Promise<void> {
  const now = Date.now();
  const quando = new Date(now);
  // Всяка стъпка е сама за себе си: паднала не спира другите (manutenzione-passi.ts).
  const esito = await eseguiPassi(
    [
      // Обявите на новите версии (legale/versioni.ts) — наново от базата, ако са записани другаде.
      ['annunci', async () => (await caricaAnnunci(), 0)],
      ['sessions', () => purgeExpiredSessions()],
      // Входовете, чакали кода, и грешните опити по мрежа (пазят се ден).
      ['sfide', () => pulisciSfide(now)],
      ['errori', () => pulisciErrori(now)],
      [
        'invites',
        async () =>
          (
            await prisma.invite.deleteMany({
              where: {
                expiresAt: { lt: new Date(now - INVITI_SCADUTI_GIORNI * DAY) },
                acceptedAt: null,
              },
            })
          ).count,
      ],
      [
        'resets',
        async () =>
          (
            await prisma.passwordReset.deleteMany({
              where: { expiresAt: { lt: new Date(now - 30 * DAY) } },
            })
          ).count,
      ],
      ['requests', () => purgeOldRequests(now)],
      [
        'audit',
        async () =>
          (
            await prisma.auditLog.deleteMany({
              where: { at: { lt: new Date(now - config().AUDIT_RETENTION_DAYS * DAY) } },
            })
          ).count,
      ],
      // Каченото от прекъсната заявка (обикновено заявката го трие сама) и прекъснатите износи.
      ['arrivi', () => pulisciArrivi(DAY, now)],
      // Смяната на доставчика: преходите, които са свършили — фирмата се деактивира (src/aziende/cambio.ts).
      ['cambi', () => concludiCambi(quando)],
      // Фирмите, деактивирани преди повече от 90 дни — окончателно, с всичките им данни.
      ['aziende', () => eliminaAziendeScadute(now)],
      // Доказателствата (приемания и изтеглени изчисления) след своя срок — src/legale/.
      ['prove', () => pulisciProve(now)],
      // Известията за края на пробния месец и на плана (чл. 12.6) — src/abbonamenti/scadenze.ts.
      ['avvisi', () => avvisaScadenze(quando)],
      // Плащанията без отговор: сверка с Revolut (изгубен webhook); плановете в опашка, чийто ден е дошъл.
      ['pagamenti', () => riconciliaInSospeso(quando)],
      // Връщанията през Revolut, които още чакат крайното си състояние, и отворените спорове.
      ['rimborsi', () => riconciliaRimborsi(quando)],
      ['contestazioni', () => aggiornaContestazioniAperte()],
      // Кредитните известия със срок до ден (5 дни от връщането) — напомняне в Discord; нищо не се трие.
      ['noteCredito', async () => (await ricordaNoteInScadenza(quando), 0)],
      // Решените сигнали за незаконно съдържание след срока им (5 години; неразгледаемите — 1).
      ['segnalazioni', () => pulisciSegnalazioni(quando)],
      ['piani', () => avviaPianiInCoda(quando)],
    ],
    quando,
  );
  ricordaManutenzione(esito);
  // Паднала стъпка — и в Discord (само броят; имената са в „Salute del sistema“ и в лога).
  if (esito.falliti.length > 0) void allarme('manutenzione', esito.falliti.length);
  if (Object.values(esito.conteggi).some((n) => n > 0))
    logger.info({ evento: 'manutenzione', ...esito.conteggi }, 'поддръжка: изчистено');
}

export function startMaintenance(): NodeJS.Timeout {
  const run = (): void => {
    runMaintenance().catch((error: unknown) => {
      logger.error({ evento: 'manutenzione', err: errorMessage(error) }, 'поддръжката се провали');
    });
  };
  run();
  const timer = setInterval(run, HOUR);
  timer.unref();
  return timer;
}

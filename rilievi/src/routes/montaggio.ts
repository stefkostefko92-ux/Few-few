import type { Express } from 'express';
import { allegatiRouter } from './allegati.js';
import { auditRouter } from './audit.js';
import { accessoRouter, calcoloRouter } from './accesso.js';
import { aziendeRouter } from './aziende.js';
import { aziendeFineRouter } from './aziende-fine.js';
import { cartelliNuovoRouter } from './cartelli-nuovo.js';
import { cartelliRouter } from './cartelli.js';
import { cestinoRouter } from './cestino.js';
import { ordiniRouter } from './ordini.js';
import { installaRouter } from './installa.js';
import { impostazioniRouter } from './impostazioni.js';
import { impostazioniCartelloRouter } from './impostazioni-cartello.js';
import { impostazioniRuoliRouter } from './impostazioni-ruoli.js';
import { interventiRouter } from './interventi.js';
import { interventiFirmaRouter } from './interventi-firma.js';
import { verbaliFirmaRouter } from './verbali-firma.js';
import { verbaliNuovoRouter } from './verbali-nuovo.js';
import { verbaliRouter } from './verbali.js';
import { interventiInvioRouter } from './interventi-invio.js';
import { requestsRouter } from './requests.js';
import { schedeRouter } from './schede.js';
import { schedeStampaRouter } from './schede-stampa.js';
import { siteRouter } from './site.js';
import { usersRouter } from './users.js';
import { usersManageRouter } from './users-manage.js';
import { novitaRouter } from './novita.js';
import { condizioniRouter } from './condizioni.js';
import { condizioniFirmaRouter } from './condizioni-firma.js';

/**
 * Рутерите на страниците в реда им (изнесени от server.ts, за да не расте над 300 реда). Редът е част от
 * значението: `/cartelli/nuovo` и `/verbali/nuovo` — преди `/:id`, `/utenti/invita` — преди `/utenti/:id`.
 */
export function montaRouter(app: Express): void {
  app.use(siteRouter);
  app.use(novitaRouter);
  app.use(condizioniRouter);
  app.use(condizioniFirmaRouter);
  app.use(installaRouter);
  app.use(accessoRouter);
  app.use(schedeRouter);
  app.use(schedeStampaRouter);
  app.use(allegatiRouter);
  app.use(cestinoRouter);
  app.use(ordiniRouter);
  app.use(calcoloRouter);
  app.use(interventiRouter);
  app.use(interventiFirmaRouter);
  app.use(interventiInvioRouter);
  app.use(impostazioniCartelloRouter);
  // Преди cartelliRouter: `/cartelli/nuovo` е преди `/cartelli/:id`.
  app.use(cartelliNuovoRouter);
  app.use(cartelliRouter);
  // Преди verbaliRouter: `/verbali/nuovo` е преди `/verbali/:id`.
  app.use(verbaliNuovoRouter);
  app.use(verbaliRouter);
  app.use(verbaliFirmaRouter);
  app.use(usersRouter);
  // След usersRouter: `/utenti/invita` е преди `/utenti/:id`.
  app.use(usersManageRouter);
  app.use(aziendeRouter);
  app.use(aziendeFineRouter);
  app.use(impostazioniRouter);
  app.use(impostazioniRuoliRouter);
  app.use(requestsRouter);
  app.use(auditRouter);
}

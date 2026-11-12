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
import { impostazioniEsportazioneRouter } from './impostazioni-esportazione.js';
import { impostazioniFirmeRouter } from './impostazioni-firme.js';
import { impostazioniFlussoRouter } from './impostazioni-flusso.js';
import { schedeApprovazioneRouter } from './schede-approvazione.js';
import { schedeVersioniRouter } from './schede-versioni.js';
import { ordiniInvioRouter } from './ordini-invio.js';
import { impostazioniRuoliRouter } from './impostazioni-ruoli.js';
import { interventiRouter } from './interventi.js';
import { interventiFirmaRouter } from './interventi-firma.js';
import { verbaliFirmaRouter } from './verbali-firma.js';
import { verbaliNuovoRouter } from './verbali-nuovo.js';
import { verbaliRouter } from './verbali.js';
import { allegatiAnnotazioniRouter } from './allegati-annotazioni.js';
import { buoniFirmeRouter } from './buoni-firme.js';
import { statoRouter } from './stato.js';
import { buoniNuovoRouter } from './buoni-nuovo.js';
import { buoniRouter } from './buoni.js';
import { impostazioniPreventiviRouter } from './impostazioni-preventivi.js';
import { preventiviAzioniRouter } from './preventivi-azioni.js';
import { preventiviListinoRouter } from './preventivi-listino.js';
import { preventiviNuovoRouter } from './preventivi-nuovo.js';
import { preventiviRouter } from './preventivi.js';
import { impostazioniBuonoRouter } from './impostazioni-buono.js';
import { interventiInvioRouter } from './interventi-invio.js';
import { requestsRouter } from './requests.js';
import { schedeRouter } from './schede.js';
import { schedeStampaRouter } from './schede-stampa.js';
import { schedeEtichettaRouter } from './schede-etichetta.js';
import { siteRouter } from './site.js';
import { usersRouter } from './users.js';
import { usersManageRouter } from './users-manage.js';
import { novitaRouter } from './novita.js';
import { esportazioneRouter } from './esportazione.js';
import { navigazioneRouter } from './navigazione.js';
import { condizioniRouter } from './condizioni.js';
import { condizioniFirmaRouter } from './condizioni-firma.js';
import { masterRouter } from './master.js';
import { masterComunicazioniRouter } from './master-comunicazioni.js';
import { masterContrattiRouter } from './master-contratti.js';
import { masterVerificaRouter } from './master-verifica.js';
import { masterRegistriRouter } from './master-registri.js';

/**
 * Рутерите на страниците в реда им (изнесени от server.ts, за да не расте над 300 реда). Редът е част от
 * значението: `/cartelli/nuovo` и `/verbali/nuovo` — преди `/:id`, `/utenti/invita` — преди `/utenti/:id`.
 */
export function montaRouter(app: Express): void {
  app.use(siteRouter);
  app.use(novitaRouter);
  app.use(esportazioneRouter);
  app.use(statoRouter);
  app.use(navigazioneRouter);
  app.use(masterRouter);
  app.use(masterContrattiRouter);
  app.use(masterVerificaRouter);
  app.use(masterComunicazioniRouter);
  app.use(masterRegistriRouter);
  app.use(condizioniRouter);
  app.use(condizioniFirmaRouter);
  app.use(installaRouter);
  app.use(accessoRouter);
  app.use(schedeRouter);
  app.use(schedeStampaRouter);
  app.use(schedeEtichettaRouter);
  app.use(schedeApprovazioneRouter);
  app.use(schedeVersioniRouter);
  app.use(ordiniInvioRouter);
  app.use(allegatiRouter);
  app.use(allegatiAnnotazioniRouter);
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
  // Преди buoniRouter: `/buoni/nuovo` е преди `/buoni/:id`.
  app.use(buoniNuovoRouter);
  app.use(buoniRouter);
  app.use(buoniFirmeRouter);
  // Преди preventiviRouter: `/preventivi/listino` и `/preventivi/nuovo` са преди `/preventivi/:id`.
  app.use(preventiviListinoRouter);
  app.use(preventiviNuovoRouter);
  app.use(preventiviRouter);
  app.use(preventiviAzioniRouter);
  app.use(impostazioniPreventiviRouter);
  app.use(usersRouter);
  // След usersRouter: `/utenti/invita` е преди `/utenti/:id`.
  app.use(usersManageRouter);
  app.use(aziendeRouter);
  app.use(aziendeFineRouter);
  // Преди impostazioniRouter: `/impostazioni/esportazione` е свой раздел с своя проверка (не по способност).
  app.use(impostazioniEsportazioneRouter);
  app.use(impostazioniRouter);
  app.use(impostazioniFirmeRouter);
  app.use(impostazioniBuonoRouter);
  app.use(impostazioniFlussoRouter);
  app.use(impostazioniRuoliRouter);
  app.use(requestsRouter);
  app.use(auditRouter);
}

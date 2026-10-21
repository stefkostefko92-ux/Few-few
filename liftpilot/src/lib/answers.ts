// The short plain-text answers of the API routes, in Italian like every text of the product: a download is a plain link,
// so when it fails (the session expired, the rate limit, a busy renderer, a record to make again) the browser shows the
// answer as it is. The words are the ones of messages/it.json (errors.*), the same the pages say. Pure.
import it from '../../messages/it.json';

const e = it.errors;

export const ANSWER = {
  unauthorized: e.unauthorized,
  forbidden: e.forbidden,
  rateLimited: e.rateLimited,
  notFound: e.notFound,
  /** the running engines no longer reproduce the record (or what it was made from): its documents wait for it to be made again */
  stale: e.recordStale,
  noMachine: e.noCatalogueMachine,
  /** a modernisation keeping the existing machine: nothing to order (round 45) */
  machineKept: e.machineKept,
  failed: e.documentFailed,
  busy: e.rendererBusy,
  /** the installation is archived: nothing can be uploaded to it (round 49) */
  archived: e.archived,
  // round 49, the uploaded files (POST /api/projects/[id]/allegati): refused before or while the bytes are read
  fileTooLarge: e.fileTooLarge,
  fileInvalid: e.fileInvalid,
  pdfProtected: e.pdfProtected,
  pdfForm: e.pdfForm,
  quotaExceeded: e.quotaExceeded,
  // round 49, the relazione tecnica di modifica (its preview and its PDF): no eligible base, a base the running engines
  // no longer reproduce, data still missing
  rtNotEligible: e.rtNotEligible,
  rtBaseOutdated: e.rtBaseOutdated,
  rtIncomplete: e.rtIncomplete,
} as const;

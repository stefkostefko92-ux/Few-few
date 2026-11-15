// The documents of the "Documenti" menu, in the order of the work: the intervention sheet, the stop sign,
// the closing report, the work order and the quote (each module checks its own pages).
import { checkBuoni } from './buoni.mjs';
import { checkCartelli } from './cartelli.mjs';
import { checkInterventi } from './interventi.mjs';
import { checkPreventivi } from './preventivi.mjs';
import { checkVerbali } from './verbali.mjs';

export async function checkDocumenti(
  page,
  { base, shots, scheme, aziendaName, aziendaPath, sheetUrl },
) {
  await checkInterventi(page, { base, shots, scheme, aziendaName });
  await checkCartelli(page, { base, shots, scheme, aziendaPath, sheetUrl });
  await checkVerbali(page, { base, shots, scheme, sheetUrl });
  await checkBuoni(page, { base, shots, scheme, sheetUrl });
  await checkPreventivi(page, { base, shots, scheme, aziendaPath, sheetUrl });
}

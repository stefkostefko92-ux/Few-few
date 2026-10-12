import 'server-only';
// What the survey sheets' pages ask the server for, with the rights decided here as in rilievi's routes: a sheet of the
// company (a trashed one only for whoever manages the trash), the form's starting values (the suppliers' modules
// prefilled at their first opening from the survey, the company and the person writing), the list or the trash.
import { cache } from 'react';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { emptyFormValues, formValuesFromScheda, schedaTitle, tabTitle } from '@/lib/rilievi/format';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { withPrefill } from '@/lib/rilievi/ordini/form';
import type { PrefillContext } from '@/lib/rilievi/ordini/prefill';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { businessDay } from '@/lib/rilievi/time';
import messages from '../../../messages/it.json';
import { getScheda, listSchede, type SchedaFull, type SchedaPage } from './queries';

/** Who writes, for the modules' prefill: the company, the person, the role in Italian (the modules are Italian), the
 *  address. The sheet's company is always the user's. */
export function prefillContext(user: SessionUser): Omit<PrefillContext, 'values'> {
  return { azienda: user.companyName, utente: user.name, ruolo: messages.roles[user.role], email: user.email };
}

/** A new sheet's form: today in Rome, everything else empty, the modules prefilled. */
export const newFormValues = (user: SessionUser, today: string = businessDay()): FormValues => withPrefill(emptyFormValues(today), prefillContext(user));

/** A stored sheet's form (for «Modifica»): its values, its rows, its modules (or their prefill when never filled). */
export const editFormValues = (user: SessionUser, scheda: SchedaFull): FormValues => withPrefill(formValuesFromScheda(scheda), prefillContext(user));

/** One read of a sheet per request, however many parts of the page ask (its metadata, the page). */
const schedaOnce = cache((companyId: string, id: string, includeDeleted: boolean) => getScheda(companyId, id, includeDeleted));

/** A sheet to show, print or download: of the company; a trashed one only for whoever manages the trash. */
export function sheetToShow(user: SessionUser, id: string): Promise<SchedaFull | null> {
  return schedaOnce(user.companyId, id, can(user, 'rilievi:trash-manage'));
}

/** The browser tab's title of a sheet's page (rilievi: its identity, cut at 40 characters), or null when the signed-in
 *  user may not see it (the page then answers on its own: login, not found). */
export async function sheetTabTitle(id: string): Promise<string | null> {
  const user = await getSessionUser();
  if (!user || !can(user, 'rilievi:view')) return null;
  const scheda = await sheetToShow(user, id);
  return scheda ? tabTitle(schedaTitle(scheda, rilieviTranslator())) : null;
}

/** A sheet to edit or move to the trash: of the company and not in the trash. */
export function sheetToEdit(user: SessionUser, id: string): Promise<SchedaFull | null> {
  return getScheda(user.companyId, id);
}

/** A sheet to delete for good: of the company and in the trash. */
export async function sheetToPurge(user: SessionUser, id: string): Promise<SchedaFull | null> {
  const scheda = await getScheda(user.companyId, id, true);
  return scheda?.deletedAt ? scheda : null;
}

/** The list (or the search) of the company's sheets, page `page`. */
export const listPage = (user: SessionUser, query: string, page: number): Promise<SchedaPage> => listSchede({ companyId: user.companyId, query, page });

/** The trash (or a search in it), page `page`. */
export const trashPage = (user: SessionUser, query: string, page: number): Promise<SchedaPage> => listSchede({ companyId: user.companyId, query, page, trash: true });

import 'server-only';
// What the survey sheets' pages ask the server for, with the rights decided here as in rilievi's routes: a sheet of the
// company (a trashed one only for whoever manages the trash), the form's starting values (the suppliers' modules
// prefilled at their first opening from the survey, the other module, the company and the person writing; the fields
// still following their source; the discrepancies sheet ↔ modules), the linked data for the browser, the company's order
// of the sections, the sheet's page and print in that order (with the modules' summary), the list or the trash.
import { cache } from 'react';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { displaySections, emptyFormValues, formValuesFromScheda, schedaTitle, tabTitle, type DisplaySection } from '@/lib/rilievi/format';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { SECTIONS, type SectionKey } from '@/lib/rilievi/fields';
import { FISSE, sezioniOrdinate } from '@/lib/rilievi/ordine';
import { collegatiPerBrowser, type CollegatiDati, type ContestoBrowser } from '@/lib/rilievi/ordini/collegati-browser';
import { discrepanzeDi, type Discrepanza } from '@/lib/rilievi/ordini/collegati';
import { withPrefill } from '@/lib/rilievi/ordini/form';
import type { PrefillContext } from '@/lib/rilievi/ordini/prefill';
import { riepilogoModuli, type RiepilogoModulo } from '@/lib/rilievi/ordini/riepilogo';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import type { RilieviT } from '@/lib/rilievi/t';
import { businessDay } from '@/lib/rilievi/time';
import messages from '../../../messages/it.json';
import { getScheda, listSchede, ordineSezioniDi, type SchedaFull, type SchedaPage } from './queries';

/** Who writes, for the modules' prefill and the browser's: the company, the person, the role in Italian (the modules are
 *  Italian), the address. The sheet's company is always the user's. */
export function contestoOf(user: SessionUser): ContestoBrowser {
  return { azienda: user.companyName, utente: user.name, ruolo: messages.roles[user.role], email: user.email };
}

/** The modules' prefill context: who writes, and the words of the sheet's ticks («Automatiche, Manuali»). */
export function prefillContext(user: SessionUser): Omit<PrefillContext, 'values'> {
  const t = rilieviTranslator();
  return { ...contestoOf(user), etichetta: (campo, valore) => t(`scheda.option.${campo}.${valore}`) };
}

/** What the form opens with: the values (the modules prefilled where they were never shown), the names that still
 *  follow their source (`auto`), and what the sheet and the modules say differently (the lists under the groups). */
export interface RilievoFormStart {
  values: FormValues;
  auto: string[];
  discrepanze: Discrepanza[];
}

/** The form over these values (a new sheet, a stored one, or what was sent and comes back). */
export function formStart(user: SessionUser, values: FormValues): RilievoFormStart {
  const prefilled = withPrefill(values, prefillContext(user));
  return { values: prefilled.values, auto: [...prefilled.auto], discrepanze: discrepanzeDi(prefilled.values, rilieviTranslator()) };
}

/** A new sheet's form: today in Rome, everything else empty, the modules prefilled. */
export const newForm = (user: SessionUser, today: string = businessDay()): RilievoFormStart => formStart(user, emptyFormValues(today));

/** A stored sheet's form (for «Modifica»): its values, its rows, its modules (or their prefill when never filled). */
export const editForm = (user: SessionUser, scheda: SchedaFull): RilievoFormStart => formStart(user, formValuesFromScheda(scheda));

/** @deprecated the values alone — use newForm (it carries `auto` and the discrepancies too). */
export const newFormValues = (user: SessionUser, today: string = businessDay()): FormValues => newForm(user, today).values;

/** @deprecated the values alone — use editForm (it carries `auto` and the discrepancies too). */
export const editFormValues = (user: SessionUser, scheda: SchedaFull): FormValues => editForm(user, scheda).values;

/** The linked data for the browser (collegati-client.ts, prefill-client.ts): the links, their names, who writes. */
export const collegatiData = (user: SessionUser): CollegatiDati => collegatiPerBrowser(rilieviTranslator(), contestoOf(user));

/** The sections of the form in the company's order (Company.ordineSezioni; «impianto» first): of the edited sheet's
 *  company, or of the user's for a new one. */
export async function formSections(user: SessionUser, scheda?: SchedaFull | null): Promise<SectionKey[]> {
  const ordine = scheda ? scheda.company.ordineSezioni : await ordineSezioniDi(user.companyId);
  return sezioniOrdinate(SECTIONS, ordine).map((section) => section.key);
}

/** The sheet's page: its sections in the company's order and what the sheet and its modules say differently (saved with
 *  the confirmation, or from before the check — shown after the save too). */
export function sheetView(scheda: SchedaFull, t: RilieviT = rilieviTranslator()): { sections: DisplaySection[]; discrepanze: Discrepanza[] } {
  return { sections: displaySections(scheda, t, scheda.company.ordineSezioni), discrepanze: discrepanzeDi(formValuesFromScheda(scheda), t) };
}

/** The sheet's print: its sections in the company's order, those printed under the head (without «Impianto» — it is in
 *  the head and the plate), and what is filled in the modules when the sheet asks for it (`riepilogoOrdini`). */
export function printView(scheda: SchedaFull, t: RilieviT = rilieviTranslator()): { sections: DisplaySection[]; printed: DisplaySection[]; riepilogo: RiepilogoModulo[] } {
  const sections = displaySections(scheda, t, scheda.company.ordineSezioni);
  return { sections, printed: sections.filter((section) => !FISSE.includes(section.key)), riepilogo: riepilogoModuli(scheda) };
}

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

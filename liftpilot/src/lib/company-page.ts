// What the company page (/app/company) shows whom (round 42; the order of the survey sheet's sections, round 43). The page
// is there for a role that holds 'company:export' or 'company:edit' — holds, whatever the subscription: a company in
// read-only mode keeps its page, so a Capotecnico given only 'company:edit' learns there why nothing changes (the logo's
// note, the order shown without arrows), instead of a page saying his role lacks the export (/app/permesso). The menu's
// link follows the same rule. The logo: its form, or why not (read-only mode, or no right); the order of the sections:
// moved and saved, or only shown (read-only mode), or not there; the export: whoever may download it.
import { can, holds, type Principal } from './rbac';

export interface CompanyPageView {
  /** the panel with the company's data in one JSON file */
  exports: boolean;
  /** the logo's form, or the note that says why it cannot be changed (messages `tavole.logoReadOnly|logoNoRight`) */
  logo: 'form' | 'readOnly' | 'noRight';
  /** the order of the survey sheet's sections: with the arrows, shown only, or no panel */
  sezioni: 'edit' | 'view' | null;
}

/** The page as the user sees it, or null when it is not the user's (the page then calls denied(…, 'company:export')). */
export function companyPageView(who: Principal): CompanyPageView | null {
  const exports = can(who, 'company:export'), sets = holds(who, 'company:edit'), edits = can(who, 'company:edit');
  if (!exports && !sets) return null;
  return {
    exports,
    logo: edits ? 'form' : sets ? 'readOnly' : 'noRight',
    sezioni: edits ? 'edit' : sets ? 'view' : null,
  };
}

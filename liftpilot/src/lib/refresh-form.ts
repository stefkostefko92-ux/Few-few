// The mark with which «Aggiorna con il software attuale» opens a record's form when what was entered no longer saves
// with the running engines (src/server/refresh-actions.ts): the form then says so at its top (RefreshNotice). Opening the
// same record in its form from its page carries no mark.

/** The query of the form opened that way, to append to its address. */
export const REFRESH_QUERY = 'aggiorna=1';

/** Whether the form was opened that way (its search parameters). */
export const openedByRefresh = (sp: { aggiorna?: string | string[] }): boolean => sp.aggiorna === '1';

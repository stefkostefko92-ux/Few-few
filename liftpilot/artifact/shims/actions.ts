// The server actions in the standalone page: there is no server and nothing is stored (no draft either: the forms get
// no draft target). The save bars are hidden; a call that still arrives gets the app's "not allowed" answer.
type Refused = { ok: false; error: 'forbidden'; fields?: string[] };
const refused = async (): Promise<Refused> => ({ ok: false, error: 'forbidden' });

export const saveCalculationAction = refused;
export const saveLiftDesignAction = refused;
export const saveDraftAction = refused;
export const discardDraftAction = refused;

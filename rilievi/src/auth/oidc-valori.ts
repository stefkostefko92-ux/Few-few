/**
 * Стойностите на входа с доставчика на самоличност (D1), без мрежа и база: какво приема настройката на
 * фирмата и как се строи издателят на директорията на Microsoft. Строго — каквото не е точно това, е null.
 */

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Директорията на личните акаунти на Microsoft (outlook.com, hotmail) и нулевият GUID — не са директория на
 * фирма: с тях всеки личен акаунт би минал за „на фирмата“.
 */
const NON_AZIENDALI = new Set([
  '9188040d-6c67-4c5b-b112-36a304b66dad',
  '00000000-0000-0000-0000-000000000000',
]);

/** Tenant ID на Microsoft Entra: GUID, с малки букви; домейн, `common`, `organizations` — не. */
export function tenantDa(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return GUID.test(v) && !NON_AZIENDALI.has(v) ? v : null;
}

const DOMINIO = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Личните пощи на Google — не са Workspace на фирма (токенът им и без това е без `hd`). */
const NON_WORKSPACE = new Set(['gmail.com', 'googlemail.com']);

/** Домейнът на Google Workspace: име на хост с малки букви („@“ отпред се маха); имейл или адрес — не. */
export function dominioDa(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/^@/, '');
  return v.length <= 253 && DOMINIO.test(v) && !NON_WORKSPACE.has(v) ? v : null;
}

/** Издателят на токен от директорията `tid` (Microsoft v2.0): `<authority>/<tid>/v2.0`. */
export function issuerMicrosoft(authority: string, tid: string): string | null {
  return GUID.test(tid) ? `${authority}/${tid}/v2.0` : null;
}

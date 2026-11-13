// backend/src/lib/publicApiQuery.js
// А8: валидация на заявките към публичния API — 400, не 500.
// Преди: `limit=abc` → NaN в `take` (Prisma хвърля → 500), `offset=-1` → 500,
// непознат `status` → 500 от enum-а, лоша дата → Invalid Date → 500.

/** @returns {{ok:true,limit:number,offset:number}|{ok:false,error:string}} */
export function parsePaging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const num = (v, def) => (v === undefined ? def : (/^\d{1,9}$/.test(String(v)) ? Number(v) : NaN));
  const limit = num(query.limit, defaultLimit);
  const offset = num(query.offset, 0);
  if (!Number.isInteger(limit) || limit < 1) return { ok: false, error: "limit must be an integer between 1 and " + maxLimit };
  if (!Number.isInteger(offset)) return { ok: false, error: "offset must be an integer >= 0" };
  return { ok: true, limit: Math.min(limit, maxLimit), offset };
}

/** undefined/"" → null (без филтър); непозната стойност → { error }. */
export function parseEnum(value, allowed, name = "status") {
  if (value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !allowed.includes(value)) return { ok: false, error: `${name} must be one of: ${allowed.join(", ")}` };
  return { ok: true, value };
}

/** Валидна календарна дата (ISO) или { error }. */
export function parseDate(value, name = "date") {
  if (value === undefined || value === "") return { ok: true, value: null };
  const d = new Date(String(value));
  if (typeof value !== "string" || Number.isNaN(d.getTime())) return { ok: false, error: `${name} must be a valid date (YYYY-MM-DD)` };
  return { ok: true, value: d };
}

/** expiresInDays: цяло 1..3650, или липсва (без изтичане). */
export function parseExpiresInDays(v) {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 3650) return { ok: false, error: "expiresInDays must be an integer between 1 and 3650" };
  return { ok: true, value: v };
}

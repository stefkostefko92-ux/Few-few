/**
 * Алармите на портала към Discord (собственикът, 12 ноември 2026 — „точка 1 ще го направим чрез дискорд webhook“).
 * Официалният „Execute Webhook“: `POST /webhooks/{id}/{token}` с JSON `content` (до 2000 знака) и
 * `allowed_mentions`; с `?wait=true` Discord потвърждава, че съобщението е записано. Адресът съдържа токена — той е
 * тайна: не влиза в лог, одит или страница. Вика се само discord.com (формата се проверява) — друг хост никога.
 */
const FORMA =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,200}$/;

/** Адресът на webhook-а, ако е на Discord; иначе null. */
export function urlDiscord(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length <= 400 && FORMA.test(v) ? v : null;
}

/** Видовете аларми — ЕДИНСТВЕНИЯТ списък (текстовете: `locales/it/allarmi.json`, `allarmi.testo.<вид>`). */
export const TIPI_ALLARME = [
  'prova',
  'manutenzione',
  'pagamentoDaVerificare',
  'contestazione',
  'rimborsoFallito',
  'posta',
  'segnalazione',
] as const;
export type TipoAllarme = (typeof TIPI_ALLARME)[number];

/** Най-много толкова знака отиват в едно съобщение (таванът на Discord е 2000). */
export const MAX_TESTO = 1900;

/**
 * Праща съобщението. Връща HTTP кода на Discord или „rete“ (мрежа, таймаут, пренасочване); никога не хвърля.
 * `base` — само за тестовете (фалшивият Discord): заменя произхода, пътят на webhook-а остава.
 */
export async function inviaDiscord(
  url: string,
  testo: string,
  opzioni: { base?: string | undefined; attendi?: boolean; timeoutMs?: number } = {},
): Promise<number | 'rete'> {
  const valido = urlDiscord(url);
  if (!valido) return 'rete';
  const u = new URL(valido);
  const destinazione = `${opzioni.base ?? u.origin}${u.pathname}${opzioni.attendi ? '?wait=true' : ''}`;
  try {
    const res = await fetch(destinazione, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Без споменавания: текстът не може да извика @everyone или роля.
      body: JSON.stringify({ content: testo.slice(0, MAX_TESTO), allowed_mentions: { parse: [] } }),
      redirect: 'error',
      signal: AbortSignal.timeout(opzioni.timeoutMs ?? 8000),
    });
    await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch {
    return 'rete';
  }
}

/**
 * Колко често може да тръгне един вид аларма (ms): паднала поща или стъпка на поддръжката не пълнят канала —
 * едно съобщение, после тишина до изтичането. Пробата от конзолата не се брои.
 */
export const PAUSA_MS: Record<TipoAllarme, number> = {
  prova: 0,
  manutenzione: 6 * 60 * 60_000,
  pagamentoDaVerificare: 10 * 60_000,
  contestazione: 10 * 60_000,
  rimborsoFallito: 10 * 60_000,
  posta: 6 * 60 * 60_000,
  segnalazione: 10 * 60_000,
};

/** Може ли да тръгне сега; ако да — записва момента. Без база: паметта на процеса. */
export function puoPartire(
  ultimi: Map<TipoAllarme, number>,
  tipo: TipoAllarme,
  adesso: number,
): boolean {
  const prima = ultimi.get(tipo);
  if (prima !== undefined && adesso - prima < PAUSA_MS[tipo]) return false;
  ultimi.set(tipo, adesso);
  return true;
}

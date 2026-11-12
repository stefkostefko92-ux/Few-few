import { Prisma } from '@prisma/client';

/**
 * Форматът на износа на фирмата (`dati.json` в .tar-а) — ЕДИНСТВЕНОТО описание: износът (esportazione.ts)
 * чете с тези select-и и подрежда по `SEZIONI_DATI`, а публичната страница `/esportazione` (чл. 26 Data Act;
 * Allegato B, B.9) изброява същите полета. Ново поле в select-а излиза и на страницата; нов раздел иска и
 * описанието си в речника (тестът го хваща). Без тайни: пароли, ключове на 2FA, токени и HMAC-и не са тук.
 */
export const FORMATO_ESPORTAZIONE = 'rilievi-impianti/esportazione-1';

/** Разделите на `dati.json` в реда им. */
export const SEZIONI_DATI = [
  'formato',
  'esportatoIl',
  'azienda',
  'persone',
  'inviti',
  'schede',
  'interventi',
  'cartelli',
  'calcoliArgano',
  'calcoliLimitatore',
  'verbali',
  'buoni',
  'preventivi',
  'listino',
  'fornitori',
  'ordini',
  'registro',
] as const;
export type SezioneDati = (typeof SEZIONI_DATI)[number];

export const SELECT_AZIENDA = {
  id: true,
  name: true,
  datiSocietari: true,
  ordineSezioni: true,
  schizzi: true,
  cartelloModello: true,
  nomiRuoli: true,
  permessiRuoli: true,
  logo: true,
  logoType: true,
  informativaFirme: true,
  approvazioneSchede: true,
  buonoCodice: true,
  buonoClausola: true,
  preventiviAttivi: true,
  preventiviNumero: true,
  preventivoCondizioni: true,
  createdAt: true,
  deactivatedAt: true,
} as const satisfies Prisma.AziendaSelect;

/** Човекът — без хеша на паролата, тайната на 2FA, сесиите и броячите на заключването. */
export const SELECT_PERSONA = {
  id: true,
  name: true,
  email: true,
  theme: true,
  colori: true,
  createdAt: true,
  deactivatedAt: true,
  lastLoginAt: true,
} as const satisfies Prisma.UserSelect;

/** Неприетите покани — без токена (той е ключ, не данни). */
export const SELECT_INVITO = {
  email: true,
  name: true,
  role: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const satisfies Prisma.InviteSelect;

export const SELECT_ALLEGATO = {
  id: true,
  schedaId: true,
  sezione: true,
  tipo: true,
  stato: true,
  didascalia: true,
  nomeOriginale: true,
  inStampa: true,
  ordineStampa: true,
  annotazioni: true,
  caricatoDaId: true,
  createdAt: true,
} as const satisfies Prisma.AllegatoSelect;

export const SELECT_FORNITORE = {
  nome: true,
  email: true,
  createdAt: true,
} as const satisfies Prisma.FornitoreSelect;

export const SELECT_VERSIONE = {
  numero: true,
  at: true,
  autoreId: true,
  dati: true,
} as const satisfies Prisma.SchedaVersioneSelect;

/** Подписите на „Buono di lavoro“ — щрихите, отпечатъците и печатът (без връзката към листа: те са в него). */
export const SELECT_FIRMA_BUONO = {
  posto: true,
  tratti: true,
  hash: true,
  impronta: true,
  sigillo: true,
  firmatoAt: true,
  firmatoDaId: true,
} as const satisfies Prisma.BuonoFirmaSelect;

export const SELECT_REGISTRO = {
  at: true,
  actorId: true,
  action: true,
  targetType: true,
  targetId: true,
  meta: true,
} as const satisfies Prisma.AuditLogSelect;

/** Скаларните полета на модел, както Prisma ги чете (цялата таблица — картата, листовете…). */
function campiDi(modello: string): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modello);
  if (!m) throw new Error(`formato: модел ${modello}`);
  return m.fields.filter((f) => f.kind !== 'object').map((f) => f.name);
}

const chiavi = (select: Record<string, boolean>): string[] => Object.keys(select);

/**
 * Полетата на всеки раздел, както са в `dati.json` — за страницата `/esportazione`. Картата и другите
 * цели таблици — от схемата; изчистените — от select-ите горе (логото е името на файла в архива).
 */
export function campiEsportati(): Record<SezioneDati, string[]> {
  return {
    formato: [],
    esportatoIl: [],
    azienda: chiavi(SELECT_AZIENDA).filter((k) => k !== 'logoType'),
    persone: [...chiavi(SELECT_PERSONA), 'ruolo', 'nellAziendaDal'],
    inviti: chiavi(SELECT_INVITO),
    schede: [...campiDi('Scheda'), 'misureBottoniere', 'schizzi', 'allegati', 'versioni'],
    interventi: campiDi('Intervento'),
    cartelli: campiDi('Cartello'),
    calcoliArgano: campiDi('CalcoloArgano'),
    calcoliLimitatore: campiDi('CalcoloLimitatore'),
    verbali: campiDi('Verbale'),
    buoni: [...campiDi('BuonoLavoro'), 'firme'],
    preventivi: campiDi('Preventivo'),
    listino: campiDi('VoceListino'),
    fornitori: chiavi(SELECT_FORNITORE),
    ordini: campiDi('OrdineFornitore'),
    registro: chiavi(SELECT_REGISTRO),
  };
}

/** Под-списъците на картата: мерките по спирки, листовете на скицника, снимките и клиповете. */
export function campiSchedaFigli(): Record<
  'misureBottoniere' | 'schizzi' | 'allegati' | 'versioni',
  string[]
> {
  return {
    misureBottoniere: campiDi('MisuraBottoniera'),
    schizzi: campiDi('Schizzo'),
    allegati: [...chiavi(SELECT_ALLEGATO), 'file'],
    versioni: chiavi(SELECT_VERSIONE),
  };
}

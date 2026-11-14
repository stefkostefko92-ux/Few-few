import { z } from 'zod';

/**
 * Точките на листа за интервенция — дословно от хартиения блок „Servizio assistenza elevatori · Modulo di
 * pronto intervento“ (снимката на собственика, 30 октомври 2026), със същите номера, групи и празни места.
 * Италиански, не се превеждат. `{q}` е празното място в реда („n. ……“, „lt ……“, „piano ……“): `n` — бройка
 * или количество (късо), `testo` — свободен текст. 84 има и двете отметки „C“ (кабина) и „P“ (етаж).
 */
export interface Voce {
  n: number;
  testo: string;
  campo?: 'n' | 'testo';
  scelte?: readonly string[];
}

export interface GruppoVoci {
  titolo: string;
  voci: readonly Voce[];
}

const v = (n: number, testo: string, campo?: Voce['campo']): Voce =>
  campo ? { n, testo, campo } : { n, testo };

export const GRUPPI_VOCI: readonly GruppoVoci[] = [
  {
    titolo: 'Quadro di manovra',
    voci: [
      v(1, 'Raddrizzatore di corrente sul quadro di manovra'),
      v(2, 'Bobina relè di piano sul quadro di manovra'),
      v(3, 'Trasformatore di corrente sul quadro elettrico'),
      v(4, 'Alimentatore 12V 1.2A per riattivazione allarme'),
      v(5, 'Relè di piano n. {q}', 'n'),
      v(6, 'Fusibili previa eliminazione corto-circuito n. {q}', 'n'),
      v(7, 'Condensatore previa riparazione temporizzatore'),
      v(8, 'Riparazione teleruttore F.M. posa di nuova reciproca'),
      v(9, 'Teleruttore sul quadro elettrico di manovra n. {q}', 'n'),
      v(10, 'Reciproca sul quadro elettrico di manovra n. {q}', 'n'),
      v(11, 'Salvamotore n. {q}', 'n'),
      v(12, 'Conduttore supplementare (da quadro a cabina)'),
      v(13, 'Collegamento conduttore di scorta'),
      v(14, 'Micro relè Finder da 80V.'),
    ],
  },
  {
    titolo: 'Cabina mobile',
    voci: [
      v(21, 'Contatto elettrico arcata sul tetto cabina'),
      v(22, 'Cerniere in ottone alla porta di cabina n. {q}', 'n'),
      v(23, 'Contatto elettrico circuito portine n. {q}', 'n'),
      v(24, 'Ripristino luce, riparazione portalampada, nuovo neon'),
      v(25, 'Plafoniera a norma in materiale anti-urto'),
      v(26, 'Pavimentazione in linoleum previo restauro'),
      v(27, 'Riparazione portine opere falegnameria posa contatore elettrico'),
      v(28, 'Regolazione portine e posa di spessore gomma/ottone'),
      v(29, 'Molla di richiamo portine e regolazione n. {q}', 'n'),
    ],
  },
  {
    titolo: 'Porte',
    voci: [
      v(31, 'Revisione serratura di piano con sostituzione blocco'),
      v(32, 'Riparazione bottoniera di piano con sostituzione contatti'),
      v(33, 'Sostituzione contatto a ponte rotto sulla serratura'),
      v(34, 'Sistemazione cerniere e regolazione serratura'),
      v(35, 'Serratura elettromeccanica di piano completa'),
      v(36, 'Gomma per abbinamento porte'),
      v(37, 'Lampadine per segnalazioni luminose n. {q}', 'n'),
      v(38, "Carrucola di perlon per l'operatore porte n. {q}", 'n'),
      v(39, 'Ammortizzatore tipo dictator n. {q}', 'n'),
      v(40, 'Molla di richiamo per porte di piano n. {q}', 'n'),
      v(41, 'Leva completa di rotella alla serratura'),
      v(42, 'Ammortizzatore tipo speciale {q}', 'testo'),
      v(43, 'Revisione operatore con pulizia ingranaggi'),
      v(
        44,
        'Revisione sospensione porta automatica con sostituzione contatto di blocco: piano {q}',
        'testo',
      ),
      v(45, 'Revisione contatti portine'),
      v(46, 'Sostituzione n. {q} pattini di scorrimento antine di cabina/piano', 'n'),
      v(47, 'Leva serratura'),
      v(48, 'Sostituzione - Riparazione fotocellula porte cabina'),
    ],
  },
  {
    titolo: 'Vano',
    voci: [
      v(51, 'Campana badenia per segnalazione acustica'),
      v(52, 'Sirena elettronica per segnalazione acustica'),
      v(53, 'Guarnizioni scorrimento in perlon alla cabina n. {q}', 'n'),
      v(54, 'Guarnizioni scorrimento in perlon al c/peso n. {q}', 'n'),
      v(55, 'Invertitore di fermata al piano'),
      v(56, 'Impulsore magnetico per controllo selettore n. {q}', 'n'),
      v(57, 'Riparazione invertitore, posa di carrucola e contatti'),
      v(58, 'Sostituzione bottoniera di manutenzione sul tetto cabina'),
      v(59, 'Fornitura di olio idraulico centralina oleodinamica lt {q}', 'n'),
      v(60, 'Eseguita sostituzione olio argano (lt {q}) con smaltimento olio esausto', 'n'),
      v(61, 'Interruttore di stop fossa/tetto cabina/locale rinvio'),
      v(62, 'Contatto microswitch per operatore porte'),
      v(63, 'Dispositivi Oliostop n. {q}', 'n'),
      v(64, 'Tamponi assorbenti atti al raccoglimento del lubrif. esausto in fossa n. {q}', 'n'),
    ],
  },
  {
    titolo: 'Locale argano + vari',
    voci: [
      v(71, 'Cartello con dicitura fuori servizio impianto n. {q}', 'n'),
      v(72, 'Cartello istruzioni manovra a mano'),
      v(73, 'Regolazione freno causa dislivello'),
      v(74, 'Cartelli sicurezza sulla porta locale ascensore n. {q}', 'n'),
      v(75, 'Lampada portatile a norma di legge'),
      v(76, 'Ferodi, montaggio/trasporto/rimontaggio ceppi'),
      v(77, "Cuscinetto reggispinta all'argano di trazione"),
      v(78, 'Disinfestazione, pulizia e smaltimento fossa ascensore'),
      v(79, 'Bloccaggio impianto ed accorciatura funi di trazione'),
      v(80, 'Riattivato impianto causa sovraccarico'),
      v(81, 'Riattivato impianto causa apertura anticipata portine'),
      v(82, 'Ascensore funzionante'),
      v(83, 'Vetrino di protezione interruttore fm'),
      {
        n: 84,
        testo: 'Pulsante di chiamata alla bottoniera {q}',
        campo: 'testo',
        scelte: ['C', 'P'],
      },
      v(85, 'Targa con recapito ditta manutentrice n. {q}', 'n'),
      v(86, 'Targa ENTE con dati impianto incisi'),
      v(87, 'Cassetta portachiavi completa di chiavi'),
      v(88, 'Riordino libretto immatricolazione con aggiunta fascicolo'),
      v(89, 'Lucchetto yale alla porta locale ascensore'),
      v(
        90,
        "Assistenza Tecnica all'Ingegnere dell'Organismo Notificato durante l'esecuzione della Verifica Periodica/Straordinaria",
      ),
      v(
        91,
        'Esecuzione della Verifica Semestrale come previsto al capo II art. 19.4 del DPR 29.05.1963 n.1497 e al capo II art. 15.4 del DPR 30.04.1999 n.162',
      ),
      v(92, 'Alimentatore per teleallarme'),
      v(93, 'Falso allarme combinatore telefonico: tasto premuto da ignoti'),
      v(94, 'Liberato persona intrappolata in cabina'),
      v(95, 'Cassetta portadocumenti completa di chiavi'),
      v(96, 'Revisione completa teleallarme'),
      v(97, 'Manutenzione periodica'),
    ],
  },
];

export const VOCI: readonly Voce[] = GRUPPI_VOCI.flatMap((gruppo) => gruppo.voci);

/** „05“ — номерът, както е на листа (две цифри); и ключът в записа. */
export const codiceVoce = (n: number): string => String(n).padStart(2, '0');

/** Таваните на празното място: бройка или литри — 12 знака, текст — 40 (на листа редът е един). */
export const MAX_CAMPO: Readonly<Record<NonNullable<Voce['campo']>, number>> = { n: 12, testo: 40 };

/** Отметнатото на един ред: отметката, текстът на празното място, „C“/„P“ на 84. */
export interface ValoreVoce {
  x?: true;
  q?: string;
  c?: string[];
}

export type ValoriVoci = Record<string, ValoreVoce>;

/** Без управляващи знаци, интервалите събрани — текстът на ред от листа е на един ред. */
const riga = (value: string): string =>
  value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Записаното в базата (или пратеното от формата, вече в този вид) — само познатите номера, само
 * позволеното за реда; празното отпада. Каквото не пасва, се маха, не дава грешка: в базата идва само
 * оттук, а формата праща полетата си поотделно (`dalForm`).
 */
export function valoriVoci(raw: unknown): ValoriVoci {
  const out: ValoriVoci = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const record = raw as Record<string, unknown>;
  for (const voce of VOCI) {
    const key = codiceVoce(voce.n);
    if (!Object.hasOwn(record, key)) continue;
    const parsed = valoreSchema.safeParse(record[key]);
    if (!parsed.success) continue;
    const value: ValoreVoce = {};
    if (parsed.data.x === true) value.x = true;
    const q =
      voce.campo && parsed.data.q ? riga(parsed.data.q).slice(0, MAX_CAMPO[voce.campo]) : '';
    if (q) value.q = q;
    const c = (parsed.data.c ?? []).filter(
      (s, i, all) => voce.scelte?.includes(s) && all.indexOf(s) === i,
    );
    if (c.length) value.c = c;
    if (value.x || value.q || value.c) out[key] = value;
  }
  return out;
}

const valoreSchema = z.object({
  x: z.boolean().optional(),
  q: z.string().max(400).optional(),
  c: z.array(z.string().max(4)).max(4).optional(),
});

/** Формата: `v-05` (отметката, „si“), `q-05` (празното място), `c-84` („C“, „P“). Таваните — грешка. */
export function vociDalForm(
  body: Record<string, unknown>,
): { ok: true; voci: ValoriVoci } | { ok: false; errors: Record<string, 'tooLong' | 'invalid'> } {
  const raw: Record<string, ValoreVoce> = {};
  const errors: Record<string, 'tooLong' | 'invalid'> = {};
  for (const voce of VOCI) {
    const key = codiceVoce(voce.n);
    const tick = body[`v-${key}`];
    const q = body[`q-${key}`];
    const c = body[`c-${key}`];
    if (tick !== undefined && tick !== 'si') errors[`v-${key}`] = 'invalid';
    if (q !== undefined && typeof q !== 'string') errors[`q-${key}`] = 'invalid';
    if (voce.campo && typeof q === 'string' && riga(q).length > MAX_CAMPO[voce.campo])
      errors[`q-${key}`] = 'tooLong';
    const scelte = c === undefined ? [] : Array.isArray(c) ? c : [c];
    if (scelte.some((s) => typeof s !== 'string' || !voce.scelte?.includes(s)))
      errors[`c-${key}`] = 'invalid';
    const value: ValoreVoce = {};
    if (tick === 'si') value.x = true;
    if (voce.campo && typeof q === 'string') value.q = q;
    if (voce.scelte) value.c = scelte.filter((s): s is string => typeof s === 'string');
    raw[key] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, voci: valoriVoci(raw) };
}

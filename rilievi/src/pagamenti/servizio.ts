import { allarme } from '../allarmi/servizio.js';
import { writeAudit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conservaFinoDa } from '../legale/emissioni.js';
import { sigilloDi } from '../legale/sigillo.js';
import { versioneContratto } from '../legale/versioni.js';
import { logger } from '../logger.js';
import type { SessionUser } from '../types.js';
import { clienteAttivo, leggiConfig, originiCheckout } from './config.js';
import { preparaOfferta, type Dichiarati } from './prepara-offerta.js';
import { riconcilia, segnaFallito } from './riconcilia.js';
import { creaOrdine, ErroreRevolut } from './revolut.js';
import { AVVISO_SOGLIA_PERCENTO, entroSoglia, quotaSoglia, venditeSenzaVies } from './soglia.js';
import { verificaPartitaIva } from './vies-ordine.js';

/**
 * Плащането на план (#31; условията 2026-11-12, чл. 12): офертата се записва и запечатва (чл. 19.1 a) ПРЕДИ
 * Revolut; сумата — от плана на сървъра; поръчката в Revolut носи нашия id. Периодът се дава САМО за поръчка,
 * прочетена обратно от Revolut като `completed` със същата сума и валута — при връщането на човека, от
 * подписания webhook или от поддръжката — веднъж (редът на плащането и на фирмата `FOR UPDATE`, условно
 * „IN_ATTESA“). Планът, купен по време на пробата или на друг план, започва от края им (чл. 12.3). Режимът на
 * ДДС за фирма от друга държава от ЕС го решава VIES в този момент (чл. 12.10; pagamenti/vies-ordine.ts): валиден
 * номер — обратно начисляване; невалиден — 20 % български ДДС, докато тези продажби са под прага (soglia.ts);
 * офертата със сменен режим се показва наново и се приема отново.
 */

type T = (key: string, p?: Record<string, string | number>) => string;

/** Полетата на запечатания запис на приетата оферта (src/legale/sigillo.ts) — в този ред. */
export const CAMPI_OFFERTA = [
  'at',
  'userId',
  'userNome',
  'userEmail',
  'aziendaId',
  'aziendaNome',
  'ragioneSociale',
  'sede',
  'partitaIva',
  'livello',
  'mesi',
  'imponibileCent',
  'ivaCent',
  'totaleCent',
  'versione',
  'hash',
  'ip',
  'userAgent',
  'pagamentoId',
] as const;

export type EsitoAvvio =
  | { ok: true; checkoutUrl: string }
  | {
      ok: false;
      errore:
        | 'spenti'
        | 'piano'
        | 'persone'
        | 'revolut'
        | 'inCoda'
        | 'manuale'
        | 'viesNonDisponibile'
        | 'viesNonValida'
        | 'viesSoglia';
    }
  /** Офертата вече не е тази, която човекът е видял; `senzaVies` — новата е с 20 % ДДС (номерът не е във VIES). */
  | { ok: false; errore: 'cambiata'; senzaVies: boolean }
  /** Друго плащане на фирмата още е отворено в Revolut: връзката му и до кога (после може ново). */
  | { ok: false; errore: 'inAttesa'; checkoutUrl: string | null; fino: Date };

/** Колко е отворена поръчката в Revolut (`expire_pending_after` PT1H) — толкова не се пуска втора. */
const ATTESA_MS = 60 * 60_000;

export async function avviaPagamento(
  t: T,
  user: SessionUser,
  aziendaId: string,
  pianoId: string,
  dichiarati: Dichiarati,
  ctx: { ip: string | null; userAgent: string | null },
  /** Отпечатъкът на офертата, която човекът е видял и приел (скритото поле на формата). */
  hashVisto: string,
): Promise<EsitoAvvio> {
  const cli = await clienteAttivo();
  if (!cli) return { ok: false, errore: 'spenti' };
  const piano = await prisma.pianoAbbonamento.findFirst({ where: { id: pianoId, attivo: true } });
  if (!piano) return { ok: false, errore: 'piano' };
  const now = new Date();
  // Отворените поръчки на фирмата от последния час: първо какво казва Revolut за тях (платена, отказана,
  // изтекла) — платена току-що дава периода си сега, и офертата се смята върху него.
  const aperti = await prisma.pagamento.findMany({
    where: {
      aziendaId,
      stato: 'IN_ATTESA',
      createdAt: { gt: new Date(now.getTime() - ATTESA_MS) },
    },
    select: { id: true },
    take: 5,
  });
  for (const a of aperti) await riconcilia(a.id);
  // Режимът на ДДС преди офертата — сумата зависи от него: VIES решава сега (или отворената поръчка за същата
  // оферта вече го носи). VIES не отговаря — нищо не се продава.
  const iva = await verificaPartitaIva(
    aziendaId,
    hashVisto,
    dichiarati.partitaIva,
    new Date(now.getTime() - ATTESA_MS),
  );
  if (!iva.ok) return { ok: false, errore: iva.errore };
  if (iva.senzaVies && !iva.gia) {
    // Изключено от MASTER: с номер извън VIES не се продава онлайн (както до версия 4.0).
    if (!(await leggiConfig()).senzaVies) return { ok: false, errore: 'viesNonValida' };
    // Продажбите с български ДДС на клиенти извън VIES — само под прага по чл. 59в от Дир. 2006/112.
    const vendite = await venditeSenzaVies(now);
    const dopo = { ...vendite, corrente: vendite.corrente + piano.prezzoCent };
    if (!entroSoglia(vendite, piano.prezzoCent)) {
      void allarme('sogliaIva');
      return { ok: false, errore: 'viesSoglia' };
    }
    if (quotaSoglia(dopo) >= AVVISO_SOGLIA_PERCENTO) void allarme('sogliaIva');
  }
  const pronta = await preparaOfferta(t, user, aziendaId, piano, dichiarati, now, iva.senzaVies);
  const { azienda, offerta, basta } = pronta;
  // „Без срок“ (фирмите отпреди — чл. 12.8) не купува: планът би въвел срок, който още не важи за нея.
  if (!offerta)
    return { ok: false, errore: pronta.errore === 'senzaScadenza' ? 'piano' : pronta.errore };
  if (!basta) return { ok: false, errore: 'persone' };
  // Запечатва се само офертата, която човекът е видял (чл. 12.1): друга (сменени данни, ДДС, ден) — наново.
  if (hashVisto !== offerta.hash)
    return { ok: false, errore: 'cambiata', senzaVies: iva.senzaVies };
  const periodo = pronta.periodo;
  type Creato =
    | { tipo: 'riusa'; checkoutUrl: string }
    | { tipo: 'cambiata' }
    | { tipo: 'soglia' }
    | { tipo: 'attesa'; checkoutUrl: string | null; fino: Date }
    | { tipo: 'nuovo'; pagamento: { id: string } };
  const creato = await prisma.$transaction(async (tx): Promise<Creato> => {
    // Редът на фирмата е заключен: две „Accetta e paga“ едновременно не отварят две поръчки.
    await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${aziendaId} FOR UPDATE`;
    const aperto = await tx.pagamento.findFirst({
      where: {
        aziendaId,
        stato: 'IN_ATTESA',
        createdAt: { gt: new Date(now.getTime() - ATTESA_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { offertaHash: true, checkoutUrl: true, ambiente: true, createdAt: true },
    });
    if (aperto) {
      // Второ „Accetta e paga“ на същата оферта (назад, втори раздел) — същата поръчка, не втора.
      if (
        aperto.offertaHash === offerta.hash &&
        aperto.ambiente === cli.ambiente &&
        aperto.checkoutUrl
      )
        return { tipo: 'riusa', checkoutUrl: aperto.checkoutUrl };
      // Друга оферта, докато първата може още да се плати: двете заедно биха дали грешен период (чл. 12.3).
      return {
        tipo: 'attesa',
        checkoutUrl: aperto.checkoutUrl,
        fino: new Date(aperto.createdAt.getTime() + ATTESA_MS),
      };
    }
    // Проверката е била за поръчка, която междувременно е затворена: нова поръчка — с нова проверка.
    if (iva.gia) return { tipo: 'cambiata' };
    if (iva.senzaVies) {
      // Прагът е общ за всички фирми: две такива поръчки едновременно се редят и втората го вижда с първата.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rilievi:soglia-iva'))`;
      if (!entroSoglia(await venditeSenzaVies(now), piano.prezzoCent)) return { tipo: 'soglia' };
    }
    const p = await tx.pagamento.create({
      data: {
        ...(iva.prova ?? {}),
        aziendaId,
        aziendaNome: azienda.name,
        pianoId: piano.id,
        livello: piano.livello,
        mesi: piano.mesi,
        imponibileCent: offerta.importo.imponibile,
        ivaCent: offerta.importo.iva,
        totaleCent: offerta.importo.totale,
        regimeIva: offerta.importo.regime,
        ragioneSociale: dichiarati.ragioneSociale,
        sede: dichiarati.sede,
        partitaIva: dichiarati.partitaIva.numero,
        ambiente: cli.ambiente,
        createdById: user.id,
        offertaHash: offerta.hash,
        inizio: periodo.inizio,
        fine: periodo.fine,
        creditoCent: periodo.credito?.valoreCent ?? 0,
        creditoDa: periodo.credito?.da ?? [],
        baseFino: pronta.campi.abbonamentoFino,
        baseLivello: pronta.campi.abbonamentoLivello,
        baseCambioAt: pronta.campi.abbonamentoCambioAt ?? null,
      },
    });
    const campi = {
      at: now,
      userId: user.id,
      userNome: user.name.slice(0, 120),
      userEmail: user.email,
      aziendaId,
      aziendaNome: azienda.name,
      ragioneSociale: dichiarati.ragioneSociale,
      sede: dichiarati.sede,
      partitaIva: dichiarati.partitaIva.numero,
      livello: piano.livello,
      mesi: piano.mesi,
      imponibileCent: offerta.importo.imponibile,
      ivaCent: offerta.importo.iva,
      totaleCent: offerta.importo.totale,
      versione: versioneContratto(azienda.condizioniVersione),
      hash: offerta.hash,
      ip: ctx.ip?.slice(0, 45) ?? null,
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      pagamentoId: p.id,
    };
    await tx.accettazioneOfferta.create({
      data: {
        ...campi,
        testo: offerta.testo,
        sigillo: sigilloDi(campi, CAMPI_OFFERTA),
        conservaFino: conservaFinoDa(now),
      },
    });
    await writeAudit(
      {
        actorId: user.id,
        action: 'PAGAMENTO_AVVIATO',
        aziendaId,
        targetType: 'pagamento',
        targetId: p.id,
        meta: { livello: piano.livello, mesi: piano.mesi, totaleCent: offerta.importo.totale },
      },
      tx,
    );
    return { tipo: 'nuovo', pagamento: p };
  });
  if (creato.tipo === 'riusa') return { ok: true, checkoutUrl: creato.checkoutUrl };
  if (creato.tipo === 'soglia') {
    void allarme('sogliaIva');
    return { ok: false, errore: 'viesSoglia' };
  }
  if (creato.tipo === 'cambiata')
    return { ok: false, errore: 'cambiata', senzaVies: iva.senzaVies };
  if (creato.tipo === 'attesa')
    return { ok: false, errore: 'inAttesa', checkoutUrl: creato.checkoutUrl, fino: creato.fino };
  const { pagamento } = creato;
  try {
    const ordine = await creaOrdine(cli.c, {
      amount: offerta.importo.totale,
      description:
        `Rilievi Impianti — Premium livello ${piano.livello}, ${piano.mesi} mesi — ${azienda.name}`.slice(
          0,
          200,
        ),
      reference: pagamento.id,
      redirectUrl: `${config().PUBLIC_BASE_URL}/impostazioni/abbonamento/esito/${pagamento.id}`,
    });
    const checkout = new URL(ordine.checkout_url!);
    if (!originiCheckout().includes(checkout.origin)) throw new ErroreRevolut('risposta');
    await prisma.pagamento.update({
      where: { id: pagamento.id },
      data: { revolutOrderId: ordine.id, checkoutUrl: checkout.href },
    });
    return { ok: true, checkoutUrl: checkout.href };
  } catch (error) {
    if (!(error instanceof ErroreRevolut)) throw error;
    logger.warn({ stato: error.stato }, 'revolut: поръчката не се създаде');
    await segnaFallito(pagamento.id, 'FALLITO', user.id);
    return { ok: false, errore: 'revolut' };
  }
}

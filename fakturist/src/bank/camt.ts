import { at, child, children, textAt, type XmlNode } from '../xml/parse.js';
import { dec, isDecimalText, round, toCents } from '../einvoice/decimal.js';
import { isIsoDate } from '../recurring/schedule.js';
import { BankFormatError, MAX_ENTRIES, type BankEntry } from './entries.js';

/**
 * ISO 20022 camt.053 (BkToCstmrStmt, версии .001.02–.001.13 — пространството не се гледа): от всеки
 * Stmt/Ntry се взимат само осчетоводените постъпления (CdtDbtInd = CRDT, без сторно). Запис с няколко
 * TxDtls (сборно постъпление) дава ред за всяка транзакция със своята сума.
 */
function cents(text: string | undefined): bigint | null {
  const value = text?.trim();
  if (!value || !isDecimalText(value)) return null;
  return toCents(round(dec(value), 2));
}

function remittance(tx: XmlNode | undefined, entry: XmlNode): string {
  const rmt = child(tx, 'RmtInf');
  const parts = [
    ...children(rmt, 'Ustrd').map((u) => u.text.trim()),
    ...children(rmt, 'Strd').map((s) => textAt(s, 'CdtrRefInf/Ref') ?? ''),
    textAt(tx, 'AddtlTxInf') ?? '',
    textAt(entry, 'AddtlNtryInf') ?? '',
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function party(tx: XmlNode | undefined): { name?: string; iban?: string } {
  const parties = child(tx, 'RltdPties');
  return {
    name: textAt(parties, 'Dbtr/Nm') ?? textAt(parties, 'Dbtr/Pty/Nm'),
    iban: textAt(parties, 'DbtrAcct/Id/IBAN'),
  };
}

export function readCamt053(root: XmlNode): BankEntry[] {
  const statement = child(root, 'BkToCstmrStmt');
  if (root.name !== 'Document' || !statement) throw new BankFormatError('notCamt');
  const out: BankEntry[] = [];
  for (const stmt of children(statement, 'Stmt')) {
    for (const entry of children(stmt, 'Ntry')) {
      if (textAt(entry, 'CdtDbtInd') !== 'CRDT') continue;
      if (textAt(entry, 'RvslInd') === 'true') continue;
      const status = textAt(entry, 'Sts/Cd') ?? textAt(entry, 'Sts');
      if (status && status !== 'BOOK') continue;
      const booked = (textAt(entry, 'BookgDt/Dt') ?? textAt(entry, 'BookgDt/DtTm') ?? '').slice(
        0,
        10,
      );
      if (!isIsoDate(booked)) continue;
      const amountNode = child(entry, 'Amt');
      const currency = amountNode?.attrs['Ccy'] ?? '';
      const entryRef = textAt(entry, 'AcctSvcrRef') ?? textAt(entry, 'NtryRef');
      const txs = children(entry, 'NtryDtls').flatMap((d) => children(d, 'TxDtls'));
      const txAmount = (tx: XmlNode) =>
        cents(textAt(tx, 'AmtDtls/TxAmt/Amt')) ?? cents(textAt(tx, 'Amt'));
      // Сборно постъпление се разделя само ако всяка транзакция носи своята сума; иначе — цялото.
      const split = txs.length > 1 && txs.every((tx) => txAmount(tx) !== null);
      const parts = split ? txs : [txs[0]];
      for (const [i, tx] of parts.entries()) {
        const amount = split && tx ? txAmount(tx) : cents(amountNode?.text);
        if (amount === null || amount <= 0n) continue;
        const who = party(tx);
        out.push({
          bookingDate: booked,
          amountCents: amount,
          currency: currency.toUpperCase(),
          counterparty: who.name?.slice(0, 200),
          counterpartyIban: who.iban?.replace(/\s/g, '').toUpperCase(),
          remittance: remittance(tx, entry),
          bankRef: (
            textAt(tx, 'Refs/AcctSvcrRef') ??
            textAt(tx, 'Refs/EndToEndId') ??
            (entryRef ? `${entryRef}${split ? `#${i + 1}` : ''}` : undefined)
          )?.slice(0, 100),
        });
        if (out.length > MAX_ENTRIES) throw new BankFormatError('tooMany');
      }
    }
  }
  return out;
}

/** Има ли XML-ът вид на camt.053 (за разпознаване на файла). */
export function isCamt(root: XmlNode): boolean {
  return root.name === 'Document' && at(root, 'BkToCstmrStmt') !== undefined;
}

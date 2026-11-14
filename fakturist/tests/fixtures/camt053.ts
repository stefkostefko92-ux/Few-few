/** Примерно извлечение camt.053.001.08 (ISO 20022) — структурата по стандарта, измислени данни. */
export const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>STMT-2026-11-13</MsgId><CreDtTm>2026-11-13T18:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-1</Id>
      <Acct><Id><IBAN>BG80BNBG96611020345678</IBAN></Id></Acct>
      <Ntry>
        <Amt Ccy="EUR">120.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-11-12</Dt></BookgDt>
        <AcctSvcrRef>REF-001</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <RltdPties><Dbtr><Pty><Nm>Сладкарница Роза ЕООД</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>BG18RZBB91550123456789</IBAN></Id></DbtrAcct></RltdPties>
          <RmtInf><Ustrd>Плащане по фактура 0000000001</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">50.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-11-12</Dt></BookgDt>
        <AcctSvcrRef>REF-002</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">300.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-11-13</Dt></BookgDt>
        <AcctSvcrRef>REF-003</AcctSvcrRef>
        <NtryDtls>
          <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">100.00</Amt></TxAmt></AmtDtls><RmtInf><Ustrd>ф-ра 2 частично</Ustrd></RmtInf></TxDtls>
          <TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">200.00</Amt></TxAmt></AmtDtls><RmtInf><Strd><CdtrRefInf><Ref>INV 0000000003</Ref></CdtrRefInf></Strd></RmtInf></TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">75.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <RvslInd>true</RvslInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-11-13</Dt></BookgDt>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>PDNG</Cd></Sts>
        <BookgDt><Dt>2026-11-13</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

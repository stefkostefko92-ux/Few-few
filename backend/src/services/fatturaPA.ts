import { create } from 'xmlbuilder2';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function generaFatturaPA(fatturaId: string): Promise<string> {
  const f: any = await prisma.fattura.findUnique({ where: { id: fatturaId }, include: { amministratore: true, vociFattura: true } });
  if (!f) throw new Error('Fattura non trovata');
  const ced = { piva: process.env.AZIENDA_PIVA||'12345678901', cf: process.env.AZIENDA_CF||'12345678901', den: process.env.AZIENDA_NOME||'ERP Ascensori', ind: process.env.AZIENDA_INDIRIZZO||'Via Roma 1', cap: process.env.AZIENDA_CAP||'20100', com: process.env.AZIENDA_CITTA||'Milano', prov: process.env.AZIENDA_PROVINCIA||'MI' };
  const c = f.amministratore || {};
  const netto = Number(f.totaleNetto||0), iva = Number(f.totaleIva||0), lordo = Number(f.totaleLordo||0);
  const data = new Date(f.data||f.createdAt).toISOString().split('T')[0];
  const voci = f.vociFattura?.length ? f.vociFattura : [{ descrizione: f.oggetto||'Servizio', quantita: 1, prezzoUnitario: netto, iva: 22, totale: netto }];

  const x = create({ version: '1.0', encoding: 'UTF-8' }).ele('p:FatturaElettronica', { 'xmlns:p': 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2', versione: 'FPR12' });
  const h = x.ele('FatturaElettronicaHeader');
  const dt = h.ele('DatiTrasmissione');
  dt.ele('IdTrasmittente').ele('IdPaese').txt('IT').up().ele('IdCodice').txt(ced.piva);
  dt.ele('ProgressivoInvio').txt('00001'); dt.ele('FormatoTrasmissione').txt('FPR12');
  dt.ele('CodiceDestinatario').txt(c.codiceDestinatario||'0000000');
  if(!c.codiceDestinatario && (c.pec||c.email)) dt.ele('PECDestinatario').txt(c.pec||c.email);
  const cp = h.ele('CedentePrestatore'); const da1 = cp.ele('DatiAnagrafici');
  da1.ele('IdFiscaleIVA').ele('IdPaese').txt('IT').up().ele('IdCodice').txt(ced.piva);
  da1.ele('CodiceFiscale').txt(ced.cf); da1.ele('Anagrafica').ele('Denominazione').txt(ced.den); da1.ele('RegimeFiscale').txt('RF01');
  cp.ele('Sede').ele('Indirizzo').txt(ced.ind).up().ele('CAP').txt(ced.cap).up().ele('Comune').txt(ced.com).up().ele('Provincia').txt(ced.prov).up().ele('Nazione').txt('IT');
  const cc = h.ele('CessionarioCommittente'); const da2 = cc.ele('DatiAnagrafici');
  if(c.partitaIva) da2.ele('IdFiscaleIVA').ele('IdPaese').txt('IT').up().ele('IdCodice').txt(c.partitaIva);
  if(c.codiceFiscale) da2.ele('CodiceFiscale').txt(c.codiceFiscale);
  da2.ele('Anagrafica').ele('Denominazione').txt(c.ragioneSociale||`${c.nome||''} ${c.cognome||''}`.trim()||'Cliente');
  cc.ele('Sede').ele('Indirizzo').txt(c.indirizzo||'N/D').up().ele('CAP').txt(c.cap||'00000').up().ele('Comune').txt(c.citta||'N/D').up().ele('Provincia').txt(c.provincia||'MI').up().ele('Nazione').txt('IT');
  const b = x.ele('FatturaElettronicaBody'); const dg = b.ele('DatiGenerali').ele('DatiGeneraliDocumento');
  dg.ele('TipoDocumento').txt('TD01'); dg.ele('Divisa').txt('EUR'); dg.ele('Data').txt(data); dg.ele('Numero').txt(f.numero); dg.ele('ImportoTotaleDocumento').txt(lordo.toFixed(2));
  const dbs = b.ele('DatiBeniServizi');
  voci.forEach((v: any, i: number) => { const l = dbs.ele('DettaglioLinee'); l.ele('NumeroLinea').txt(String(i+1)); l.ele('Descrizione').txt(v.descrizione||'Servizio'); l.ele('Quantita').txt(Number(v.quantita||1).toFixed(2)); l.ele('PrezzoUnitario').txt(Number(v.prezzoUnitario||0).toFixed(2)); l.ele('PrezzoTotale').txt(Number(v.totale||0).toFixed(2)); l.ele('AliquotaIVA').txt(Number(v.iva||22).toFixed(2)); });
  const dr = dbs.ele('DatiRiepilogo'); dr.ele('AliquotaIVA').txt('22.00'); dr.ele('ImponibileImporto').txt(netto.toFixed(2)); dr.ele('Imposta').txt(iva.toFixed(2)); dr.ele('EsigibilitaIVA').txt('I');
  if(f.dataScadenza){ const dp = b.ele('DatiPagamento'); dp.ele('CondizioniPagamento').txt('TP02'); const ddp = dp.ele('DettaglioPagamento'); ddp.ele('ModalitaPagamento').txt('MP05'); ddp.ele('DataScadenzaPagamento').txt(new Date(f.dataScadenza).toISOString().split('T')[0]); ddp.ele('ImportoPagamento').txt(lordo.toFixed(2)); if(process.env.AZIENDA_IBAN) ddp.ele('IBAN').txt(process.env.AZIENDA_IBAN.replace(/\s/g,'')); }
  return x.end({ prettyPrint: true });
}

export async function validaFatturaPA(id: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  const f: any = await prisma.fattura.findUnique({ where: { id }, include: { amministratore: true } });
  if (!f) return { valid: false, errors: ['Fattura non trovata'] };
  if (!f.numero) errors.push('Numero mancante'); if (!f.totaleLordo) errors.push('Importo mancante');
  const c = f.amministratore;
  if (!c) errors.push('Cliente non specificato');
  else { if (!c.partitaIva && !c.codiceFiscale) errors.push('P.IVA o C.F. cliente obbligatorio'); if (!c.indirizzo) errors.push('Indirizzo cliente obbligatorio'); }
  if (!process.env.AZIENDA_PIVA) errors.push('P.IVA azienda non configurata');
  return { valid: errors.length === 0, errors };
}

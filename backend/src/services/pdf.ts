import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const getAzienda = () => ({
  ragioneSociale: process.env.AZIENDA_NOME || 'PANEV ASCENSORI SAS',
  partitaIva: process.env.AZIENDA_PIVA || '12345678901',
  codiceFiscale: process.env.AZIENDA_CF || '12345678901',
  indirizzo: process.env.AZIENDA_INDIRIZZO || 'Via Giuseppe di Vittorio 70',
  citta: process.env.AZIENDA_CITTA || 'San Donato Milanese',
  cap: process.env.AZIENDA_CAP || '20097', provincia: process.env.AZIENDA_PROVINCIA || 'MI',
  telefono: process.env.AZIENDA_TELEFONO || '+39 02 1234567',
  email: process.env.AZIENDA_EMAIL || 'info@panevascensori.it',
  pec: process.env.AZIENDA_PEC || 'panevascensori@pec.it',
  iban: process.env.AZIENDA_IBAN || 'IT60 X054 2811 1010 0000 0123 456',
  banca: process.env.AZIENDA_BANCA || 'Banca Intesa Sanpaolo',
  rea: process.env.AZIENDA_REA || 'MI-1234567',
  capitale: process.env.AZIENDA_CAPITALE || '10.000,00 i.v.',
});

const C = { primary: '#0891b2', text: '#1a1a1a', muted: '#6b7280', border: '#e5e7eb' };
const F = { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' };

function drawHeader(d: any, az: any, title: string, num: string) {
  d.rect(40, 40, 50, 50).fillAndStroke(C.primary, C.primary);
  d.fillColor('#fff').font(F.b).fontSize(24).text('EA', 40, 54, { width: 50, align: 'center' });
  d.fillColor(C.text).font(F.b).fontSize(14).text(az.ragioneSociale, 100, 45);
  d.fillColor(C.muted).font(F.r).fontSize(8);
  d.text(`${az.indirizzo} - ${az.cap} ${az.citta} (${az.provincia})`, 100, 62);
  d.text(`P.IVA: ${az.partitaIva} | Tel: ${az.telefono} | Email: ${az.email}`, 100, 73);
  d.text(`PEC: ${az.pec} | REA: ${az.rea}`, 100, 84);
  d.fillColor(C.primary).font(F.b).fontSize(20).text(title, 380, 40, { width: 175, align: 'right' });
  d.fillColor(C.text).font(F.b).fontSize(12).text(`N. ${num}`, 380, 68, { width: 175, align: 'right' });
  d.moveTo(40, 110).lineTo(555, 110).strokeColor(C.primary).lineWidth(2).stroke();
}

function drawFooter(d: any, az: any) {
  const y = d.page.height - 55;
  d.moveTo(40, y).lineTo(555, y).strokeColor(C.border).lineWidth(0.5).stroke();
  d.fillColor(C.muted).font(F.r).fontSize(7);
  d.text(`${az.ragioneSociale} | P.IVA ${az.partitaIva} | ${az.indirizzo}, ${az.cap} ${az.citta}`, 40, y + 6, { width: 515, align: 'center' });
  d.text(`IBAN: ${az.iban} | ${az.banca} | Capitale Sociale: € ${az.capitale}`, 40, y + 16, { width: 515, align: 'center' });
}

function drawClient(d: any, y: number, label: string, r: any) {
  d.rect(320, y, 235, 85).strokeColor(C.border).lineWidth(0.5).stroke();
  d.fillColor(C.muted).font(F.b).fontSize(8).text(label.toUpperCase(), 330, y + 8);
  d.fillColor(C.text).font(F.b).fontSize(11).text(r?.ragioneSociale || r?.nome || '—', 330, y + 22, { width: 215 });
  d.font(F.r).fontSize(9);
  if (r?.indirizzo) d.text(r.indirizzo, 330, y + 38, { width: 215 });
  if (r?.citta) d.text(`${r.cap || ''} ${r.citta} ${r.provincia ? `(${r.provincia})` : ''}`, 330, y + 50, { width: 215 });
  if (r?.partitaIva) d.text(`P.IVA: ${r.partitaIva}`, 330, y + 62, { width: 215 });
}

function drawTable(d: any, y: number, voci: any[]) {
  d.rect(40, y, 515, 22).fillAndStroke(C.primary, C.primary);
  d.fillColor('#fff').font(F.b).fontSize(9);
  d.text('DESCRIZIONE', 46, y + 7, { width: 270 }); d.text('QTA', 320, y + 7, { width: 50, align: 'center' });
  d.text('PREZZO', 375, y + 7, { width: 60, align: 'right' }); d.text('IVA', 440, y + 7, { width: 40, align: 'right' });
  d.text('TOTALE', 485, y + 7, { width: 65, align: 'right' });
  let yi = y + 22;
  voci.forEach((v: any, i: number) => {
    if (i % 2 === 0) { d.rect(40, yi, 515, 20).fillColor('#f9fafb').fill(); d.fillColor(C.text); }
    d.fillColor(C.text).font(F.r).fontSize(9);
    d.text(v.descrizione || '', 46, yi + 6, { width: 270, ellipsis: true });
    d.text(Number(v.quantita || 1).toFixed(2), 320, yi + 6, { width: 50, align: 'center' });
    d.text(`€${Number(v.prezzoUnitario || 0).toFixed(2)}`, 375, yi + 6, { width: 60, align: 'right' });
    d.text(`${Number(v.aliquotaIva ?? v.iva ?? 22)}%`, 440, yi + 6, { width: 40, align: 'right' });
    d.text(`€${Number(v.totale || 0).toFixed(2)}`, 485, yi + 6, { width: 65, align: 'right' });
    yi += 20;
  });
  for (let i = voci.length; i < 5; i++) { if (i % 2 === 0) d.rect(40, yi, 515, 20).fillColor('#f9fafb').fill(); yi += 20; }
  d.rect(40, y, 515, yi - y).strokeColor(C.border).lineWidth(0.5).stroke();
  return yi;
}

function drawTotals(d: any, y: number, netto: number, iva: number, lordo: number) {
  d.fillColor(C.text).font(F.r).fontSize(10);
  d.text('Imponibile:', 340, y + 8, { width: 110, align: 'right' }); d.text(`€ ${netto.toFixed(2)}`, 455, y + 8, { width: 95, align: 'right' });
  d.text('IVA:', 340, y + 24, { width: 110, align: 'right' }); d.text(`€ ${iva.toFixed(2)}`, 455, y + 24, { width: 95, align: 'right' });
  d.rect(340, y + 42, 215, 28).fillAndStroke(C.primary, C.primary);
  d.fillColor('#fff').font(F.b).fontSize(13);
  d.text('TOTALE:', 340, y + 50, { width: 110, align: 'right' }); d.text(`€ ${lordo.toFixed(2)}`, 455, y + 50, { width: 95, align: 'right' });
}

function makePDF(fn: (d: any) => void): Promise<Buffer> {
  const d = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = [];
  d.on('data', (c: any) => chunks.push(c)); fn(d); d.end();
  return new Promise(r => d.on('end', () => r(Buffer.concat(chunks))));
}

export async function generaFatturaPDF(id: string): Promise<Buffer> {
  const f: any = await prisma.fattura.findUnique({ where: { id }, include: { amministratore: true, vociFattura: true } });
  if (!f) throw new Error('Fattura non trovata');
  const az = getAzienda(); const netto = Number(f.totaleNetto||0), iva = Number(f.totaleIva||0), lordo = Number(f.totaleLordo||0);
  const voci = f.vociFattura?.length ? f.vociFattura : [{ descrizione: f.oggetto||'Prestazione', quantita: 1, prezzoUnitario: netto, iva: 22, totale: netto }];
  return makePDF(d => {
    drawHeader(d, az, f.tipo === 'RICEVUTA' ? 'FATTURA RICEVUTA' : 'FATTURA', f.numero);
    let y = 125;
    d.fillColor(C.text).font(F.b).fontSize(9).text('DATA', 40, y); d.font(F.r).fontSize(10).text(new Date(f.data||f.createdAt).toLocaleDateString('it-IT'), 40, y+12);
    d.font(F.b).fontSize(9).text('SCADENZA', 160, y); d.font(F.r).fontSize(10).text(f.dataScadenza ? new Date(f.dataScadenza).toLocaleDateString('it-IT') : '—', 160, y+12);
    drawClient(d, y-5, 'Destinatario', f.amministratore); y += 50;
    const te = drawTable(d, y, voci); drawTotals(d, te + 10, netto, iva, lordo);
    d.fillColor(C.text).font(F.b).fontSize(9).text('PAGAMENTO', 40, te+95);
    d.font(F.r).fontSize(9).text(`IBAN: ${az.iban} | Banca: ${az.banca}`, 40, te+108);
    d.text(`Causale: Pagamento ${f.numero}`, 40, te+120);
    drawFooter(d, az);
  });
}

export async function generaPreventivoPDF(id: string): Promise<Buffer> {
  const p: any = await prisma.preventivo.findUnique({ where: { id }, include: { amministratore: true, voci: true } });
  if (!p) throw new Error('Preventivo non trovato');
  const az = getAzienda(); const netto = Number(p.totaleNetto||0), iva = Number(p.totaleIva||0), lordo = Number(p.totaleLordo||0);
  const voci = p.voci?.length ? p.voci : [{ descrizione: p.oggetto||'Servizio', quantita: 1, prezzoUnitario: netto, iva: 22, totale: netto }];
  return makePDF(d => {
    drawHeader(d, az, 'PREVENTIVO', p.numero);
    let y = 125;
    d.fillColor(C.text).font(F.b).fontSize(9).text('DATA', 40, y); d.font(F.r).fontSize(10).text(new Date(p.data||p.createdAt).toLocaleDateString('it-IT'), 40, y+12);
    d.font(F.b).fontSize(9).text('VALIDITÀ', 160, y); d.font(F.r).fontSize(10).text('30 giorni', 160, y+12);
    drawClient(d, y-5, 'Cliente', p.amministratore); y += 50;
    const te = drawTable(d, y, voci); drawTotals(d, te + 10, netto, iva, lordo);
    d.fillColor(C.text).font(F.b).fontSize(9).text('CONDIZIONI', 40, te+95);
    d.font(F.r).fontSize(8).fillColor(C.muted);
    d.text('Offerta valida 30 gg | Pagamento: 30 gg FM | Lavorazione: 15-30 gg lavorativi', 40, te+108);
    d.font(F.b).fontSize(9).fillColor(C.text).text('PER ACCETTAZIONE', 380, te+95);
    d.moveTo(380, te+135).lineTo(540, te+135).strokeColor(C.text).lineWidth(0.5).stroke();
    d.font(F.r).fontSize(7).fillColor(C.muted).text('Timbro e firma', 380, te+140);
    drawFooter(d, az);
  });
}

export async function generaDDTPDF(id: string): Promise<Buffer> {
  const t: any = await prisma.dDT.findUnique({ where: { id }, include: { righe: true } });
  if (!t) throw new Error('DDT non trovato');
  const az = getAzienda();
  return makePDF(d => {
    drawHeader(d, az, 'DDT', t.numero);
    let y = 125;
    d.fillColor(C.text).font(F.b).fontSize(9).text('DATA', 40, y); d.font(F.r).fontSize(10).text(new Date(t.data||t.createdAt).toLocaleDateString('it-IT'), 40, y+12);
    d.font(F.b).fontSize(9).text('CAUSALE', 160, y); d.font(F.r).fontSize(10).text(t.causale||'Vendita', 160, y+12);
    drawClient(d, y-5, 'Destinatario', { nome: t.destinatario, indirizzo: t.indirizzoConsegna }); y += 50;
    d.rect(40, y, 515, 22).fillAndStroke(C.primary, C.primary);
    d.fillColor('#fff').font(F.b).fontSize(9).text('DESCRIZIONE MERCE', 46, y+7); d.text('QTÀ', 490, y+7, { width: 60, align: 'right' });
    let yi = y + 22; const righe = t.righe?.length ? t.righe : [{ descrizione: 'Materiale come da ordine', quantita: 1 }];
    righe.forEach((r: any, i: number) => { if(i%2===0){d.rect(40,yi,515,20).fillColor('#f9fafb').fill();} d.fillColor(C.text).font(F.r).fontSize(9).text(r.descrizione||'',46,yi+6,{width:410}); d.text(String(r.quantita||1),490,yi+6,{width:60,align:'right'}); yi+=20; });
    for(let i=righe.length;i<8;i++){if(i%2===0)d.rect(40,yi,515,20).fillColor('#f9fafb').fill();yi+=20;}
    d.rect(40,y,515,yi-y).strokeColor(C.border).lineWidth(0.5).stroke();
    yi += 30;
    d.fillColor(C.text).font(F.b).fontSize(9).text('FIRMA CONDUCENTE',60,yi).text('FIRMA DESTINATARIO',360,yi);
    d.moveTo(40,yi+45).lineTo(255,yi+45).stroke(); d.moveTo(340,yi+45).lineTo(555,yi+45).stroke();
    drawFooter(d, az);
  });
}

export async function generaOrdinePDF(id: string): Promise<Buffer> {
  const o: any = await prisma.ordineLavoro.findUnique({ where: { id }, include: { impianto: true, tecnico: true } });
  if (!o) throw new Error('Ordine non trovato');
  const az = getAzienda();
  return makePDF(d => {
    drawHeader(d, az, 'ORDINE LAVORO', o.numero);
    let y = 125;
    d.fillColor(C.text).font(F.b).fontSize(9).text('DATA',40,y); d.font(F.r).fontSize(10).text(new Date(o.createdAt).toLocaleDateString('it-IT'),40,y+12);
    d.font(F.b).fontSize(9).text('PRIORITÀ',160,y); d.font(F.r).fontSize(10).text(o.priorita||'ORDINARIA',160,y+12);
    d.font(F.b).fontSize(9).text('STATO',280,y); d.font(F.r).fontSize(10).text(o.stato||'EMESSO',280,y+12);
    if(o.impianto) drawClient(d, y-5, 'Impianto', { nome: `${o.impianto.matricola} · ${o.impianto.marca||''} ${o.impianto.modello||''}`, indirizzo: o.impianto.indirizzo });
    y+=90; d.fillColor(C.text).font(F.b).fontSize(11).text('OGGETTO INTERVENTO',40,y);
    d.rect(40,y+16,515,60).strokeColor(C.border).lineWidth(0.5).stroke(); d.font(F.r).fontSize(10).text(o.oggetto||'',50,y+24,{width:495,height:50});
    y+=90; d.font(F.b).fontSize(11).text('DESCRIZIONE LAVORI',40,y);
    d.rect(40,y+16,515,100).strokeColor(C.border).lineWidth(0.5).stroke(); d.font(F.r).fontSize(9).text(o.descrizione||o.note||'',50,y+24,{width:495,height:90});
    y+=130; d.font(F.b).fontSize(9).text('TECNICO',40,y); d.font(F.r).fontSize(10).text(o.tecnico?`${o.tecnico.nome} ${o.tecnico.cognome}`:'Da assegnare',40,y+14);
    d.font(F.b).fontSize(9).text('FIRMA TECNICO',40,y+50).text('FIRMA CLIENTE',340,y+50);
    d.moveTo(40,y+85).lineTo(255,y+85).stroke(); d.moveTo(340,y+85).lineTo(555,y+85).stroke();
    drawFooter(d, az);
  });
}

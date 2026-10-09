import 'server-only';
// The draft order of the machine from a saved design or calculation, as a Word document or a PDF (report/relazione.py
// draws the same blocks; report/raster.py paints the views for Word): only while the running engines reproduce the
// record (else refused, like its documents), for the machine the record verified or the advice's first among SICOR and
// Montanari (src/lib/order/machine.ts), on the company's letterhead, with the machine room drawn with that machine.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { liftRecord } from '@/lib/lift-record';
import { savedLiftAdvice, savedValuesAdvice } from '@/lib/lift/advice-cache';
import { buildOrder, type OrderInput } from '@/lib/order/build';
import { toDocx } from '@/lib/order/docx';
import { calcSite, designSite } from '@/lib/order/site';
import { plantData } from '@/lib/plant';
import { calcOrder, designOrder } from '@/lib/order/machine';
import { renderPdf, renderPictures } from '@/lib/report/render';
import { can } from '@/lib/rbac';
import { bedplateKey, machineKey } from '@/lib/prices/articles';
import type { OrderMachine } from '@/lib/order/machine';
import { slug } from './download';
import { getCalculation, getLetterhead, getLiftDesign } from './queries';
import { companyPrices } from './prices';
import { calcRecord, storedCollaudo } from './records';

export const ORDER_FORMATS = ['docx', 'pdf'] as const;
export type OrderFormat = (typeof ORDER_FORMATS)[number];

const MIME: Readonly<Record<OrderFormat, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf',
};

export type OrderExport =
  | { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; entity: 'LiftDesign' | 'Calculation'; entityId: string }
  | { ok: false; error: 'notFound' | 'engineChanged' | 'noMachine' };

const PROJECT = { name: true, address: true, city: true, province: true, plantNumber: true, plant: true } as const;

async function render(input: OrderInput, format: OrderFormat): Promise<OrderExport> {
  // dated as its record (its saving), not the download: every download of the record gives the same bytes
  const doc = buildOrder(input), m = input.order.machine, at = input.record.createdAt;
  const body = format === 'pdf' ? new Uint8Array(await renderPdf(doc, at)) : new Uint8Array(toDocx(doc, at, await renderPictures(doc)));
  const name = `bozza-ordine-${slug(`${m.brand} ${m.model}`)}-${slug(input.project.name)}-${at.toISOString().slice(0, 10)}.${format}`;
  return { ok: true, body, mime: MIME[format], name, entity: input.record.kind === 'design' ? 'LiftDesign' : 'Calculation', entityId: input.record.id };
}

/** The company's prices of the ordered machine and bedplate, for a downloader who sees prices (else none: blank). */
async function orderPrices(user: SessionUser, order: OrderMachine): Promise<Pick<OrderInput, 'prices'>> {
  if (!can(user, 'prices:view')) return {};
  const p = await companyPrices(user.companyId), m = order.machine;
  return { prices: { machine: p.get(machineKey(m.brand, m.model)) ?? null, bedplate: m.bedplate ? p.get(bedplateKey(m.bedplate.code)) ?? null : null } };
}

/** The order of a saved lift design. */
export async function exportDesignOrder(user: SessionUser, id: string, format: OrderFormat): Promise<OrderExport> {
  const d = await getLiftDesign(user, id), r = d ? liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256) : null;
  if (!d || !r) return { ok: false, error: 'notFound' };
  if (!r.same) return { ok: false, error: 'engineChanged' };
  const { inputs, dv } = r, order = designOrder(inputs, savedLiftAdvice(inputs), dv);
  if (!order) return { ok: false, error: 'noMachine' };
  const found = await prisma.project.findFirst({ where: { id: d.project.id, companyId: user.companyId }, select: PROJECT });
  if (!found) return { ok: false, error: 'notFound' };
  const { plant, ...project } = found;
  return render({
    ...await getLetterhead(user), ...await orderPrices(user, order), author: user.name, project, order, collaudo: dv.collaudo, pEstimate: dv.origin.P === 'estimate',
    ...designSite(inputs, dv, order.machine, order.recorded), plant: plantData(plant),
    record: { kind: 'design', id: d.id, sha256: d.sha256, createdAt: d.createdAt, label: d.label },
  }, format);
}

/** The order of a saved calculation: the replacement's; that of the lift design it was made from, when it has one (the
 *  design knows the machine room and the sheave direct pull needs, which the calculator's values do not). */
export async function exportCalcOrder(user: SessionUser, id: string, format: OrderFormat): Promise<OrderExport> {
  const c = await getCalculation(user, id), rec = c ? calcRecord(c) : null;
  if (!c || !rec) return { ok: false, error: 'notFound' };
  if (c.liftDesign) return exportDesignOrder(user, c.liftDesign.id, format);
  if (!rec.ok) return { ok: false, error: 'engineChanged' };
  const order = calcOrder(rec.values, savedValuesAdvice(rec.values));
  if (!order) return { ok: false, error: 'noMachine' };
  const { name, address, city, province, plantNumber } = c.project;
  // the machine room of the shaft design the calculation comes from (reproduced, as every record of the order)
  const design = rec.design;
  return render({
    ...await getLetterhead(user), ...await orderPrices(user, order), author: user.name, project: { name, address, city, province, plantNumber }, order,
    collaudo: storedCollaudo(rec.values, c.collaudo),
    ...calcSite(design?.layout ?? null, order.machine, rec.values), plant: plantData(c.project.plant),
    record: { kind: 'calc', id: c.id, sha256: c.sha256, createdAt: c.createdAt, label: c.label },
  }, format);
}

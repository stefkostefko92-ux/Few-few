import 'server-only';
// The draft order of the machine from a saved design or calculation, as a Word document or a PDF (report/relazione.py
// draws the same blocks; report/raster.py paints the views for Word): only while the running engines reproduce the
// record (else refused, like its documents), for the machine the record verified or the advice's first among SICOR and
// Montanari (src/lib/order/machine.ts), on the company's letterhead, with the machine room drawn with that machine.
import type { SheetImage } from '@/drawing';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { prisma } from '@/lib/db';
import { collaudoOf } from '@/lib/lift';
import { collaudoSchema } from '@/lib/lift-input';
import { liftRecord } from '@/lib/lift-record';
import { liftAdvice } from '@/lib/lift/advice';
import { buildOrder, type OrderInput } from '@/lib/order/build';
import { toDocx } from '@/lib/order/docx';
import { calcRoom, designRoom } from '@/lib/order/drawings';
import { calcOrder, designOrder } from '@/lib/order/machine';
import { renderPdf, renderPictures } from '@/lib/report/render';
import { reproduceDesign } from '@/lib/shaft-hash';
import { verifyStored } from '@/lib/snapshot-hash';
import { getCalculation, getCompanyLetterhead, getLiftDesign } from './queries';

export const ORDER_FORMATS = ['docx', 'pdf'] as const;
export type OrderFormat = (typeof ORDER_FORMATS)[number];

const MIME: Readonly<Record<OrderFormat, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf',
};

export type OrderExport =
  | { ok: true; body: Uint8Array<ArrayBuffer>; mime: string; name: string; entity: 'LiftDesign' | 'Calculation'; entityId: string }
  | { ok: false; error: 'notFound' | 'engineChanged' | 'noMachine' };

const slug = (s: string): string => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').toLowerCase().slice(0, 60) || 'impianto';

const PROJECT = { name: true, address: true, city: true, province: true, plantNumber: true, client: true } as const;

async function render(input: OrderInput, format: OrderFormat): Promise<OrderExport> {
  const doc = buildOrder(input), m = input.order.machine;
  const body = format === 'pdf' ? new Uint8Array(await renderPdf(doc)) : new Uint8Array(toDocx(doc, input.generatedAt, await renderPictures(doc)));
  const name = `bozza-ordine-${slug(`${m.brand} ${m.model}`)}-${slug(input.project.name)}-${input.generatedAt.toISOString().slice(0, 10)}.${format}`;
  return { ok: true, body, mime: MIME[format], name, entity: input.record.kind === 'design' ? 'LiftDesign' : 'Calculation', entityId: input.record.id };
}

/** The letterhead: the company's name, city and logo (a PNG or JPEG checked at the upload). */
const imageMime = (m: string | undefined): SheetImage['mime'] | null => (m === 'image/png' || m === 'image/jpeg' ? m : null);

async function letterhead(user: SessionUser): Promise<Pick<OrderInput, 'company' | 'companyCity' | 'logo'>> {
  const c = await getCompanyLetterhead(user), mime = imageMime(c?.logo?.mime);
  const logo = c?.logo && mime ? { mime, data: Buffer.from(c.logo.data).toString('base64') } : null;
  return { company: c?.name ?? user.companyName, companyCity: c?.city ?? null, logo };
}

/** The order of a saved lift design. */
export async function exportDesignOrder(user: SessionUser, id: string, format: OrderFormat): Promise<OrderExport> {
  const d = await getLiftDesign(user, id), r = d ? liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256) : null;
  if (!d || !r) return { ok: false, error: 'notFound' };
  if (!r.same) return { ok: false, error: 'engineChanged' };
  const { inputs, dv } = r, order = designOrder(inputs, liftAdvice(inputs), dv);
  if (!order) return { ok: false, error: 'noMachine' };
  const project = await prisma.project.findFirst({ where: { id: d.project.id, companyId: user.companyId }, select: PROJECT });
  if (!project) return { ok: false, error: 'notFound' };
  return render({
    ...await letterhead(user), author: user.name, project, order, collaudo: dv.collaudo, pEstimate: dv.origin.P === 'estimate', generatedAt: new Date(),
    room: designRoom(inputs, dv, order.machine, order.recorded),
    record: { kind: 'design', id: d.id, sha256: d.sha256, createdAt: d.createdAt, label: d.label },
  }, format);
}

/** The order of a saved calculation: the replacement's; that of the lift design it was made from, when it has one (the
 *  design knows the machine room and the sheave direct pull needs, which the calculator's values do not). */
export async function exportCalcOrder(user: SessionUser, id: string, format: OrderFormat): Promise<OrderExport> {
  const c = await getCalculation(user, id), values = c ? formValuesSchema.safeParse(c.inputs) : null;
  if (!c || !values?.success) return { ok: false, error: 'notFound' };
  if (!verifyStored(values.data, c.sha256).same) return { ok: false, error: 'engineChanged' };
  if (c.liftDesign) return exportDesignOrder(user, c.liftDesign.id, format);
  const order = calcOrder(values.data);
  if (!order) return { ok: false, error: 'noMachine' };
  const own = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
  const { name, address, city, province, plantNumber, client } = c.project;
  // the machine room of the shaft design the calculation comes from, when the running engine reproduces it
  const design = c.shaftDesign ? reproduceDesign(c.shaftDesign) : null;
  return render({
    ...await letterhead(user), author: user.name, project: { name, address, city, province, plantNumber, client }, order,
    collaudo: collaudoOf(values.data, own?.success ? own.data : undefined), generatedAt: new Date(),
    room: design?.layout.inputs.room ? calcRoom(design.layout, order.machine) : [],
    record: { kind: 'calc', id: c.id, sha256: c.sha256, createdAt: c.createdAt, label: c.label },
  }, format);
}

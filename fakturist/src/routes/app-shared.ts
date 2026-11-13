import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { HttpError } from '../auth/guards.js';
import { documentPdf } from '../documents/render.js';

/** Общото за маршрутите на приложението: проверка на идентификатор от адреса и изтегляне на документ. */
export const ID = /^[a-z0-9]{20,40}$/;

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !ID.test(value)) throw new HttpError(404);
  return value;
}

export const DOWNLOAD_SELECT = {
  organizationId: true,
  number: true,
  input: true,
  ublXml: true,
  ciiXml: true,
  chainIndex: true,
  sha256: true,
  firm: { select: { legalName: true } },
  mandate: { select: { documentRef: true } },
} as const;

export type DownloadSource = {
  organizationId: string;
  number: string | null;
  input: Prisma.JsonValue;
  ublXml: string | null;
  ciiXml: string | null;
  chainIndex: bigint | null;
  sha256: string | null;
  firm: { legalName: string } | null;
  mandate: { documentRef: string } | null;
};

/** PDF (от същия вход като XML-а) или XML-ът, както е издаден. Само за изтегляне, без кеш. */
export async function sendDocumentFile(
  res: Response,
  document: DownloadSource,
  format: string,
): Promise<void> {
  const name = document.number ?? 'document';
  res.set('Cache-Control', 'private, no-store');
  if (format === 'pdf') {
    const pdf = await documentPdf(document);
    res
      .type('application/pdf')
      .set('Content-Disposition', `attachment; filename="${name}.pdf"`)
      .send(pdf);
    return;
  }
  const xml =
    format === 'ubl.xml' ? document.ublXml : format === 'cii.xml' ? document.ciiXml : null;
  if (!xml) throw new HttpError(404);
  res
    .type('application/xml')
    .set('Content-Disposition', `attachment; filename="${name}-${format}"`)
    .send(xml);
}

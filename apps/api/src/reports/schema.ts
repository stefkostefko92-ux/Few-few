import { z } from 'zod';

/**
 * Валидация на текстовите полета при подаване на сигнал. Описанието от
 * гражданина се третира като ненадежден вход — само се съхранява, никога не
 * се интерпретира като HTML.
 */
export const createReportSchema = z.object({
  categorySlug: z.string().min(1).max(64),
  settlementSlug: z.string().min(1).max(64),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  description: z.string().trim().max(1000).optional(),
  reporterName: z.string().trim().max(120).optional(),
  reporterPhone: z.string().trim().max(30).optional(),
  clientReportId: z.string().trim().max(64).optional(),
  // Honeypot: истински граждани не го попълват. Ботовете — да.
  website: z.string().max(0).optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

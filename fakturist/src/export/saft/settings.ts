import { z } from 'zod';

/** Формата „Сметки и свързани лица“: сметка — SAFAccountType от XSD 1.0.3; номерата — по един на ред. */
const ACCOUNT = /^[1-9][0-9]{2,4}$/;
const RELATED_ID = /^[A-Z0-9]{2,35}$/;

export const SaftSettingsForm = z.object({
  receivable: z.string().trim().regex(ACCOUNT, 'account'),
  revenue: z.string().trim().regex(ACCOUNT, 'account'),
  related: z
    .string()
    .max(10_000)
    .default('')
    .transform((text) => [
      ...new Set(
        text
          .split(/[\r\n,;]+/)
          .map((id) => id.replace(/\s+/g, '').toUpperCase())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().regex(RELATED_ID, 'related')).max(200, 'related')),
});

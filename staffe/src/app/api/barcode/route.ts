import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { fail, route } from '@/lib/api';
import { BarcodeError, generaBarcodeSvg, generaQrSvg } from '@/lib/barcode';

/**
 * `GET /api/barcode?testo=…&tipo=code128|ean13|qr` — restituisce l'SVG del
 * simbolo. Dietro `requireUser()` (non è una rotta pubblica: il codice non
 * deve poter essere generato in massa da chi non è autenticato). L'input è
 * validato due volte: qui la forma (lunghezza, enum), in `barcode.ts` il set
 * di caratteri ammesso dal tipo di simbolo — un testo troppo lungo o fuori
 * set non arriva mai al generatore.
 */
export const runtime = 'nodejs';

const querySchema = z.object({
  testo: z.string().trim().min(1, 'Il testo è obbligatorio.').max(300, 'Testo troppo lungo.'),
  tipo: z.enum(['code128', 'ean13', 'qr'], {
    errorMap: () => ({ message: 'Tipo di codice non riconosciuto.' }),
  }),
});

export const GET = route(async (request: Request) => {
  await requireUser();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    testo: url.searchParams.get('testo') ?? '',
    tipo: url.searchParams.get('tipo') ?? '',
  });
  if (!parsed.success) {
    return fail(422, parsed.error.errors[0]?.message ?? 'Parametri non validi.', 'validazione');
  }

  let svg: string;
  try {
    svg =
      parsed.data.tipo === 'qr'
        ? generaQrSvg(parsed.data.testo)
        : generaBarcodeSvg(parsed.data.testo, parsed.data.tipo);
  } catch (err) {
    if (err instanceof BarcodeError) {
      return fail(422, err.message, 'validazione');
    }
    throw err;
  }

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Deterministico per lo stesso `testo`+`tipo`: cache del browser, non
      // condivisa (la rotta resta dietro autenticazione).
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

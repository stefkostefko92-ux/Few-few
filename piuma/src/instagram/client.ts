import { z } from 'zod';

export const GRAPH_HOST = 'https://graph.instagram.com';
export const OAUTH_HOST = 'https://api.instagram.com';

/** Грешка от Meta — пази код/подкод, за да решим дали да повтаряме. */
export class InstagramApiError extends Error {
  readonly httpStatus: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;

  constructor(
    message: string,
    init: { httpStatus: number; code?: number; subcode?: number; type?: string },
  ) {
    super(message);
    this.name = 'InstagramApiError';
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.subcode = init.subcode;
    this.type = init.type;
  }

  /** 4 = app rate limit, 32/613 = page/api throttling, 5xx = временно. */
  get retryable(): boolean {
    if (this.httpStatus >= 500) return true;
    return this.code === 4 || this.code === 32 || this.code === 613 || this.httpStatus === 429;
  }
}

const errorEnvelope = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
  }),
});

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, string | undefined>;
  form?: Record<string, string | undefined>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Един изход към Meta. Валидира отговора със zod — нищо не влиза в базата непроверено.
 */
export async function instagramRequest<T>(
  url: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, form, timeoutMs = 20_000, fetchImpl = fetch } = options;

  const target = new URL(url);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) target.searchParams.set(key, value);
  }

  let body: URLSearchParams | undefined;
  if (form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      if (value !== undefined) body.set(key, value);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(target.toString(), {
      method,
      body,
      headers: body ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'мрежова грешка';
    throw new InstagramApiError(`Заявката към Instagram не мина: ${reason}`, { httpStatus: 599 });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new InstagramApiError(`Нечетим отговор от Instagram (HTTP ${response.status})`, {
      httpStatus: response.status,
    });
  }

  const asError = errorEnvelope.safeParse(payload);
  if (asError.success) {
    const { message, type, code, error_subcode: subcode } = asError.data.error;
    throw new InstagramApiError(message, {
      httpStatus: response.status,
      code,
      subcode,
      type,
    });
  }

  if (!response.ok) {
    throw new InstagramApiError(`Instagram върна HTTP ${response.status}`, {
      httpStatus: response.status,
    });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new InstagramApiError(
      `Неочакван отговор от Instagram: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
      { httpStatus: response.status },
    );
  }
  return parsed.data;
}

import 'server-only';

// Изходяща заявка към ФИКСИРАН хост (импорт от Linktree): без пренасочвания
// (3xx = отказ — иначе отговорът може да дойде от чужд хост), таймаут и
// таван на размера, броен по време на четенето (не по Content-Length).

export async function fetchCapped(
  url: string,
  input: { maxBytes: number; accept: string; timeoutMs?: number },
): Promise<{ body: Buffer; contentType: string } | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(input.timeoutMs ?? 8000),
      headers: {
        Accept: input.accept,
        'User-Agent': 'LinkettoImport/1.0 (+https://linketto.carbonstealth.eu)',
      },
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (response.status !== 200 || !response.body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > input.maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  return {
    body: Buffer.concat(chunks),
    contentType: (response.headers.get('content-type') ?? '').toLowerCase(),
  };
}

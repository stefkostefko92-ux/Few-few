import 'server-only';

// AI превод на профила с един клик — Gemini Flash (същият подход като
// mastilko): ключът е САМО server-side env, клиентът никога не говори с
// Google. Съдържанието се праща само по изрично действие на потребителя.

export interface TranslatableContent {
  displayName: string;
  bio: string | null;
  links: { id: string; title: string }[];
}

export type TranslatedByLocale = Record<
  string,
  {
    displayName: string;
    bio?: string;
    links: Record<string, string>; // link id → преведено заглавие
  }
>;

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function translateProfileContent(
  source: TranslatableContent,
  fromLocale: string,
  toLocales: string[],
): Promise<TranslatedByLocale | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || toLocales.length === 0) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt =
    `You translate a creator's "link in bio" profile. Source language: ${fromLocale}. ` +
    `Translate the display name, the bio and each link title into these languages: ${toLocales.join(', ')}. ` +
    `Keep proper names, brand names and emoji unchanged. Keep translations short and natural. ` +
    `Return ONLY JSON of the shape {"<locale>": {"displayName": string, "bio": string, "links": {"<id>": string}}}.\n` +
    `Source JSON:\n` +
    JSON.stringify({
      displayName: source.displayName,
      bio: source.bio ?? '',
      links: Object.fromEntries(
        source.links.map((link) => [link.id, link.title]),
      ),
    });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;

  const data: unknown = await res.json();
  const text = extractText(data);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as TranslatedByLocale;
    const result: TranslatedByLocale = {};
    for (const locale of toLocales) {
      const entry = parsed[locale];
      if (!entry || typeof entry.displayName !== 'string') continue;
      result[locale] = {
        displayName: entry.displayName.slice(0, 100),
        bio:
          typeof entry.bio === 'string' && entry.bio.trim()
            ? entry.bio.slice(0, 500)
            : undefined,
        links:
          entry.links && typeof entry.links === 'object' ? entry.links : {},
      };
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function extractText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const content = (candidates[0] as { content?: { parts?: unknown } }).content;
  if (!content || !Array.isArray(content.parts)) return null;
  const part = content.parts[0] as { text?: unknown };
  return typeof part?.text === 'string' ? part.text : null;
}

// Инструментите на конектора: `search` и `fetch`.
//
// Имената и формата им НЕ са наш избор — ChatGPT ги изисква точно така (search →
// { results: [{ id, title, url }] }, fetch → { id, title, text, url, metadata }),
// а Claude приема произволни инструменти, тоест същите два му вършат работа.
// Отговорът се връща ДВОЙНО: `structuredContent` (машинно) и същият JSON като
// текст в `content` — така го иска съвместимостта с клиенти, които четат само
// текстовото съдържание.
//
// И двата са само за ЧЕТЕНЕ. Няма инструмент, който пише, изпраща поща или
// проверява свободен адрес: „свободен ли е слъгът“ би издавал съществуването на
// СКРИТИ визитки, а това е изтичане на лични данни през страничен канал.
import { buildCorpus, findDoc } from './corpus.js';

const MAX_RESULTS = 10;
const SNIPPET = 220;

// Нормализация за български: малки букви + разделяне по всичко, което не е буква
// или цифра. Кирилицата минава през \p{L} (Unicode), не през [a-z].
const tokenize = (s) =>
  String(s || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// Груб стем за словоформи: „визитка“/„визитки“/„визитката“ трябва да се намерят
// взаимно. Без речник — отрязваме до 6 знака и сравняваме по представка.
const stem = (t) => (t.length > 6 ? t.slice(0, 6) : t);

function scoreDoc(doc, queryTokens) {
  const titleTokens = tokenize(doc.title).map(stem);
  const textTokens = tokenize(doc.text).map(stem);
  let score = 0;
  for (const q of queryTokens) {
    const inTitle = titleTokens.filter((t) => t.startsWith(q) || q.startsWith(t)).length;
    const inText = textTokens.filter((t) => t.startsWith(q) || q.startsWith(t)).length;
    if (!inTitle && !inText) continue;
    // Заглавието тежи, но тялото не се игнорира; логаритъм, за да не печели
    // документ само защото е дълъг и повтаря думата.
    score += inTitle * 8 + Math.log1p(inText) * 3;
  }
  return score;
}

function snippet(doc, queryTokens) {
  const text = doc.text.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  let at = -1;
  for (const q of queryTokens) {
    const i = lower.indexOf(q);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const start = at === -1 ? 0 : Math.max(0, at - 60);
  const cut = text.slice(start, start + SNIPPET);
  return (start > 0 ? '…' : '') + cut + (start + SNIPPET < text.length ? '…' : '');
}

export function searchDocs(base, query, limit = MAX_RESULTS) {
  const queryTokens = tokenize(query).map(stem);
  const docs = buildCorpus(base);
  if (!queryTokens.length) {
    // Празна заявка → не мълчим, а връщаме входните точки. Асистент, който още не
    // знае какво има, така вижда откъде да започне.
    return docs.slice(0, limit).map((d) => ({
      id: d.id,
      title: d.title,
      url: d.url,
      snippet: snippet(d, []),
    }));
  }
  return docs
    .map((d) => ({ doc: d, score: scoreDoc(d, queryTokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, Math.min(limit, MAX_RESULTS))
    .map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      url: doc.url,
      snippet: snippet(doc, queryTokens),
    }));
}

export function fetchDoc(base, id) {
  const doc = findDoc(base, String(id || ''));
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    text: doc.text,
    url: doc.url,
    metadata: {
      type: doc.type,
      source: 'vizitka-bg.com',
      ...(doc.updated ? { updated: doc.updated } : {}),
    },
  };
}

export const TOOLS = [
  {
    name: 'search',
    title: 'Търсене във Vizitka',
    description:
      'Търси в съдържанието на Vizitka (дигитални визитки с QR код): наръчника, често задаваните въпроси и публичните визитки, чиито собственици изрично са разрешили да бъдат намирани от AI асистенти. Връща списък с id, заглавие, адрес и откъс. Вземи пълния текст с инструмента fetch по върнатото id.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Дума или израз на български (или английски) — например „визитка с QR код“.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_RESULTS,
          description: `Максимален брой резултати (по подразбиране ${MAX_RESULTS}).`,
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              url: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['id', 'title', 'url'],
          },
        },
      },
      required: ['results'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false, title: 'Търсене във Vizitka' },
  },
  {
    name: 'fetch',
    title: 'Вземи документ от Vizitka',
    description:
      'Връща пълния текст на документ от Vizitka по id, върнато от search (например „guide:qr-vizitka“ или „card:ivan-testov“). Връща id, заглавие, текст, адрес и метаданни.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификаторът, върнат от search.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        text: { type: 'string' },
        url: { type: 'string' },
        metadata: { type: 'object' },
      },
      required: ['id', 'title', 'text', 'url'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false, title: 'Вземи документ от Vizitka' },
  },
];

// Извиква инструмент. Връща { structured, isError } — обвивката в protocol.js
// прави от това валиден CallToolResult (двоен формат).
export function callTool(name, args, base) {
  if (name === 'search') {
    const query = typeof args?.query === 'string' ? args.query : '';
    const rawLimit = Number(args?.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : MAX_RESULTS;
    return { structured: { results: searchDocs(base, query, limit) } };
  }
  if (name === 'fetch') {
    const doc = fetchDoc(base, args?.id);
    if (!doc)
      return {
        // Грешка на ИЗПЪЛНЕНИЕТО, не на протокола: моделът може да се поправи сам,
        // като извика search и вземе валидно id.
        isError: true,
        structured: {
          error: 'not_found',
          message: `Няма документ с id „${String(args?.id || '')}“. Извикай search, за да вземеш валидно id.`,
        },
      };
    return { structured: doc };
  }
  return null; // непознат инструмент → грешка на протокола (в protocol.js)
}

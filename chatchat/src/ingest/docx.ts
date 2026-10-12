import mammoth from 'mammoth';
import { walkXml, XmlError } from './xml.js';
import { entryMap, readZip, repackStored, ZipError } from './zip.js';
import {
  INGEST_LIMITS,
  IngestFailure,
  numberPages,
  splitText,
  type Extraction,
  type ExtractedPage,
} from './types.js';

/**
 * DOCX → страници по раздели (§4.1, §7.3 „chunking per sezione“): mammoth 1.13 (BSD-2-Clause,
 * поддържан) превежда документа в чист HTML по стиловете (Heading 1…6 → h1…h6), а тук заглавие
 * от ниво 1–2 започва нов раздел = „страница“ (DOCX няма истински страници — цитатът сочи
 * раздела). Таблиците стават редове „клетка | клетка“. Защитите:
 *  - mammoth НЕ получава оригинала, а препакетиран ZIP само с проверените записи без компресия
 *    (zip.ts: таван на записите и на разархивирания размер, бомби, CRC);
 *  - `externalFileAccess: false` (свързани външни файлове не се четат) и изображенията не се
 *    четат изобщо (`convertImage` връща празен адрес, без `image.read()`);
 *  - по препоръка на mammoth разборът тече в отделна нишка с таван на паметта и срок (isolate.ts).
 */

const STYLE_MAP = ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"];

const BLOCKS = new Set(['p', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote']);
const SECTION_HEADINGS = new Set(['h1', 'h2']);

interface Section {
  title?: string;
  blocks: string[];
}

/** HTML-ът на mammoth → раздели (заглавие + абзаци/редове на таблици). */
export function htmlSections(html: string): Section[] {
  const sections: Section[] = [{ blocks: [] }];
  let buffer: string[] | null = null;
  let heading: string[] | null = null;
  let cells: string[] | null = null;
  let cell: string[] | null = null;
  const current = () => sections[sections.length - 1] as Section;
  const flat = (parts: string[]) =>
    parts
      .join('')
      .replace(/[ \t ]+/g, ' ')
      .trim();
  walkXml(`<root>${html}</root>`, {
    open(name) {
      if (SECTION_HEADINGS.has(name)) heading = [];
      else if (name === 'tr') cells = [];
      else if ((name === 'td' || name === 'th') && cells) cell = [];
      else if (BLOCKS.has(name) && !cell) buffer = [];
      else if (name === 'br') (cell ?? buffer ?? heading)?.push('\n');
    },
    close(name) {
      if (SECTION_HEADINGS.has(name) && heading) {
        const title = flat(heading).slice(0, 200);
        heading = null;
        if (title) sections.push({ title, blocks: [title] });
      } else if ((name === 'td' || name === 'th') && cell && cells) {
        cells.push(flat(cell).replace(/\s*\n\s*/g, ' / '));
        cell = null;
      } else if (name === 'tr' && cells) {
        if (cells.some((c) => c !== '')) current().blocks.push(cells.join(' | '));
        cells = null;
      } else if (BLOCKS.has(name) && buffer && !cell) {
        const text = flat(buffer);
        if (text) current().blocks.push(name === 'li' ? `• ${text}` : text);
        buffer = null;
      }
    },
    text(t) {
      (cell ?? heading ?? buffer)?.push(t);
    },
  });
  return sections.filter((s) => s.blocks.length > 0);
}

/** Разделите → страници ≤ 40 000 знака (дълъг раздел продължава на следваща със същия раздел). */
export function sectionPages(sections: readonly Section[]): Array<Omit<ExtractedPage, 'page'>> {
  const pages: Array<Omit<ExtractedPage, 'page'>> = [];
  for (const s of sections) {
    for (const part of splitText(s.blocks.join('\n\n'), INGEST_LIMITS.maxPageChars)) {
      pages.push({ ...(s.title ? { section: s.title } : {}), text: part });
    }
  }
  return pages;
}

export async function extractDocx(bytes: Uint8Array): Promise<Extraction> {
  let repacked: Buffer;
  try {
    const entries = readZip(bytes);
    const main = entryMap(entries).get('word/document.xml');
    if (!main) throw new IngestFailure('ingest.err.archiveInvalid');
    if (main.data.length > INGEST_LIMITS.maxXmlBytes) {
      throw new IngestFailure('ingest.err.resourceLimit');
    }
    repacked = repackStored(entries);
  } catch (err) {
    if (err instanceof ZipError) {
      throw new IngestFailure(
        ['bomb', 'too_large', 'too_many_entries', 'overlap'].includes(err.reason)
          ? 'ingest.err.archiveBomb'
          : err.reason === 'encrypted'
            ? 'ingest.err.encrypted'
            : 'ingest.err.archiveInvalid',
      );
    }
    throw err;
  }
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: repacked },
      {
        styleMap: STYLE_MAP,
        includeDefaultStyleMap: true,
        includeEmbeddedStyleMap: false,
        externalFileAccess: false,
        ignoreEmptyParagraphs: true,
        convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
      },
    );
    html = result.value;
  } catch {
    throw new IngestFailure('ingest.err.archiveInvalid');
  }
  let sections: Section[];
  try {
    sections = htmlSections(html);
  } catch (err) {
    if (err instanceof XmlError) throw new IngestFailure('ingest.err.archiveInvalid');
    throw err;
  }
  const pages = sectionPages(sections);
  if (pages.length === 0) throw new IngestFailure('ingest.err.emptyDocument');
  return { format: 'docx', pages: numberPages(pages), warnings: [], ocrPages: 0 };
}

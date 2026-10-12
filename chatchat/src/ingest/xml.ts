/**
 * Минимален XML разбор „на поток“ за частите на OOXML (XLSX листове, споделени низове, стилове) и
 * за HTML-а, който mammoth генерира. Нула зависимости и БЕЗ DTD: `<!DOCTYPE` → грешка, така няма
 * външни същности (XXE) и „billion laughs“; познати са само петте стандартни същности и числовите.
 * Паметта е O(входа) — не се строи дърво. Имената са без префикс на пространството (`x:row` → `row`).
 */

export class XmlError extends Error {
  constructor(readonly reason: 'doctype' | 'malformed' | 'too_deep') {
    super(`xml: ${reason}`);
    this.name = 'XmlError';
  }
}

export interface XmlHandlers {
  open?(name: string, attrs: Record<string, string>, selfClosing: boolean): void;
  close?(name: string): void;
  text?(text: string): void;
}

const MAX_DEPTH = 256;
const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Стандартните същности и числовите; непозната остава буквално (без DTD няма други). */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,6});/g, (m, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Само валидни знаци (без NUL и сурогати).
      if (code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)) {
        return String.fromCodePoint(code);
      }
      return '';
    }
    return NAMED[body] ?? m;
  });
}

const localName = (qname: string) => {
  const i = qname.indexOf(':');
  return i >= 0 ? qname.slice(i + 1) : qname;
};

const ATTR = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseAttrs(body: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of body.matchAll(ATTR)) {
    const key = m[1] ?? '';
    // Атрибутите с префикс пазят и пълното име (r:id), и локалното, ако не се засича.
    const value = decodeEntities(m[3] ?? m[4] ?? '');
    attrs[key] = value;
    const local = localName(key);
    if (!(local in attrs)) attrs[local] = value;
  }
  return attrs;
}

/** Обхожда документа и вика обработчиците. Хвърля XmlError при DOCTYPE/повреда/дълбочина. */
export function walkXml(xml: string, h: XmlHandlers): void {
  let i = 0;
  let depth = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      if (h.text && i < n) h.text(decodeEntities(xml.slice(i)));
      return;
    }
    if (lt > i && h.text) h.text(decodeEntities(xml.slice(i, lt)));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlError('malformed');
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlError('malformed');
      if (h.text) h.text(xml.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<!', lt)) throw new XmlError('doctype');
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlError('malformed');
      i = end + 2;
      continue;
    }
    const gt = findTagEnd(xml, lt + 1);
    if (gt < 0) throw new XmlError('malformed');
    const raw = xml.slice(lt + 1, gt);
    if (raw.startsWith('/')) {
      depth -= 1;
      if (depth < 0) throw new XmlError('malformed');
      h.close?.(localName(raw.slice(1).trim()));
    } else {
      const selfClosing = raw.endsWith('/');
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const space = body.search(/\s/);
      const qname = space < 0 ? body : body.slice(0, space);
      if (qname === '') throw new XmlError('malformed');
      const name = localName(qname);
      h.open?.(name, space < 0 ? {} : parseAttrs(body.slice(space)), selfClosing);
      if (selfClosing) h.close?.(name);
      else if (++depth > MAX_DEPTH) throw new XmlError('too_deep');
    }
    i = gt + 1;
  }
}

/** Краят на тага — „>“ извън кавичките на атрибутите. */
function findTagEnd(xml: string, from: number): number {
  let quote: string | null = null;
  for (let j = from; j < xml.length; j += 1) {
    const c = xml[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return j;
    }
  }
  return -1;
}

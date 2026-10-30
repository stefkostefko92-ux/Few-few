// A strict XML 1.0 reader for the tests of the SVG files (svg.test.ts), no DTD: it refuses what a conforming parser
// refuses in such a file — a character XML forbids, a tag closed out of order or never, an attribute unquoted or twice,
// '<' in a text or a value, '&' that is not a reference to one of the five entities or a character — and gives the
// tree, the texts and values decoded. Not a test itself (no .test.ts).

export interface El {
  name: string;
  attrs: Record<string, string>;
  children: (El | string)[];
}

const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/;
const ENTITY: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** A text or a value decoded; an error for a '&' that is no reference or a '<'. */
function decode(s: string, where: string): string {
  if (s.includes('<')) throw new Error(`'<' in ${where}`);
  return s.replace(/&([^;]*);?/g, (m, ref: string) => {
    if (!m.endsWith(';')) throw new Error(`bare '&' in ${where}`);
    if (ref in ENTITY) return ENTITY[ref] ?? '';
    const n = /^#x[0-9a-fA-F]+$/.test(ref) ? parseInt(ref.slice(2), 16) : /^#[0-9]+$/.test(ref) ? parseInt(ref.slice(1), 10) : NaN;
    if (Number.isNaN(n)) throw new Error(`unknown reference ${m} in ${where}`);
    return String.fromCodePoint(n);
  });
}

/** The root element of `xml`, or an error saying why it is not well-formed. */
export function parseXml(xml: string): El {
  if (/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u.test(xml)) throw new Error('a character XML forbids');
  let at = 0;
  const stack: El[] = [];
  let root: El | null = null;
  const skip = (re: RegExp): string => {
    const m = re.exec(xml.slice(at));
    if (!m || m.index !== 0) return '';
    at += m[0].length;
    return m[0];
  };
  while (at < xml.length) {
    if (xml.startsWith('<?', at)) {
      const end = xml.indexOf('?>', at);
      if (end < 0) throw new Error('processing instruction not closed');
      at = end + 2;
    } else if (xml.startsWith('<!--', at)) {
      const end = xml.indexOf('-->', at);
      if (end < 0) throw new Error('comment not closed');
      at = end + 3;
    } else if (xml.startsWith('<![CDATA[', at)) {
      const end = xml.indexOf(']]>', at), top = stack[stack.length - 1];
      if (end < 0 || !top) throw new Error('CDATA outside an element or not closed');
      top.children.push(xml.slice(at + 9, end));
      at = end + 3;
    } else if (xml.startsWith('</', at)) {
      at += 2;
      const name = skip(NAME), top = stack.pop();
      skip(/^\s*/);
      if (!top || top.name !== name || xml[at] !== '>') throw new Error(`end tag ${name} out of order`);
      at++;
    } else if (xml[at] === '<') {
      at++;
      const name = skip(NAME);
      if (!name) throw new Error('a tag without a name');
      const el: El = { name, attrs: {}, children: [] };
      for (;;) {
        const space = skip(/^\s+/);
        if (xml[at] === '>' || xml.startsWith('/>', at)) break;
        const attr = skip(NAME);
        if (!attr || !space) throw new Error(`bad attribute in <${name}>`);
        if (!skip(/^\s*=\s*/)) throw new Error(`attribute ${attr} without a value`);
        const q = xml[at];
        if (q !== '"' && q !== "'") throw new Error(`attribute ${attr} not quoted`);
        const end = xml.indexOf(q, at + 1);
        if (end < 0) throw new Error(`attribute ${attr} not closed`);
        if (attr in el.attrs) throw new Error(`attribute ${attr} twice`);
        el.attrs[attr] = decode(xml.slice(at + 1, end), `${name}@${attr}`);
        at = end + 1;
      }
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(el);
      else if (root) throw new Error('a second root element');
      else root = el;
      if (xml.startsWith('/>', at)) at += 2;
      else { at++; stack.push(el); }
    } else {
      const end = xml.indexOf('<', at), raw = xml.slice(at, end < 0 ? xml.length : end), top = stack[stack.length - 1];
      if (top) top.children.push(decode(raw, top.name));
      else if (raw.trim()) throw new Error('text outside the root element');
      at += raw.length;
    }
  }
  if (stack.length || !root) throw new Error('an element not closed, or no root');
  return root;
}

/** The elements under `el`, in document order. */
export function elements(el: El): El[] {
  return el.children.flatMap((c) => (typeof c === 'string' ? [] : [c, ...elements(c)]));
}

/** The text inside `el`. */
export const textOf = (el: El): string => el.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');

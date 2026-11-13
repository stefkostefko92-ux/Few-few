/**
 * Строг XML парсер за недоверени файлове (SPEC 54–55: банкови извлечения, входящи е-фактури). Без
 * зависимост и без DTD по конструкция: <!DOCTYPE> и <!ENTITY> се отказват, ентитетите са само петте
 * предефинирани и числовите — XXE и „billion laughs“ не са възможни. Таван на дълбочината и на броя
 * елементи. Имената са без префикса на пространството (`cbc:ID` → `ID`); xmlns атрибутите отпадат.
 */
export class XmlError extends Error {
  constructor(
    readonly code: 'dtd' | 'syntax' | 'entity' | 'limit',
    message: string = code,
  ) {
    super(message);
  }
}

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Прекият текст (без този на децата), събран и без разлика CDATA/текст. */
  text: string;
}

export const MAX_DEPTH = 64;
export const MAX_ELEMENTS = 200_000;

const NAME = /^[A-Za-z_][\w.\-]*(?::[A-Za-z_][\w.\-]*)?$/;
const PREDEFINED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function local(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

function decode(raw: string): string {
  if (raw.includes(']]>')) throw new XmlError('syntax', 'Неочаквано „]]>“');
  return raw.replace(/&([^;&\s]*);?/g, (match, ref: string) => {
    if (!match.endsWith(';')) throw new XmlError('entity', 'Незатворена препратка');
    if (Object.hasOwn(PREDEFINED, ref)) return PREDEFINED[ref]!;
    const numeric = /^#(?:x([0-9A-Fa-f]{1,6})|([0-9]{1,7}))$/.exec(ref);
    if (!numeric) throw new XmlError('entity', `Непозната препратка &${ref};`);
    const code = numeric[1] !== undefined ? parseInt(numeric[1], 16) : Number(numeric[2]);
    const allowed =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (!allowed) throw new XmlError('entity', 'Забранен знак');
    return String.fromCodePoint(code);
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const seen = new Set<string>();
  const pattern = /\s+([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;
  let rest = source;
  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  let consumed = 0;
  while ((match = pattern.exec(rest)) !== null) {
    const name = match[1]!;
    if (!NAME.test(name)) throw new XmlError('syntax', `Невалиден атрибут ${name}`);
    if (seen.has(name)) throw new XmlError('syntax', `Двоен атрибут ${name}`);
    seen.add(name);
    consumed = pattern.lastIndex;
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
    attrs[local(name)] = decode(match[2] ?? match[3] ?? '');
  }
  rest = source.slice(consumed);
  if (rest.trim() !== '') throw new XmlError('syntax', 'Невалидни атрибути');
  return attrs;
}

export function parseXml(input: string): XmlNode {
  const xml = input.startsWith('﻿') ? input.slice(1) : input;
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new XmlError('dtd', 'DTD не се приема');
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let count = 0;
  let i = 0;
  const text = (raw: string) => {
    const top = stack[stack.length - 1];
    if (!top) {
      if (raw.trim() !== '') throw new XmlError('syntax', 'Текст извън корена');
      return;
    }
    top.text += raw;
  };
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      text(decode(xml.slice(i)));
      break;
    }
    if (lt > i) text(decode(xml.slice(i, lt)));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new XmlError('syntax', 'Незатворен коментар');
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1 || stack.length === 0) throw new XmlError('syntax', 'Невалидна CDATA');
      text(xml.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) throw new XmlError('syntax', 'Незатворена инструкция');
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!', lt)) throw new XmlError('dtd', 'Декларации не се приемат');
    const gt = xml.indexOf('>', lt + 1);
    if (gt === -1) throw new XmlError('syntax', 'Незатворен таг');
    // „>“ в стойност на атрибут: търси се края на тага извън кавичките.
    let end = lt + 1;
    let quote: string | null = null;
    for (; end < xml.length; end += 1) {
      const c = xml[end];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
    }
    if (end >= xml.length) throw new XmlError('syntax', 'Незатворен таг');
    const body = xml.slice(lt + 1, end);
    i = end + 1;
    if (body.startsWith('/')) {
      const name = body.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== local(name) || !NAME.test(name)) {
        throw new XmlError('syntax', `Неочакван край </${name}>`);
      }
      continue;
    }
    const selfClosing = body.endsWith('/');
    const inner = selfClosing ? body.slice(0, -1) : body;
    const nameMatch = /^([^\s/>]+)/.exec(inner);
    const name = nameMatch?.[1] ?? '';
    if (!NAME.test(name)) throw new XmlError('syntax', `Невалидно име ${name}`);
    const node: XmlNode = {
      name: local(name),
      attrs: parseAttributes(inner.slice(name.length)),
      children: [],
      text: '',
    };
    count += 1;
    if (count > MAX_ELEMENTS) throw new XmlError('limit', 'Твърде много елементи');
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      if (root) throw new XmlError('syntax', 'Повече от един корен');
      root = node;
    }
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > MAX_DEPTH) throw new XmlError('limit', 'Твърде дълбоко');
    }
  }
  if (stack.length > 0)
    throw new XmlError('syntax', `Незатворен <${stack[stack.length - 1]!.name}>`);
  if (!root) throw new XmlError('syntax', 'Празен документ');
  return root;
}

/** Първото дете с това име (без префикс). */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** Възелът по пътя „A/B/C“ (първите съвпадения). */
export function at(node: XmlNode | undefined, path: string): XmlNode | undefined {
  let current = node;
  for (const part of path.split('/')) current = child(current, part);
  return current;
}

/** Текстът по пътя, подрязан; празен → undefined. */
export function textAt(node: XmlNode | undefined, path: string): string | undefined {
  const value = at(node, path)?.text.trim();
  return value ? value : undefined;
}

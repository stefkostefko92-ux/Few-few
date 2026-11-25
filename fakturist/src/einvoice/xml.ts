/**
 * Минимален строител на XML без зависимости: дърво от елементи, екраниране на текста и атрибутите,
 * отстъпи. Липсваща стойност (`undefined`/`null`) просто не създава елемент — така незадължителните
 * термини на EN 16931 изчезват сами, без `if` на всяка стъпка.
 */
export interface XmlElement {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: ReadonlyArray<XmlElement | string>;
}

export type Child = XmlElement | string | number | null | undefined | false | readonly Child[];
type Attrs = Record<string, string | undefined | null>;

function cleanAttrs(attrs: Attrs | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

function flatten(children: readonly Child[]): Array<XmlElement | string> {
  const out: Array<XmlElement | string> = [];
  for (const child of children) {
    if (child === undefined || child === null || child === false) continue;
    if (Array.isArray(child)) out.push(...flatten(child as readonly Child[]));
    else if (typeof child === 'number') out.push(String(child));
    else out.push(child as XmlElement | string);
  }
  return out;
}

/** Елемент с деца; без деца се пропуска (връща null), освен ако `keepEmpty`. */
export function el(name: string, attrs: Attrs | null, ...children: Child[]): XmlElement | null {
  const kids = flatten(children);
  if (kids.length === 0) return null;
  return { name, attrs: cleanAttrs(attrs ?? undefined), children: kids };
}

/** Задължителен елемент, който в XSD трябва да присъства дори празен (CII ApplicableHeaderTradeDelivery). */
export function required(name: string, ...children: Child[]): XmlElement {
  return { name, attrs: {}, children: flatten(children) };
}

/** Лист със стойност; без стойност — null. */
export function leaf(
  name: string,
  value: string | undefined | null,
  attrs?: Attrs,
): XmlElement | null {
  if (value === undefined || value === null || value === '') return null;
  return { name, attrs: cleanAttrs(attrs), children: [value] };
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

/** Знаците, които XML 1.0 не допуска — изчистват се, вместо да счупят документа. */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function renderNode(node: XmlElement, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value.replace(INVALID_XML, ''))}"`)
    .join('');
  if (node.children.length === 0) {
    out.push(`${indent}<${node.name}${attrs}/>`);
    return;
  }
  if (node.children.every((child) => typeof child === 'string')) {
    const text = (node.children as string[]).join('').replace(INVALID_XML, '');
    out.push(`${indent}<${node.name}${attrs}>${escapeText(text)}</${node.name}>`);
    return;
  }
  out.push(`${indent}<${node.name}${attrs}>`);
  for (const child of node.children) {
    if (typeof child === 'string')
      out.push(`${indent}  ${escapeText(child.replace(INVALID_XML, ''))}`);
    else renderNode(child, depth + 1, out);
  }
  out.push(`${indent}</${node.name}>`);
}

export function renderXml(root: XmlElement): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  renderNode(root, 0, out);
  return `${out.join('\n')}\n`;
}

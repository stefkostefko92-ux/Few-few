import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXml, XmlError, child, children, textAt } from '../src/xml/parse.js';

/** SPEC 55: строгият парсер — входящите е-фактури и банковите извлечения са недоверени данни. */
test('елементи, атрибути, пространства от имена, текст, CDATA, коментари', () => {
  const root = parseXml(
    `﻿<?xml version="1.0" encoding="UTF-8"?>
<!-- коментар -->
<Invoice xmlns="urn:x" xmlns:cbc="urn:cbc"><cbc:ID>0000000001</cbc:ID>
  <cbc:Note><![CDATA[Текст & <нещо>]]></cbc:Note>
  <cbc:PayableAmount currencyID='EUR'>10.80</cbc:PayableAmount>
  <cac:Empty xmlns:cac="urn:cac"/>
</Invoice>`,
  );
  assert.equal(root.name, 'Invoice');
  assert.equal(textAt(root, 'ID'), '0000000001');
  assert.equal(textAt(root, 'Note'), 'Текст & <нещо>');
  assert.equal(child(root, 'PayableAmount')?.attrs['currencyID'], 'EUR');
  assert.equal(children(root, 'Empty').length, 1);
});

test('предефинираните и числовите препратки се разчитат; други — грешка', () => {
  const root = parseXml('<a b="x &quot;y&quot;">&lt;&gt;&amp;&apos;&#1041;&#x42;</a>');
  assert.equal(root.attrs['b'], 'x "y"');
  assert.equal(root.text, `<>&'БB`);
  assert.throws(() => parseXml('<a>&nbsp;</a>'), XmlError);
  assert.throws(() => parseXml('<a>&#0;</a>'), XmlError);
});

test('DTD, ентитети и външни препратки са забранени (XXE, billion laughs)', () => {
  assert.throws(
    () =>
      parseXml(
        '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a>&x;</a>',
      ),
    (error: unknown) => error instanceof XmlError && error.code === 'dtd',
  );
  assert.throws(() => parseXml('<!doctype a><a/>'), XmlError);
});

test('лошо оформен XML — грешка, не тих резултат', () => {
  for (const bad of [
    '',
    '<a>',
    '<a></b>',
    '<a><b></a></b>',
    '<a/><b/>',
    'текст<a/>',
    '<a x="1" x="2"/>',
    '<a x=1/>',
    '<1a/>',
    '<a>]]></a>',
  ]) {
    assert.throws(() => parseXml(bad), XmlError, bad);
  }
});

test('дълбочина и брой елементи имат таван', () => {
  assert.throws(() => parseXml('<a>'.repeat(200) + '</a>'.repeat(200)), XmlError);
  assert.throws(() => parseXml(`<a>${'<b/>'.repeat(200_001)}</a>`), XmlError);
});

test('ревю: забранени управляващи знаци (вкл. 0x00) — отказ', () => {
  assert.throws(() => parseXml('<a><!-- \u0000 --></a>'), XmlError);
  assert.throws(() => parseXml('<a>\u0007</a>'), XmlError);
  assert.equal(parseXml('<a>\tред\r\n</a>').text, '\tред\r\n');
});

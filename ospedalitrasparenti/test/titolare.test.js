// Издателят на сайта: кой отговаря, как се свързваш, кое е регистрираното дружество (QRG: при YMYL липсата на
// отговорно лице и контакт е „Lowest“). Един източник — config.json → src/lib/titolare.js — за бележките,
// footer-а и Organization в JSON-LD; видимият контакт е същият като в схемата (NAP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITOLARE, orgJsonLd } from '../src/lib/titolare.js';
import { shellBottom } from '../src/lib/site-ui.js';
import { renderNoteLegali } from '../src/render/legal.js';

const SU = 'https://ospedalitrasparenti.it';

test('config.json носи пълните реквизити на издателя и отговорното лице', () => {
  assert.equal(TITOLARE.nome, 'Carbon Stealth VCC');
  assert.equal(TITOLARE.nomeLegale, 'Карбон Стелт ЕДПК');
  assert.equal(TITOLARE.eik, '208725180');
  assert.equal(TITOLARE.partitaIva, 'BG208725180');
  assert.equal(TITOLARE.responsabile, 'Stefan Kostadinov');
  assert.equal(TITOLARE.email, 'info@carbonstealth.eu');
  assert.deepEqual(TITOLARE.telefoni, ['+39 379 296 9699', '+359 877 414 874']);
  assert.match(TITOLARE.indirizzo, /Samuil 3, 2670 Bobov Dol/);
});

test('orgJsonLd: #org с контакт; правните данни са на дружеството-майка, не на проекта', () => {
  const o = orgJsonLd(SU);
  assert.equal(o['@id'], `${SU}/#org`);
  assert.equal(o.email, 'info@carbonstealth.eu');
  assert.equal(o.telephone, '+39 379 296 9699');
  assert.equal(o.contactPoint['@type'], 'ContactPoint');
  assert.equal(o.contactPoint.email, 'info@carbonstealth.eu');
  assert.ok(!('vatID' in o) && !('legalName' in o), 'проектът не е отделно юридическо лице');
  const p = o.parentOrganization;
  assert.equal(p['@id'], 'https://carbonstealth.eu/#org');
  assert.equal(p.legalName, 'Карбон Стелт ЕДПК');
  assert.equal(p.vatID, 'BG208725180');
  assert.equal(p.taxID, '208725180');
  assert.equal(p.address['@type'], 'PostalAddress');
  assert.equal(p.address.postalCode, '2670');
  assert.equal(p.address.addressCountry, 'BG');
  assert.equal(p.telephone, '+359 877 414 874');
});

test('telefoni: само непразни низове — число или празно в config не чупи билда', async () => {
  const { telefoni } = await import('../src/lib/titolare.js');
  assert.deepEqual(telefoni({ telefoni: /** @type {any} */ (['+39 1', 393792969699, '', '  ', '+359 2']) }), ['+39 1', '+359 2']);
  assert.deepEqual(telefoni({}), []);
});

test('orgJsonLd: проектът няма sameAs към дружеството — връзката е само parentOrganization', () => {
  assert.ok(!('sameAs' in orgJsonLd(SU)));
});

test('footer: връзка „Contatti“ и видимият контакт = контактът от схемата', () => {
  const f = shellBottom({ rel: '' });
  assert.match(f, /<a href="note-legali\.html#contatti">Contatti<\/a>/);
  assert.ok(f.includes('info@carbonstealth.eu'));
  assert.ok(f.includes('+39 379 296 9699'));
  assert.match(shellBottom({ rel: '../' }), /<a href="\.\.\/note-legali\.html#contatti">Contatti<\/a>/);
});

test('note legali: раздел #contatti с отговорното лице, двата телефона, ЕИК и ДДС', () => {
  const h = renderNoteLegali();
  assert.match(h, /<h2 id="contatti">/);
  assert.ok(h.includes('Stefan Kostadinov'));
  assert.ok(h.includes('+39 379 296 9699') && h.includes('+359 877 414 874'));
  assert.ok(h.includes('208725180') && h.includes('BG208725180'));
  assert.ok(h.includes('Карбон Стелт ЕДПК'));
  assert.match(h, /href="mailto:info@carbonstealth\.eu"/);
  assert.match(h, /href="tel:\+393792969699"/);
});

// Доверие (tools/seo/doverie.md): обхождач без JavaScript трябва да види от началната кой стои зад играта,
// как се свързваш и къде е политиката за поверителност. Footer-ът на Landing.tsx се рисува в браузъра,
// затова сървърният шел (client/index.html → #seo-bootstrap) носи същите връзки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SHELL = fs.readFileSync(path.resolve(__dirname, '../../../../client/index.html'), 'utf8');
const boot = (SHELL.match(/<div id="seo-bootstrap"[\s\S]*?<\/div>\s*<div id="root">/) || [''])[0];

test('#seo-bootstrap носи контакт (mailto), поверителност, условия и издателя', () => {
  assert.ok(boot, 'няма #seo-bootstrap преди #root');
  assert.match(boot, /<a href="mailto:info@carbonstealth\.eu">/);
  assert.match(boot, /<a href="\/privacy">/);
  assert.match(boot, /<a href="\/terms">/);
  assert.match(boot, /Carbon Stealth VCC/);
});

test('Organization в JSON-LD: контакт и дружеството с каноничния @id и реквизитите', () => {
  const graph = JSON.parse((SHELL.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || ['', '{}'])[1]);
  const nodes: Record<string, any>[] = graph['@graph'] ?? [graph];
  const org = nodes.find((n) => n['@type'] === 'Organization');
  assert.ok(org, 'няма Organization');
  assert.equal(org!.email, 'info@carbonstealth.eu');
  const p = org!.parentOrganization;
  assert.equal(p['@id'], 'https://carbonstealth.eu/#organization');
  assert.equal(p.vatID, 'BG208725180');
  assert.equal(p.taxID, '208725180');
  assert.equal(p.legalName, 'Карбон Стелт ЕДПК');
});

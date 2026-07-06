// ============================================================
//  PANEV ASCENSORI — Database seed
//  Creates default admin user + seeds 27 products (staffe)
//  Usage:  node scripts/seed.js
// ============================================================

'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('../lib/db');

// ── Default admin ─────────────────────────────────────────────
// No hardcoded default password: use ADMIN_PASSWORD if set, else generate a
// random one and print it ONCE. This stops shipping a repo-known credential.
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL || 'info@panevascensori.it';
const ADMIN_PW_FROM_ENV = !!process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(12).toString('base64url');

function seedAdmin() {
  const existing = db.getAdminByEmail(ADMIN_EMAIL);
  if (existing) {
    console.log(`[seed] Admin già presente: ${ADMIN_EMAIL} (id=${existing.id})`);
    return;
  }
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  db.createAdmin(ADMIN_EMAIL, hash, 'Amministratore');
  console.log(`[seed] ✓ Admin creato: ${ADMIN_EMAIL}`);
  if (ADMIN_PW_FROM_ENV) {
    console.log(`[seed]   Password: (da ADMIN_PASSWORD nell'ambiente)`);
  } else {
    console.log(`[seed]   Password generata (mostrata UNA volta): ${ADMIN_PASSWORD}`);
  }
  console.log(`[seed]   ⚠  CAMBIARE dopo il primo login da /admin/impostazioni.html`);
}

// ── Products ──────────────────────────────────────────────────
// Match the catalog in js/app.js — 27 staffe
const PRODUCTS = [
  // ═══ GAMMA STAFFE PORTE — BREVETTATE ═══
  { id: 'A6517', name: 'Staffa Porta A 65.170.7', category: 'Staffe Porte Brevettate',
    codice: 'COD.- A 65 170 7', price: 13.03, priceLabel: '13,03 €',
    spessore: '5mm', larghezza: '65mm', lunghezza: '170mm', asole: 7,
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte superiore',
    description: 'Staffa angolare brevettata per fissaggio porta di piano (superiore). Spessore 5mm, larghezza 65mm, lunghezza 170mm, 7 asole. Ambidestra SX/DX. Brevetto N. 202023000002112 — UIBM 07/01/2025.',
    image: 'img/staffa-A65-170.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: true, patented: true, sortOrder: 10 },

  { id: 'B65320', name: 'Staffa Porta B 65.320', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 65 320', price: 11.21, priceLabel: '11,21 €',
    spessore: '5mm', larghezza: '65mm', lunghezza: '320mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte inferiore',
    description: 'Staffa dritta brevettata per porta di piano (inferiore), altezza 320mm, larghezza 65mm, spessore 5mm. Asole verticali, regolazione ±8°. Si abbina a A 65 170 7. Brevetto N. 202023000002112.',
    image: 'img/staffa-B65-320.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: true, patented: true, sortOrder: 11 },

  { id: 'B65220', name: 'Staffa Porta B 65.220', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 65 220', price: 9.98, priceLabel: '9,98 €',
    spessore: '5mm', larghezza: '65mm', lunghezza: '220mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte inferiore ridotta',
    description: 'Staffa dritta brevettata per porta di piano (inferiore ridotta), altezza 220mm, larghezza 65mm, spessore 5mm. Regolazione ±8°. Si abbina a A 65 170 7. Brevetto N. 202023000002112.',
    image: 'img/staffa-B65-220.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: true, patented: true, sortOrder: 12 },

  { id: 'A4517', name: 'Staffa Porta A 45.170.7', category: 'Staffe Porte Brevettate',
    codice: 'COD.- A 45 170 7', price: 11.87, priceLabel: '11,87 €',
    spessore: '5mm', larghezza: '45mm', lunghezza: '170mm', asole: 7,
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte superiore',
    description: 'Staffa angolare brevettata per fissaggio porta di piano (superiore). Spessore 5mm, larghezza 45mm, lunghezza 170mm, 7 asole. Ambidestra SX/DX. Brevetto N. 202023000002112.',
    image: 'img/staffa-A45-170.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: true, patented: true, sortOrder: 20 },

  { id: 'B45320', name: 'Staffa Porta B 45.320', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 45 320', price: 10.93, priceLabel: '10,93 €',
    spessore: '5mm', larghezza: '45mm', lunghezza: '320mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte inferiore',
    description: 'Staffa dritta brevettata per porta di piano (inferiore), altezza 320mm, larghezza 45mm, spessore 5mm. Regolazione ±7°. Si abbina a A 45 170 7. Brevetto N. 202023000002112.',
    image: 'img/staffa-B45-320.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 21 },

  { id: 'B45220', name: 'Staffa Porta B 45.220', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 45 220', price: 9.72, priceLabel: '9,72 €',
    spessore: '5mm', larghezza: '45mm', lunghezza: '220mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Staffa porte inferiore ridotta',
    description: 'Staffa dritta brevettata (inferiore ridotta), altezza 220mm, larghezza 45mm, spessore 5mm. Regolazione ±7°. Si abbina a A 45 170 7. Brevetto N. 202023000002112.',
    image: 'img/staffa-B45-220.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 22 },

  { id: 'A37157', name: 'Staffa Porta A 37.150.7', category: 'Staffe Porte Brevettate',
    codice: 'COD.- A 37 150 7', price: 11.43, priceLabel: '11,43 €',
    spessore: '4mm', larghezza: '37mm', lunghezza: '150mm', asole: 7,
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa porte superiore',
    description: 'Staffa angolare brevettata per fissaggio porta di piano (superiore). Spessore 4mm, larghezza 37mm, lunghezza 150mm, 7 asole. Ambidestra SX/DX. Brevetto N. 202023000002112.',
    image: 'img/staffa-A37-150.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 30 },

  { id: 'B37320', name: 'Staffa Porta B 37.320', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 37 320', price: 10.79, priceLabel: '10,79 €',
    spessore: '4mm', larghezza: '37mm', lunghezza: '320mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa porte inferiore',
    description: 'Staffa dritta brevettata (inferiore), altezza 320mm, larghezza 37mm, spessore 4mm. Regolazione ±7°. Si abbina a A 37 150 7. Brevetto N. 202023000002112.',
    image: 'img/staffa-B37-320.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 31 },

  { id: 'B37220', name: 'Staffa Porta B 37.220', category: 'Staffe Porte Brevettate',
    codice: 'COD.- B 37 220', price: 9.52, priceLabel: '9,52 €',
    spessore: '4mm', larghezza: '37mm', lunghezza: '220mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa porte inferiore ridotta',
    description: 'Staffa dritta brevettata (inferiore ridotta), altezza 220mm, larghezza 37mm, spessore 4mm. Regolazione ±7°. Brevetto N. 202023000002112.',
    image: 'img/staffa-B37-220.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 32 },

  { id: 'A37172', name: 'Staffa Porta A 37.170.2', category: 'Staffe Porte Brevettate',
    codice: 'COD.- A 37170 2', price: 10.23, priceLabel: '10,23 €',
    spessore: '4mm', larghezza: '37mm', lunghezza: '170mm', asole: 2,
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa porte superiore',
    description: 'Staffa angolare brevettata per fissaggio porta di piano (superiore), 2 asole. Spessore 4mm, larghezza 37mm, lunghezza 170mm. Ambidestra SX/DX. Brevetto N. 202023000002112.',
    image: 'img/staffa-A37170-2.png', icon: '🔩', badge: '🏛 Brevettata',
    available: true, featured: false, patented: true, sortOrder: 33 },

  // ═══ GAMMA STAFFE CONTRAPESO ═══
  { id: 'SU220160', name: 'Supporto Staffa Guide SU 220.160', category: 'Staffe Contrapeso',
    codice: 'COD.- SU 220 160', price: 10.40, priceLabel: '10,40 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '160mm', range: '45-155mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 160mm, spessore 5mm. Range di estensione 45-155mm. Si abbina a COD.- SG 80 150.',
    image: 'img/staffa-SU220-160.png', icon: '⚖️',
    available: true, featured: true, patented: false, sortOrder: 100 },

  { id: 'SU220180', name: 'Supporto Staffa Guide SU 220.180', category: 'Staffe Contrapeso',
    codice: 'COD.- SU 220 180', price: 10.79, priceLabel: '10,79 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '180mm', range: '45-195mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 180mm, spessore 5mm. Range di estensione 45-195mm. Si abbina a COD.- SG 80 170.',
    image: 'img/staffa-SU220-180.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 101 },

  { id: 'SU220200', name: 'Supporto Staffa Guide SU 220.200', category: 'Staffe Contrapeso',
    codice: 'COD.- SU 220 200', price: 11.05, priceLabel: '11,05 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '200mm', range: '45-215mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 200mm, spessore 5mm. Range di estensione 45-215mm. Si abbina a COD.- SG 80 190.',
    image: 'img/staffa-SU220-200.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 102 },

  { id: 'SD150160', name: 'Supporto Staffa Guide SD 150.160', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 150 160', price: 9.23, priceLabel: '9,23 €',
    spessore: '5mm', larghezza: '150mm', lunghezza: '160mm', range: '45-155mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 150mm, lunghezza 160mm, spessore 5mm. Range di estensione 45-155mm. Si abbina a COD.- SG 80 150.',
    image: 'img/staffa-SD150-160.png', icon: '⚖️',
    available: true, featured: true, patented: false, sortOrder: 110 },

  { id: 'SD150180', name: 'Supporto Staffa Guide SD 150.180', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 150 180', price: 9.49, priceLabel: '9,49 €',
    spessore: '5mm', larghezza: '150mm', lunghezza: '180mm', range: '45-195mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 150mm, lunghezza 180mm, spessore 5mm. Range di estensione 45-195mm. Si abbina a COD.- SG 80 170.',
    image: 'img/staffa-SD150-180.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 111 },

  { id: 'SD150200', name: 'Supporto Staffa Guide SD 150.200', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 150 200', price: 9.75, priceLabel: '9,75 €',
    spessore: '5mm', larghezza: '150mm', lunghezza: '200mm', range: '45-215mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 150mm, lunghezza 200mm, spessore 5mm. Range di estensione 45-215mm. Si abbina a COD.- SG 80 190.',
    image: 'img/staffa-SD150-200.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 112 },

  { id: 'SD220160', name: 'Supporto Staffa Guide SD 220.160', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 220 160', price: 10.40, priceLabel: '10,40 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '160mm', range: '50-155mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 160mm, spessore 5mm. Range di estensione 50-155mm. Si abbina a COD.- SG 80 150.',
    image: 'img/staffa-SD220-160.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 120 },

  { id: 'SD220180', name: 'Supporto Staffa Guide SD 220.180', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 220 180', price: 10.66, priceLabel: '10,66 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '180mm', range: '45-195mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 180mm, spessore 5mm. Range di estensione 45-195mm. Si abbina a COD.- SG 80 170.',
    image: 'img/staffa-SD220-180.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 121 },

  { id: 'SD220200', name: 'Supporto Staffa Guide SD 220.200', category: 'Staffe Contrapeso',
    codice: 'COD.- SD 220 200', price: 10.92, priceLabel: '10,92 €',
    spessore: '5mm', larghezza: '220mm', lunghezza: '200mm', range: '45-215mm',
    materiale: 'Ferro sp.5mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide per contrapeso, larghezza 220mm, lunghezza 200mm, spessore 5mm. Range di estensione 45-215mm. Si abbina a COD.- SG 80 190.',
    image: 'img/staffa-SD220-200.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 122 },

  { id: 'SC80200', name: 'Supporto Staffa Guide SC 80.200', category: 'Staffe Contrapeso',
    codice: 'COD.- SC 80 200', price: 9.75, priceLabel: '9,75 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '200mm', range: '45-215mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide piatto, sezione 80x200mm, spessore 4mm. Range 45-215mm. Si abbina a COD.- SG 80 190.',
    image: 'img/staffa-SC80-200.png', icon: '⚖️',
    available: true, featured: true, patented: false, sortOrder: 130 },

  { id: 'SC80220', name: 'Supporto Staffa Guide SC 80.220', category: 'Staffe Contrapeso',
    codice: 'COD.- SC 80 220', price: 10.40, priceLabel: '10,40 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '220mm', range: '45-255mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide piatto, sezione 80x220mm, spessore 4mm. Range 45-255mm. Si abbina a COD.- SG 80 220.',
    image: 'img/staffa-SC80-220.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 131 },

  { id: 'SC90200', name: 'Supporto Staffa Guide SC 90.200', category: 'Staffe Contrapeso',
    codice: 'COD.- SC 90 200', price: 10.01, priceLabel: '10,01 €',
    spessore: '4mm', larghezza: '90mm', lunghezza: '200mm', range: '45-215mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide piatto, sezione 90x200mm, spessore 4mm. Range 45-215mm. Si abbina a COD.- SG 80 190.',
    image: 'img/staffa-SC90-200.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 140 },

  { id: 'SC90220', name: 'Supporto Staffa Guide SC 90.220', category: 'Staffe Contrapeso',
    codice: 'COD.- SC 90 220', price: 10.79, priceLabel: '10,79 €',
    spessore: '4mm', larghezza: '90mm', lunghezza: '220mm', range: '45-235mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Supporto staffa guide',
    description: 'Supporto staffa guide piatto, sezione 90x220mm, spessore 4mm. Range 45-235mm. Si abbina a COD.- SG 80 220.',
    image: 'img/staffa-SC90-220.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 141 },

  // ── Staffe Guide SG 80 ──
  { id: 'SG80150', name: 'Staffa Guide SG 80.150', category: 'Staffe Contrapeso',
    codice: 'COD.- SG 80 150', price: 9.49, priceLabel: '9,49 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '150mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa guide',
    description: 'Staffa guide per contrapeso, sezione 80x150mm, spessore 4mm. Si abbina ai supporti SU 220 160, SD 150 160, SD 220 160.',
    image: 'img/staffa-SG80-150.png', icon: '⚖️',
    available: true, featured: true, patented: false, sortOrder: 200 },

  { id: 'SG80170', name: 'Staffa Guide SG 80.170', category: 'Staffe Contrapeso',
    codice: 'COD.- SG 80 170', price: 9.62, priceLabel: '9,62 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '170mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa guide',
    description: 'Staffa guide per contrapeso, sezione 80x170mm, spessore 4mm. Si abbina a SU 220 180, SD 150 180, SD 220 180.',
    image: 'img/staffa-SG80-170.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 201 },

  { id: 'SG80190', name: 'Staffa Guide SG 80.190', category: 'Staffe Contrapeso',
    codice: 'COD.- SG 80 190', price: 9.62, priceLabel: '9,62 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '190mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa guide',
    description: 'Staffa guide per contrapeso, sezione 80x190mm, spessore 4mm. Si abbina a SU 220 200, SC 80 200, SC 90 200, SD 220 200.',
    image: 'img/staffa-SG80-190.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 202 },

  { id: 'SG80220', name: 'Staffa Guide SG 80.220', category: 'Staffe Contrapeso',
    codice: 'COD.- SG 80 220', price: 9.75, priceLabel: '9,75 €',
    spessore: '4mm', larghezza: '80mm', lunghezza: '220mm',
    materiale: 'Ferro sp.4mm', descrizione: 'Staffa guide',
    description: 'Staffa guide per contrapeso, sezione 80x220mm, spessore 4mm. Si abbina a SC 80 220, SC 90 220.',
    image: 'img/staffa-SG80-220.png', icon: '⚖️',
    available: true, featured: false, patented: false, sortOrder: 203 },
];

function seedProducts() {
  const existing = db.countProducts();
  if (existing > 0) {
    console.log(`[seed] ${existing} prodotti già presenti — skip`);
    return;
  }
  const insertMany = db.raw.transaction(items => {
    for (const p of items) db.insertProduct(p);
  });
  insertMany(PRODUCTS);
  console.log(`[seed] ✓ ${PRODUCTS.length} prodotti seed`);
}

// ── Run ───────────────────────────────────────────────────────
try {
  seedAdmin();
  seedProducts();
  console.log('[seed] ✓ Done');
  process.exit(0);
} catch (err) {
  console.error('[seed] Errore:', err);
  process.exit(1);
}

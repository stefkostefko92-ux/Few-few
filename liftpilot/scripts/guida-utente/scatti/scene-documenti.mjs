// Scenes of the guide's screenshots: the first installation's documents (the data of the plant, the drawing set and its
// revision, the relazione tecnica di modifica), its page compared with its survey, the lists and the home.
import assert from 'node:assert/strict';
import { step } from '../../smoke-kit.mjs';
import { BASE, COMPANY, S, TESTER, as, fresh, goto, hydrated, modalita, skip } from './ambiente.mjs';
import { demoPdf, logoPng, platePng } from './disegni.mjs';
import { FORM, saveCalc, saveSheet } from './scene-rilievi.mjs';
import { shot, wideClip } from './scatto.mjs';

export async function p1docs() {
  step('documents of the first installation: the data of the plant, the drawing set and a revision');
  const { page, errors } = await as('chief');
  // the form that issues the drawings, before the plant's data are in (it says so)
  await goto(page, S.lift1);
  await shot('emissione-tavole-modulo', page.locator('.panel:has(input[maxlength="12"]), section:has(> form input[maxlength="12"])').last(), { pad: 12 });

  // the data of the plant: the client's logo, the plant's data, the optional ones
  await goto(page, `${S.p1}/impianto`);
  await page.setInputFiles('.panel input[name="logo"]', { name: 'logo-condominio.png', mimeType: 'image/png', buffer: logoPng(150, 60, 40) });
  await page.click('.panel:has(input[name="logo"]) button[type="submit"]');
  await page.waitForSelector('.logo-preview img');
  const closeAll = () => page.evaluate(() => globalThis.document.querySelectorAll('.plant-form details').forEach((d) => { d.open = false; }));
  await closeAll();
  // the label sits beside its control (round 52: the «?» next to it), both in the field; the optional fields are the
  // expert's: shown in «Esperto», the mode set back to «Semplice» after
  await modalita(page, 'esperto');
  const fillLabel = async (label, value) => {
    const f = page.locator(`.plant-form .field:has(label:has-text("${label}"))`).first();
    const sel = f.locator('select');
    if (await sel.count()) await sel.selectOption({ index: value });
    else await f.locator('input').fill(String(value));
  };
  for (const [label, value] of [['Manovra', 'Collettiva in discesa'], ['Vano', 'In muratura'], ['Rivestimento cabina', 'Acciaio inox satinato'], ['Paracadute', 1],
    ['Uso dell’ascensore', 1], ['Carico del limitatore sulla soletta P4', 600], ['Corrente nominale', 18], ['Corrente di avviamento', 54],
    ['Tensione forza motrice', 400], ['Tensione luce', 230], ['Frequenza', 50], ['Intermittenza', 40]]) await fillLabel(label, value);
  await page.click('.plant-form details summary');
  for (const [label, value] of [['Passo staffe cabina', 1500], ['Passo staffe contrappeso', 1500], ['Cabina (kg)', 380], ['Pavimento del cliente, massimo', 120],
    ['Operatore e ante', 140], ['Arcata', 340]]) await fillLabel(label, value);
  await shot('dati-impianto-facoltativi', page.locator('.plant-form details'), { pad: 12 });
  await page.click('.plant-form button[type="submit"]');
  await page.waitForSelector('.plant-form [role="status"]');
  await closeAll();
  await modalita(page, 'semplice');
  await shot('dati-impianto-pagina', page, { clip: { x: 0, y: 0, width: 1440, height: 1500 } });

  // the drawing set issued from the saved design, then a revision and the part of the page with the CAD files
  await goto(page, S.lift1);
  await page.fill('main form input[maxlength="12"]', 'A.E.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('main form:has(input[maxlength="12"]) button[type="submit"]')]);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  await shot('serie-tavole-foglio', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  await page.fill('main form input[maxlength="120"]', 'Aggiornata la quota delle ante');
  await page.fill('main form:has(input[maxlength="120"]) input[maxlength="12"]', 'A.E.');
  const setPath = new URL(page.url()).pathname;
  await Promise.all([page.waitForURL((u) => /\/drawing-sets\/[a-z0-9]+$/.test(u.pathname) && u.pathname !== setPath, { timeout: 60000 }), page.click('main form:has(input[maxlength="120"]) button[type="submit"]')]);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  const cad = page.locator('section:has(h2:has-text("File CAD")), .panel:has(h2:has-text("File CAD"))').first();
  await shot('serie-tavole-cad', page, { tall: 3000, clipFn: () => wideClip(page, [cad, page.locator('main form:has(input[maxlength="120"])').first()], 16, 290, 1150) });
  assert.deepEqual(errors, [], 'browser errors');
}

export async function rt() {
  step('relazione tecnica di modifica: registry, documents, the steps, the components, signatures and issue');
  const { page, errors } = await as('chief');
  const ws = `${S.p1}/relazione-tecnica`, projectId = S.p1.split('/').pop();
  await goto(page, ws);
  await hydrated(page, '#rt-anno');
  await page.fill('#rt-anno', '1978');
  await page.check('#rt-legge-ok');
  await page.fill('#rt-prop', 'Condominio Via dei Mille 12');
  await page.fill('#rt-man', COMPANY);
  await page.click('form.rt-anagrafica button[type="submit"]');
  await page.waitForSelector('form.rt-anagrafica .note:has-text("Anagrafica salvata.")');
  // three documents of the installation
  const post = (file, fields) => page.request.post(`${BASE}/api/projects/${projectId}/allegati`, { headers: { Origin: BASE }, multipart: { ...fields, file } });
  for (const [name, mimeType, buffer, fields] of [
    ['libretto-e-verbali.pdf', 'application/pdf', await demoPdf('Libretto e verbali', 2), { kind: 'LIBRETTO_VERBALE', title: 'Libretto e verbali' }],
    ['dichiarazione-ue.pdf', 'application/pdf', await demoPdf('Dichiarazione di conformità UE', 1), { kind: 'DICHIARAZIONE_UE', title: 'Dichiarazione di conformità UE', component: 'quadro' }],
    ['targa-argano.png', 'image/png', platePng(), { kind: 'FOTO', title: 'Targa dell’argano', component: 'argano' }],
  ]) assert.ok([200, 201].includes((await post({ name, mimeType, buffer }, fields)).status()), name);
  await goto(page, ws);
  await hydrated(page, '#rt2-generale select');
  // the bar of the steps with what each still needs, over «Dati generali» before it is filled
  await shot('rt2-passi', page, { tall: 2600, clipFn: () => wideClip(page, [page.locator('.rt-bar'), page.locator('#rt2-generale')], 16, 290, 1150) });
  const g = page.locator('#rt2-generale');
  await g.getByLabel('Ascensore di costruzione:', { exact: true }).fill('Elevatori Esempio');
  await g.getByLabel('Utenti autorizzati ed esperti:', { exact: true }).selectOption('no');
  await g.getByLabel('Ascensorista :', { exact: true }).fill(COMPANY);
  await g.getByLabel('Commessa :', { exact: true }).fill('26-015');
  await g.getByLabel('Componenti modificati o tipologia modifica:', { exact: true })
    .fill('Sostituzione dell’argano esistente con un argano a ingranaggi nuovo; quadro e funi come nel Calcolo argano.');
  await page.locator('#rt2-allegati ol.rt2-dich li:has-text("Targa dell’argano") input').check().catch(() => undefined);
  // every component field still to fill (the guide's example data)
  const need = page.locator('[data-rt="workspace2"] section.rt-card:not(#rt2-generale):not(#rt2-firme) .field.need');
  for (let i = 0; i < 40 && await need.count(); i++) {
    const f = need.first(), sel = f.locator('select'), num = f.locator('input[type="number"]');
    if (await sel.count()) await sel.selectOption((await sel.locator('option').nth(1).getAttribute('value')) ?? '');
    else if (await num.count()) await num.fill((await num.getAttribute('min')) ?? '1');
    else await f.locator('input, textarea').first().fill('Dato dell’esempio');
  }
  // the components with their reasons, and the first component's card with its checks
  const first = page.locator('[data-rt="workspace2"] section.rt-card[id^="rt2-"]:not(#rt2-generale):not(#rt2-tecnici):not(#rt2-componenti):not(#rt2-allegati):not(#rt2-firme)').first();
  await shot('rt2-componenti', page, { tall: 3200, clipFn: () => wideClip(page, [page.locator('#rt2-componenti'), first], 16, 290, 1150) });
  const docs = page.locator('section[data-allegati="panel"]');
  await docs.scrollIntoViewIfNeeded();
  await shot('allegati-pannello', docs, { pad: 12 });
  // a row in edit, another asking to be deleted
  await docs.locator('tbody tr').nth(0).locator('button:has-text("Modifica")').click();
  const del = docs.locator('tbody tr button:has-text("Elimina")');
  if (await del.count()) await del.last().click();
  await shot('allegati-modifica', docs, { pad: 12 });
  await docs.locator('button:has-text("Annulla")').first().click().catch(() => undefined);
  // the engineer who verifies it, then the issue with its confirmation
  const ver = page.locator('#rt2-firme .rt2-campi').nth(1);
  await ver.getByLabel('Titolo', { exact: true }).selectOption('Ing.');
  await ver.getByLabel('Nome e cognome', { exact: true }).fill('Laura Bianchi');
  await ver.getByLabel('Provincia dell’Ordine', { exact: true }).fill('Bergamo');
  await ver.getByLabel('Numero di iscrizione', { exact: true }).fill('A1234');
  await page.waitForFunction(() => /Bozza (salvata|ripresa)/.test(globalThis.document.querySelector('.rt-bar .draft-bar')?.textContent ?? ''), null, { timeout: 20000 });
  const emit = page.locator('#rt2-firme button.btn-primary:has-text("Emetti la relazione")');
  if (await emit.isDisabled()) throw new Error(`the issue is blocked: ${await page.locator('#rt2-firme .rt-mancanti').innerText()}`);
  const conferma = page.locator('#rt2-firme [role="alertdialog"]');
  await emit.click();
  const esito = await Promise.race([page.waitForURL(/\/app\/relazioni\/[a-z0-9]+$/, { timeout: 90000 }).then(() => 'emessa'), conferma.waitFor({ timeout: 90000 }).then(() => 'conferma')]);
  if (esito === 'conferma') {
    await shot('rt2-firme', page, { tall: 2600, clipFn: () => wideClip(page, [page.locator('#rt2-firme')], 16, 290, 1150) });
    await Promise.all([page.waitForURL(/\/app\/relazioni\/[a-z0-9]+$/, { timeout: 90000 }), conferma.locator('button:has-text("Emetti comunque")').click()]);
  } else skip('rt2-firme', 'every check met: no confirmation to show');
  await shot('rel-testata', page, { clip: { x: 0, y: 0, width: 1440, height: 760 } });
  await shot('rel-componenti-allegati', page, { tall: 3000, clipFn: () => wideClip(page, [page.locator('section[aria-labelledby="rt-p-componenti"]'), page.locator('section[aria-labelledby="rt-p-rev"]')], 16, 290, 1150) });
  assert.deepEqual(errors.filter((e) => !/404/.test(e)), [], 'browser errors');
}

export async function p1pages() {
  step('first installation: its page, the comparison with the survey, the edit forms');
  const { page } = await as('chief');
  // the survey changes after the design: more stops, a smaller load — differences, and a planned modification
  await goto(page, `${S.sheets[0]}/modifica`);
  await hydrated(page, `${FORM}[data-live] button[type="submit"]`);
  await page.fill('#f-fermate', '6');
  await page.fill('#f-portataKg', '480');
  await saveSheet(page);
  await goto(page, S.p1);
  await page.waitForSelector('#confronto tr.lk-row');
  await shot('impianto-testata', page, { clipFn: () => wideClip(page, [page.locator('.page-head').first(), page.locator('nav.lk-steps-wrap')], 18, 270, 1170) });
  await shot('stepper', page.locator('nav.lk-steps-wrap'), { pad: 8 });
  await shot('impianto-rilievi-confronto', page, { tall: 2600, clipFn: () => wideClip(page, [page.locator('#rilievi'), page.locator('#confronto')], 16, 290, 1150) });
  await goto(page, `${S.p1}/edit`);
  await hydrated(page, 'main form button[type="submit"]');
  await shot('modifica-impianto', page, { clip: { x: 0, y: 0, width: 1440, height: 1000 } });
  // the plant number typed differently from the survey's: the comparison offers the survey's value, into this form
  await page.fill('input[name="plantNumber"]', '0412999');
  await page.click('main form button[type="submit"]');
  await page.waitForURL((u) => !/\/edit$/.test(u.pathname));
  await goto(page, S.p1);
  const toEdit = page.locator('#confronto a.lk-usa[href*="/edit"]').first();
  if (await toEdit.count()) {
    await Promise.all([page.waitForURL(/\/edit/), toEdit.click()]);
    await hydrated(page, 'main form button[type="submit"]');
    await shot('modifica-usa-rilievo', page, { clip: { x: 0, y: 0, width: 1440, height: 1000 } });
  } else skip('modifica-usa-rilievo', 'no row of the comparison offers «Usa il valore del rilievo» towards the installation form');
}

export async function lista() {
  step('more installations (one with a calculation only, one without), the lists and the home');
  const { page } = await as('chief');
  const make = async (fields) => {
    await goto(page, '/it/app/projects/new');
    await hydrated(page, 'main form button[type="submit"]');
    for (const [k, v] of Object.entries(fields)) await page.fill(`input[name="${k}"]`, v);
    await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  };
  await make({ name: 'Via Borgo Palazzo 31', plantNumber: '0455190', address: 'Via Borgo Palazzo 31', city: 'Bergamo', client: 'Condominio Borgo Palazzo' });
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio A")');
  await page.waitForSelector('.verdict .big');
  await saveCalc(page);
  await make({ name: 'Condominio Il Glicine', address: 'Via Pignolo 4', city: 'Bergamo' });
  await goto(page, '/it/app');
  await page.waitForSelector('.lk-kpis .kpi-value');
  await shot('home-completa', page);
  const owner = await as('owner');
  await goto(owner.page, '/it/app/rilievi');
  await shot('shell-desktop', owner.page);
  await goto(owner.page, '/it/app/impianti');
  await owner.page.waitForSelector('.dash-row');
  await shot('impianti-elenco', owner.page, { clip: { x: 0, y: 0, width: 1440, height: 1100 } });

  // the company of the beta registration (nothing in it yet): first steps and the empty list
  const t = await fresh();
  await t.page.goto(`${BASE}/it/login`);
  await t.page.fill('input[name="email"]', TESTER.email);
  await t.page.fill('input[name="password"]', TESTER.password);
  await Promise.all([t.page.waitForURL(/\/it\/app(\/account\?first=1)?$/), t.page.click('main form button[type="submit"]')]);
  await goto(t.page, '/it/app');
  await t.page.waitForSelector('section[aria-labelledby="primi-passi"]');
  await shot('home-primi-passi', t.page);
  await goto(t.page, '/it/app/impianti');
  await t.page.waitForSelector('main .dash-nuovo');
  await shot('impianti-vuoto', t.page);
  await t.ctx.close();
}

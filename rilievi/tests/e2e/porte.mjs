// The doors, the argano that stays, the panel that stays and the notes in a real browser
// (public/js/app.js): one kind of doors at a time (radio); the locks and the retiring cam come with
// manual or semi-automatic doors, the operator (and on "Sì" its 2SG sheet, the doors ticked in it) with
// semi-automatic and automatic ones, the suspensions only with automatic ones — with both "Sì" one 2SG
// sheet, the suspensions' (what was written in one goes on in the other), the whole row wide; the kind of the argano that stays, the type of the cam, the kind of the shoe
// check, the check on a panel that stays and the lighting note come with their answer; the print carries
// the new names and what was written.
import { fail, tick } from './helpers.mjs';

export async function fillDoorsAndChecks(page) {
  // The locks and the retiring cam follow the doors: manual or semi-automatic doors ask them, automatic
  // ones ask the suspensions; the type of the cam comes with "Sì".
  if (await page.locator('#f-serrature').isVisible()) fail('locks shown before the doors');
  await tick(page, 'tipoPorte', 'SEMIAUTOMATICHE');
  if (!(await page.locator('#f-serrature').isVisible()))
    fail('locks not shown with semi-automatic doors');
  if (await page.locator('#f-sospensioni').isVisible())
    fail('suspensions shown with semi-automatic doors');
  // Semi-automatic: the car door is automatic, on an operator — its question, and on "Sì" the 2SG
  // sheet right after it, with the kind of doors already ticked (the linked data).
  if (!(await page.locator('#f-operatore').isVisible()))
    fail('operator not asked with semi-automatic doors');
  if (await page.locator('#f-so').isVisible()) fail('2SG sheet of the operator shown before "Sì"');
  await tick(page, 'operatore', 'si');
  if (!(await page.locator('#f-so').isVisible())) fail('no 2SG sheet of the operator on "Sì"');
  if (!(await page.isChecked('#f-so-semiautomatico')))
    fail('the 2SG sheet of the operator without the semi-automatic doors');
  // The whole row of the section, as every supplier form (its wrapper is a cell of the grid).
  const share = await page.$eval(
    '#f-so',
    (el) => el.getBoundingClientRect().width / el.closest('.grid').getBoundingClientRect().width,
  );
  if (share < 0.9)
    fail(`the 2SG sheet of the operator takes ${Math.round(share * 100)}% of the row`);
  await tick(page, 'tipoPorte', 'MANUALI');
  if (await page.locator('#f-operatore').isVisible()) fail('operator asked with manual doors');
  if (await page.locator('#f-so').isVisible()) fail('2SG sheet of the operator with manual doors');
  if ((await page.locator('input[name=tipoPorte]:checked').count()) !== 1)
    fail('more than one kind of doors ticked');
  await tick(page, 'doppioAccesso', 'si');
  await tick(page, 'serrature', 'si');
  await page.fill('#f-serratureNumero', '6');
  await page.fill('#f-serratureTipo', 'Elettromeccaniche');
  await tick(page, 'pattinoRetrattile', 'si');
  await page.fill('#f-pattinoRetrattileTipo', 'Wittur');
  // Automatic doors at last (the panel order and the 2SG sheet follow them): the locks and the cam go,
  // the suspensions come.
  await tick(page, 'tipoPorte', 'AUTOMATICHE');
  if (await page.locator('#f-pattinoRetrattile').isVisible())
    fail('retiring cam shown with automatic doors');
  if (!(await page.locator('#f-sospensioni').isVisible()))
    fail('suspensions not shown with automatic doors');
  // The operator with automatic doors too (24 October 2026): its 2SG sheet on "Sì" — and with the
  // suspensions also on "Sì" only theirs (one sheet in the column).
  if (!(await page.locator('#f-operatore').isVisible()))
    fail('operator not asked with automatic doors');
  await tick(page, 'operatore', 'si');
  if (!(await page.locator('#f-so').isVisible())) fail('no 2SG sheet of the operator on "Sì"');
  // One sheet, one order: what was written in the one on screen goes on in the other — both ways.
  await page.fill('#f-so-ordNo', '78');
  await tick(page, 'sospensioni', 'si');
  if (!(await page.locator('#f-sg').isVisible())) fail('no 2SG sheet of the suspensions on "Sì"');
  if (await page.locator('#f-so').isVisible()) fail('two 2SG sheets with both "Sì"');
  if ((await page.inputValue('#f-sg-ordNo')) !== '78')
    fail('what was written in the operator sheet lost with "Sospensioni: Sì"');
  await page.fill('#f-sg-ordNo', '79');
  await tick(page, 'sospensioni', 'no');
  if (!(await page.locator('#f-so').isVisible())) fail('the operator sheet did not come back');
  if ((await page.inputValue('#f-so-ordNo')) !== '79')
    fail('what was written in the suspensions sheet lost with "Sospensioni: No"');
  await tick(page, 'operatore', 'no');
  // The argano that stays: its kind, the shoe check kit with its kind on "Sì"; no brake contacts, no
  // brake shoes (24 October 2026); the stop of the argano always.
  await tick(page, 'arganoPreventivo', 'no');
  await page.fill('#f-arganoTipo', 'A vite senza fine');
  for (const gone of ['contattiFreno', 'ganasceFreno'])
    if (await page.locator(`#f-${gone}`).count()) fail(`${gone} still asked`);
  if (!(await page.locator('#f-stopArgano').isVisible())) fail('stop of the argano not asked');
  await tick(page, 'stopArgano', 'si');
  // The check on the panel: only when the panel stays.
  if (await page.locator('#f-controlloQuadro').isVisible())
    fail('check on the panel shown before the panel is answered');
  await tick(page, 'quadroSostituire', 'no');
  if (!(await page.locator('#f-controlloQuadro').isVisible()))
    fail('check on the panel not shown with a panel that stays');
  await tick(page, 'quadroSostituire', 'si');
  if (await page.locator('#f-controlloQuadro').isVisible())
    fail('check on the panel shown with a new panel');
  if (await page.locator('#f-kitControlloGanasceTipo').isVisible())
    fail('kind of the shoe check shown before "Sì"');
  await tick(page, 'kitControlloGanasce', 'si');
  await page.fill('#f-kitControlloGanasceTipo', 'Microinterruttori');
  await page.fill('#f-arganoNote', 'Rumore sul cuscinetto');
  await tick(page, 'luceVanoSostituire', 'si');
  await page.fill('#f-luceVanoNote', 'Plafoniere al 2° piano');
  // The push-button panels: their own section, the note with any answer (24 October 2026).
  await tick(page, 'bottoniereSostituire', 'no');
  if (!(await page.locator('#f-bottoniereNote').isVisible())) fail('no panels note with "No"');
  await tick(page, 'bottoniereSostituire', 'si');
  await page.fill('#f-bottoniereNote', 'Bottoniere di piano da rifare');
}

export async function checkPrintedNotes(page) {
  const paper = await page.textContent('.paper');
  for (const text of [
    'Buono di lavoro',
    'Funi e tiranti',
    'Tiranti M12',
    'Allarme e telesoccorso',
    'Rumore sul cuscinetto',
    'Plafoniere al 2° piano',
    'Serrature, sospensioni o operatore',
    'Bottoniere da sostituire',
    'Bottoniere di piano da rifare',
    'Stop argano da installare?',
  ]) {
    if (!paper.includes(text)) fail(`print without "${text}"`);
  }
  // Electric lift, automatic doors: no pit tie rods, no retiring cam; the brake contacts are not asked.
  for (const text of [
    'Contatti freno',
    'Ganasce freno',
    'tiranti in fossa',
    'Tipo di pattino retrattile',
  ]) {
    if (paper.includes(text)) fail(`print with "${text}"`);
  }
}

// The doors, the argano that stays and the notes in a real browser (public/js/app.js): one kind of
// doors at a time (radio); the locks and the retiring cam come with manual or semi-automatic doors, the
// suspensions only with automatic ones; the kind of the argano that stays, the type of the cam, the kind
// of the shoe check and the lighting note come with their answer; the print carries the new names and
// what was written.
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
  await tick(page, 'tipoPorte', 'MANUALI');
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
  // The argano that stays: its kind, the shoe check kit with its kind on "Sì"; no brake contacts.
  await tick(page, 'arganoPreventivo', 'no');
  await page.fill('#f-arganoTipo', 'A vite senza fine');
  if (await page.locator('#f-contattiFreno').count()) fail('brake contacts still asked');
  if (await page.locator('#f-kitControlloGanasceTipo').isVisible())
    fail('kind of the shoe check shown before "Sì"');
  await tick(page, 'kitControlloGanasce', 'si');
  await page.fill('#f-kitControlloGanasceTipo', 'Microinterruttori');
  await page.fill('#f-arganoNote', 'Rumore sul cuscinetto');
  await tick(page, 'luceVanoSostituire', 'si');
  await page.fill('#f-luceVanoNote', 'Plafoniere al 2° piano');
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
  ]) {
    if (!paper.includes(text)) fail(`print without "${text}"`);
  }
  // Electric lift, automatic doors: no pit tie rods, no retiring cam; the brake contacts are not asked.
  for (const text of ['Contatti freno', 'tiranti in fossa', 'Tipo di pattino retrattile']) {
    if (paper.includes(text)) fail(`print with "${text}"`);
  }
}

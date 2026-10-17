// The doors, the argano that stays and the notes in a real browser (public/js/app.js): the locks and
// the retiring cam come with manual (or semi-automatic) doors, the suspensions with automatic ones; the
// type of the cam, the kind of the shoe check and the lighting note come with their "Sì"; the print
// carries the new names and what was written.
import { fail, tick } from './helpers.mjs';

export async function fillDoorsAndChecks(page) {
  // The locks and the retiring cam follow the doors: manual (or semi-automatic) doors ask them,
  // automatic ones ask the suspensions; the type of the cam comes with "Sì".
  if (await page.locator('#f-serrature').isVisible()) fail('locks shown before the doors');
  await tick(page, 'tipoPorte', 'AUTOMATICHE');
  if (await page.locator('#f-pattinoRetrattile').isVisible())
    fail('retiring cam shown with automatic doors');
  if (!(await page.locator('#f-sospensioni').isVisible()))
    fail('suspensions not shown with automatic doors');
  await tick(page, 'tipoPorte', 'MANUALI');
  await tick(page, 'doppioAccesso', 'si');
  await tick(page, 'serrature', 'si');
  await page.fill('#f-serratureNumero', '6');
  await page.fill('#f-serratureTipo', 'Elettromeccaniche');
  await tick(page, 'pattinoRetrattile', 'si');
  await page.fill('#f-pattinoRetrattileTipo', 'Wittur');
  // The argano that stays: the shoe check kit, its kind with "Sì".
  await tick(page, 'arganoPreventivo', 'no');
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
    'Wittur',
    'Rumore sul cuscinetto',
    'Plafoniere al 2° piano',
  ]) {
    if (!paper.includes(text)) fail(`print without "${text}"`);
  }
}

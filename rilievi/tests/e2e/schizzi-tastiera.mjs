// The sketch editor beyond the mouse (public/js/schizzo-menu.js, schizzo-comandi.js, schizzo-barre.css):
// reopened on a sheet it starts clean (no selection of before, the focus on the tool, never on
// "Scarta"); the menus work from the keyboard and Esc closes the menu, not the editor; on a tablet the
// panels stay on the screen, and on a phone on its side the "Stile" panel and the value bar too.
import { fail } from './helpers.mjs';

export async function checkReopened(page, dialog) {
  const state = await page.evaluate(() => ({
    selected: window.rilieviSchizzoEditor.selection.get().length,
    focus: document.activeElement?.outerHTML.slice(0, 80) ?? '',
  }));
  if (state.selected) fail('sketch editor: reopened with the selection of before');
  if (/data-schizzo-scarta/.test(state.focus))
    fail('sketch editor: reopened with the focus on Scarta');
  if (await dialog.locator('[data-schizzo-contesto="selezione"]').isVisible())
    fail('sketch editor: reopened with the selection bar');
}

/** The circle of the sheet, selected with the select tool. */
export async function selectCircle(page, dialog) {
  await dialog.locator('label[for="schizzo-strumento-seleziona"]').click();
  const circle = await page.evaluate(() =>
    window.rilieviSchizzoEditor.elements.find((el) => el.t === 'e'),
  );
  const box = await dialog.locator('canvas').boundingBox();
  await page.mouse.click(
    box.x + (box.width * (circle.x + circle.rx)) / 1400,
    box.y + (box.height * circle.y) / 1000,
  );
  if ((await page.evaluate(() => window.rilieviSchizzoEditor.selection.get().length)) !== 1)
    fail('sketch editor: the circle was not selected');
}

export async function checkKeyboard(page, dialog, reopen) {
  const active = () =>
    page.evaluate(() => ({
      inPanel: Boolean(document.activeElement?.closest('.menu__pannello')),
      summary: document.activeElement?.tagName === 'SUMMARY',
      tool: document.querySelector('input[name="schizzo-strumento"]:checked').value,
    }));
  const forme = dialog.locator('details[data-schizzo-menu="forme"]');
  await forme.locator('summary').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  if (!(await forme.evaluate((d) => d.open)) || !(await active()).inPanel)
    fail('sketch menus: Enter does not open "Forme" with the focus inside');
  const before = (await active()).tool;
  await page.keyboard.press('ArrowDown');
  const moved = await active();
  if (!(await forme.evaluate((d) => d.open)) || !moved.inPanel || moved.tool === before)
    fail(`sketch menus: an arrow in "Forme" closed it or chose nothing (${JSON.stringify(moved)})`);
  await page.keyboard.press('Enter');
  if ((await forme.evaluate((d) => d.open)) || !(await active()).summary)
    fail('sketch menus: Enter on a shape does not close "Forme" back to its face');

  const stile = dialog.locator('details[data-schizzo-menu="stile"]');
  await stile.locator('summary').click();
  await page.keyboard.press('Escape');
  if (!(await dialog.isVisible())) {
    fail('sketch menus: Esc on an open menu closed the editor');
    await reopen();
  } else if (await stile.evaluate((d) => d.open)) fail('sketch menus: Esc did not close "Stile"');
}

/** Each control's box inside the window. */
async function onScreen(page, locator, what) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  if (
    !box ||
    box.x < 0 ||
    box.y < 0 ||
    box.x + box.width > width + 1 ||
    box.y + box.height > height + 1
  )
    fail(`${what}: off the screen ${JSON.stringify(box)} in ${width}×${height}`);
}

export async function checkLayouts(page, editUrl) {
  const browser = page.context().browser();
  const storageState = await page.context().storageState();
  for (const [name, viewport] of [
    ['tablet', { width: 768, height: 1024 }],
    ['tablet landscape', { width: 1024, height: 768 }],
    ['phone landscape', { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({ storageState, viewport, hasTouch: true });
    const tab = await context.newPage();
    tab.on('dialog', (d) => d.accept());
    await tab.goto(editUrl);
    await tab.locator('[data-schizzi-nuovo]').click();
    const dialog = tab.locator('[data-schizzo-editor]');
    await dialog.waitFor({ state: 'visible' });
    for (const menu of ['forme', 'simboli', 'stile']) {
      const details = dialog.locator(`details[data-schizzo-menu="${menu}"]`);
      await details.locator('summary').click();
      await onScreen(tab, details.locator('.menu__pannello'), `sketch ${name}: menu ${menu}`);
      await details.locator('summary').click();
    }
    if (name === 'phone landscape') {
      // A dimension up to its number: the value bar and OK on the screen.
      await dialog.locator('label[for="schizzo-strumento-quota"]').click();
      const box = await dialog.locator('canvas').boundingBox();
      const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
      await tab.mouse.move(...at(0.2, 0.5));
      await tab.mouse.down();
      await tab.mouse.move(...at(0.5, 0.5), { steps: 8 });
      await tab.mouse.up();
      await tab.mouse.click(...at(0.35, 0.7));
      await onScreen(tab, dialog.locator('#schizzo-valore'), `sketch ${name}: value`);
      await onScreen(tab, dialog.locator('[data-schizzo-valore-ok]'), `sketch ${name}: OK`);
    }
    await context.close();
  }
}

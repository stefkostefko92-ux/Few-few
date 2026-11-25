// The editor's keyboard paths, checked once per e2e run (run.mjs): they do not change with the language or the theme.

// The editor's keyboard paths (WCAG 2.1.1, 2.1.2, 2.4.3): Enter in the picker's search keeps the dialog; full screen
// (the overlay a phone gets) keeps Tab in it, Escape leaves it and the focus is back on its button; Escape closes
// the download menu.
export async function editorKeys(page) {
  const found = [];
  // a query that finds something in any catalog (the base one or the shop catalog): the start of the first result
  const name = await page.evaluate(
    () => document.querySelector('#pk-list [role="option"] b')?.textContent?.trim() ?? '',
  );
  await page.fill('#pk-q', name.slice(0, 3));
  await page.keyboard.press('Enter');
  const picked = await page.evaluate(() => ({
    open: document.getElementById('picker').open,
    inList: !!document.activeElement?.closest('#pk-list'),
  }));
  if (!picked.open) found.push('keys: Enter in the picker search closed the dialog');
  else if (!picked.inList) found.push('keys: Enter in the picker search did not go to the results');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.getElementById('picker').open)) {
    found.push('keys: Escape in the picker results did not close the dialog');
    await page.click('#picker [data-close]');
  }
  await page.click('#tab-draw');
  await page.evaluate(() => {
    Element.prototype.requestFullscreen = undefined;
    Element.prototype.webkitRequestFullscreen = undefined;
  });
  await page.focus('#draw-fs .fs-btn');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(
      () =>
        document.activeElement === document.body || !!document.activeElement?.closest('.is-full'),
    );
    if (!inside) {
      found.push('keys: Tab left the full screen for the page under it');
      break;
    }
  }
  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => ({
    full: !!document.querySelector('.is-full'),
    inert: document.querySelectorAll('[inert]').length,
    back: !!document.activeElement?.matches('#draw-fs .fs-btn'),
  }));
  if (after.full || after.inert || !after.back)
    found.push(`keys: Escape did not leave the full screen cleanly ${JSON.stringify(after)}`);
  await page.click('.menu > summary');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.querySelector('.menu').open))
    found.push('keys: Escape did not close the download menu');
  return found;
}

// The constructor with the keyboard only (WCAG 2.1.1, 2.4.3): the selected cell is the tab stop and the arrows move
// the selection, a toolbar button takes Enter, a fill takes Space, a boundary by the selection moves 10 mm with
// Shift and an arrow, and Ctrl+Z on the view goes back through those steps.
export async function constructorKeys(page) {
  const found = [];
  const view = '#bld-front';
  const settle = () => page.waitForTimeout(500); // the recompute after an edit
  const columns = () =>
    page.evaluate(
      (v) => new Set([...document.querySelectorAll(`${v} .c-cell`)].map((c) => c.dataset.col)).size,
      view,
    );
  const pressed = () =>
    page.evaluate((v) => {
      const c = document.querySelector(`${v} .c-cell[aria-pressed="true"]`);
      return c ? `${c.dataset.col}.${c.dataset.cell}` : null;
    }, view);
  await page.focus(`${view} .c-cell[tabindex="0"]`);
  await page.keyboard.press('ArrowRight');
  if ((await pressed()) !== '1.0')
    found.push(`constructor: ArrowRight selected ${await pressed()}`);
  const before = await columns();
  await page.focus('#bld-add-right');
  await page.keyboard.press('Enter');
  await settle();
  if ((await columns()) !== before + 1)
    found.push('constructor: Enter on a column button added none');
  await page.focus('input[name="bld-fill"][value="drawers"]');
  await page.keyboard.press('Space');
  await settle();
  const label = await page.getAttribute(`${view} .c-cell[aria-pressed="true"]`, 'aria-label');
  if (!/Чекмеджета/.test(label ?? '')) found.push(`constructor: Space on a fill left „${label}“`);
  const handle = `${view} .c-handle.is-x[tabindex="0"]`;
  const col = await page.getAttribute(handle, 'data-col');
  const w0 = Number(await page.getAttribute(handle, 'aria-valuenow'));
  await page.focus(handle);
  await page.keyboard.press('Shift+ArrowRight');
  await settle();
  const moved = `${view} .c-handle.is-x[data-col="${col}"]`;
  const w1 = Number(await page.getAttribute(moved, 'aria-valuenow'));
  if (w1 !== w0 + 10) found.push(`constructor: Shift+ArrowRight moved the boundary ${w1 - w0} mm`);
  if (!(await page.evaluate((m) => document.activeElement?.matches(m), moved)))
    found.push('constructor: the moved boundary lost the focus');
  await page.focus(`${view} .c-cell[tabindex="0"]`);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+z');
    await settle();
  }
  if ((await columns()) !== before) found.push('constructor: Ctrl+Z did not go back to the start');
  return found;
}

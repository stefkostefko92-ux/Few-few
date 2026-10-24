// Two clicks instead of a drag, with the mouse (the owner on a computer, 24 October 2026: "non vedo le
// linee" — a click did nothing): the first click sets the start and the shape follows the mouse before the
// second click ends it — line, rectangle, circle, arrow, callout and dimension; Esc drops a start waiting
// for its second click, Annulla too (enabled for it). A drag still draws as before. What it draws is
// undone at the end: the rest of the flow sees the sheet as it was.
import sharp from 'sharp';
import { fail } from './helpers.mjs';

export async function checkTwoClicks(page, dialog) {
  const canvas = dialog.locator('canvas');
  const box = await canvas.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const elements = () => page.evaluate(() => window.rilieviSchizzoEditor.elements);
  const hint = () => dialog.locator('[data-schizzo-suggerimento]').textContent();
  const undoButton = dialog.locator('[data-schizzo-annulla]');
  const tool = async (value) => {
    const menu = dialog.locator(`details:has(input[name="schizzo-strumento"][value="${value}"])`);
    if (await menu.count()) await menu.locator('summary').click();
    await dialog.locator(`label[for="schizzo-strumento-${value}"]`).click();
  };
  const click = (fx, fy) => page.mouse.click(...at(fx, fy));
  // The darkest pixel in a short upright band through a point of the sheet (the points snap to the grid,
  // a few pixels away): the shape drawn while the mouse waits shows there.
  const darkest = async (fx, fy) => {
    const [x, y] = at(fx, fy);
    const png = await page.screenshot({ clip: { x: x - 2, y: y - 12, width: 5, height: 25 } });
    const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    return Math.min(...data);
  };
  const type = async (text) => {
    const input = dialog.locator('#schizzo-valore');
    await input.waitFor({ state: 'visible' });
    await input.fill(text);
    await input.press('Enter');
  };
  const start = (await elements()).length;

  // The line: a click, the mouse away — the line follows it (dark between the two points); a click.
  await tool('linea');
  const plain = await hint();
  await click(0.45, 0.91);
  if ((await elements()).length !== start) fail('two clicks: the first click drew something');
  if ((await hint()) === plain) fail('two clicks: no hint for the second point');
  if (await undoButton.isDisabled()) fail('two clicks: Annulla disabled while a start waits');
  await page.mouse.move(...at(0.6, 0.91), { steps: 6 });
  await page.mouse.move(...at(0.75, 0.91), { steps: 6 });
  if ((await darkest(0.6, 0.91)) > 120) fail('two clicks: the line does not follow the mouse');
  await click(0.75, 0.91);
  const line = (await elements()).at(-1);
  if ((await elements()).length !== start + 1 || line.t !== 'p' || !/^M\d+ \d+l\d+ 0$/.test(line.d))
    fail(`two clicks: no horizontal line (${JSON.stringify(line)})`);
  if ((await hint()) !== plain) fail('two clicks: the hint of the second point stayed');

  // Esc drops the start: the next click is a new start, not the end of a line.
  await click(0.45, 0.97);
  await page.keyboard.press('Escape');
  if (!(await dialog.isVisible())) return fail('two clicks: Esc closed the editor');
  if ((await hint()) !== plain) fail('two clicks: Esc did not drop the start');
  await click(0.75, 0.97);
  if ((await elements()).length !== start + 1) fail('two clicks: a line after Esc');
  await undoButton.click();
  if ((await elements()).length !== start + 1)
    fail('two clicks: Annulla undid a line, not the start');

  // The other shapes: rectangle, circle, arrow; the callout and the dimension end in the value bar.
  const shapes = [
    ['rettangolo', [0.76, 0.06], [0.95, 0.2], 'p'],
    ['cerchio', [0.86, 0.45], [0.92, 0.45], 'e'],
    ['freccia', [0.78, 0.6], [0.95, 0.52], 'a'],
  ];
  for (const [name, a, b, kind] of shapes) {
    await tool(name);
    await click(...a);
    await page.mouse.move(...at(...b), { steps: 6 });
    await click(...b);
    if ((await elements()).at(-1).t !== kind) fail(`two clicks: no ${name}`);
  }
  await tool('richiamo');
  await click(0.5, 0.75);
  await click(0.62, 0.7);
  await type('Fune');
  const callout = (await elements()).at(-1);
  if (callout.t !== 'a' || callout.v !== 'Fune') fail('two clicks: no callout');
  await tool('quota');
  await click(0.4, 0.84);
  await click(0.65, 0.84);
  await page.mouse.move(...at(0.52, 0.8), { steps: 4 });
  await click(0.52, 0.8);
  await type('350');
  const dimension = (await elements()).at(-1);
  if (dimension.t !== 'q' || dimension.v !== '350') fail('two clicks: no dimension');

  // A drag still draws in one go.
  await tool('linea');
  await page.mouse.move(...at(0.45, 0.97));
  await page.mouse.down();
  await page.mouse.move(...at(0.7, 0.97), { steps: 8 });
  await page.mouse.up();
  if ((await elements()).length !== start + 7) fail('two clicks: a drag no longer draws');

  for (let n = (await elements()).length; n > start; n -= 1) await undoButton.click();
  if ((await elements()).length !== start) fail('two clicks: Annulla did not take back the shapes');
}

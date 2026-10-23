// The tools of the sketch editor in a real browser, with the mouse (public/js/schizzo-*.js): every kind of
// element drawn once and checked in the editor's sheet — pen, line, dashed line, rectangle, dimension
// (pulled out below, its number typed), circle and its diameter, callout, symbol (turned and mirrored),
// polygon, text; then selecting, moving, duplicating and deleting, the eraser with undo and redo, zooming.
import { fail } from './helpers.mjs';

export async function drawEverything(page, dialog) {
  const canvas = dialog.locator('canvas');
  const box = await canvas.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const elements = () => page.evaluate(() => window.rilieviSchizzoEditor.elements);
  const drag = async (from, to, steps = 8, bend = 0) => {
    await page.mouse.move(...at(...from));
    await page.mouse.down();
    for (let i = 1; i <= steps; i += 1) {
      const f = i / steps;
      const y = from[1] + (to[1] - from[1]) * f + Math.sin(f * Math.PI) * bend;
      await page.mouse.move(...at(from[0] + (to[0] - from[0]) * f, y));
    }
    await page.mouse.up();
  };
  const tap = (fx, fy) => page.mouse.click(...at(fx, fy));
  const tool = async (value) => {
    const menu = dialog.locator(`details:has(input[name="schizzo-strumento"][value="${value}"])`);
    if (await menu.count()) await menu.locator('summary').click();
    await dialog.locator(`label[for="schizzo-strumento-${value}"]`).click();
  };
  const style = async (name, value) => {
    await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
    await dialog.locator(`label[for="schizzo-${name}-${value}"]`).click();
    await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  };
  const type = async (text) => {
    const input = dialog.locator('#schizzo-valore');
    await input.waitFor({ state: 'visible' });
    await input.fill(text);
    await input.press('Enter');
  };
  const last = async () => (await elements()).at(-1);

  await style('colore', 'r');
  await tool('penna');
  await drag([0.05, 0.9], [0.3, 0.95], 16, 0.03);
  await style('colore', 'b');
  await tool('linea');
  await drag([0.05, 0.05], [0.3, 0.05]);
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  await dialog.locator('label[for="schizzo-tratteggio"]').click();
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  await drag([0.05, 0.12], [0.3, 0.12]);
  if ((await last()).k !== 1) fail('sketch tools: the dashed line is not dashed');
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();
  await dialog.locator('label[for="schizzo-tratteggio"]').click();
  await dialog.locator('label[for="schizzo-colore-k"]').click();
  await dialog.locator('details[data-schizzo-menu="stile"] summary').click();

  // The shaft and its width: the dimension snaps to the corners and is pulled out below.
  await tool('rettangolo');
  await drag([0.4, 0.2], [0.7, 0.6]);
  await tool('quota');
  await drag([0.4, 0.6], [0.7, 0.6]);
  await drag([0.55, 0.6], [0.55, 0.7]);
  await type('1600');
  const quota = await last();
  if (quota.t !== 'q' || quota.v !== '1600' || quota.o <= 0)
    fail(`sketch tools: dimension ${JSON.stringify(quota)}`);

  // A circle and its diameter, from the selection.
  await tool('cerchio');
  await drag([0.55, 0.4], [0.6, 0.4]);
  // On its line, where the snapping put it.
  const circle = await last();
  await tool('seleziona');
  await tap((circle.x + circle.rx) / 1400, circle.y / 1000);
  await dialog.locator('[data-schizzo-azione="diametro"]').click();
  await type('Ø 600');
  if ((await last()).v !== 'Ø 600') fail('sketch tools: no diameter of the circle');

  await tool('richiamo');
  await drag([0.55, 0.4], [0.85, 0.3]);
  await type('Pistone');
  if ((await last()).v !== 'Pistone') fail('sketch tools: no callout');

  // A symbol where tapped, at once selected: turned and mirrored.
  await dialog.locator('details[data-schizzo-menu="simboli"] summary').click();
  await dialog.locator('label[for="schizzo-simbolo-cabina"]').click();
  await tap(0.2, 0.45);
  await dialog.locator('[data-schizzo-azione="ruota"]').click();
  await dialog.locator('[data-schizzo-azione="specchia"]').click();
  const cabina = await last();
  if (cabina.t !== 's' || cabina.n !== 'cabina' || cabina.r !== 1 || cabina.f !== 1)
    fail(`sketch tools: symbol ${JSON.stringify(cabina)}`);

  // Selected: moved by a drag, duplicated, the copy deleted.
  const count = (await elements()).length;
  await drag([0.2, 0.45], [0.25, 0.5]);
  const moved = await last();
  if (moved.x === cabina.x && moved.y === cabina.y) fail('sketch tools: the symbol did not move');
  await dialog.locator('[data-schizzo-azione="duplica"]').click();
  if ((await elements()).length !== count + 1) fail('sketch tools: no duplicate');
  await dialog.locator('[data-schizzo-azione="elimina"]').click();
  if ((await elements()).length !== count) fail('sketch tools: the duplicate was not deleted');

  // A polygon: three points and the first again.
  await tool('polilinea');
  for (const [x, y] of [
    [0.75, 0.7],
    [0.9, 0.7],
    [0.9, 0.9],
    [0.75, 0.7],
  ]) {
    await tap(x, y);
    await page.waitForTimeout(400);
  }
  if (!(await last()).d?.endsWith('z')) fail('sketch tools: the polygon is not closed');

  await tool('testo');
  await tap(0.05, 0.3);
  await type('Vano 1600 × 1400');

  // The eraser on the pen stroke, undo and redo.
  const before = (await elements()).length;
  await tool('gomma');
  await drag([0.15, 0.86], [0.15, 0.99], 6);
  if ((await elements()).length !== before - 1) fail('sketch tools: the eraser took nothing');
  await dialog.locator('[data-schizzo-annulla]').click();
  if ((await elements()).length !== before) fail('sketch tools: undo did not bring it back');
  await dialog.locator('[data-schizzo-ripeti]').click();

  // Zoom with the buttons and back.
  await dialog.locator('[data-schizzo-zoom="piu"]').click();
  if (!((await page.evaluate(() => window.rilieviSchizzoEditor.vista.zoom)) > 1))
    fail('sketch tools: no zoom');
  await dialog.locator('[data-schizzo-zoom="adatta"]').click();

  const kinds = (await elements()).map((el) =>
    el.t === 'p' ? (el.d.endsWith('z') ? 'z' : 'p') : el.t,
  );
  for (const kind of ['p', 'z', 'q', 'e', 'a', 's', 'x']) {
    if (!kinds.includes(kind)) fail(`sketch tools: no element of kind ${kind} (${kinds.join()})`);
  }
}

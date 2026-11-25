// The iPad (the owner, 17 November 2026: "da iPad non disegna niente"): Safari gives a finger a contact
// twice UITouch.majorRadius wide (WebKit, PointerEventIOS.cpp) — about 42 CSS pixels for a light fingertip —
// and the editor took every contact wider than 40 for a palm, so a finger drew nothing, in the sketches and
// in "Annota" alike. Here the touches carry the radius of an iPad fingertip and the Apple Pencil comes as a
// pen: a finger draws, two fingers zoom (checkTapPinchTap), the Pencil draws, after it a finger moves the
// view; "Annota" on a photo takes a finger too and keeps what it drew.
import { readFileSync } from 'node:fs';
import { fail, IPAD_FINGER_RADIUS } from './helpers.mjs';

const allegati = JSON.parse(
  readFileSync(new URL('../../locales/it/allegati.json', import.meta.url), 'utf8'),
);
const PHOTO_NOT_LOADED = allegati.allegati.annotazioni.foto;

const fingerAt = (box, fx, fy, id = 1) => ({
  x: box.x + box.width * fx,
  y: box.y + box.height * fy,
  id,
  radiusX: IPAD_FINGER_RADIUS,
  radiusY: IPAD_FINGER_RADIUS,
  force: 1,
});

/** One finger put down, dragged across in small steps and let go. */
async function fingerStroke(cdp, box, [fx0, fy0], [fx1, fy1]) {
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [fingerAt(box, fx0, fy0)]);
  for (let i = 1; i <= 8; i += 1)
    await touch('touchMove', [
      fingerAt(box, fx0 + ((fx1 - fx0) * i) / 8, fy0 + ((fy1 - fy0) * i) / 8),
    ]);
  await touch('touchEnd', []);
}

/** The Apple Pencil: a pen pointer, down, across and up. */
async function pencilStroke(cdp, box, [fx0, fy0], [fx1, fy1]) {
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const mouse = (type, point, extra = {}) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      ...point,
      pointerType: 'pen',
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      force: 0.5,
      ...extra,
    });
  await mouse('mousePressed', at(fx0, fy0));
  for (let i = 1; i <= 8; i += 1)
    await mouse('mouseMoved', at(fx0 + ((fx1 - fx0) * i) / 8, fy0 + ((fy1 - fy0) * i) / 8));
  await mouse('mouseReleased', at(fx1, fy1));
}

/** In the sketch editor, open on a tablet with touch: finger, Pencil, then a finger after the Pencil. */
export async function checkIpad(tab, dialog, name) {
  await dialog.locator('label[for="schizzo-strumento-penna"]').click();
  const cdp = await tab.context().newCDPSession(tab);
  const box = await dialog.locator('canvas').boundingBox();
  const elements = () => tab.evaluate(() => window.rilieviSchizzoEditor.elements);
  const before = (await elements()).length;

  await fingerStroke(cdp, box, [0.2, 0.2], [0.4, 0.3]);
  let now = await elements();
  if (now.length !== before + 1 || now.at(-1).t !== 'p')
    fail(`sketch ${name}: an iPad finger does not draw with the pen`);

  await pencilStroke(cdp, box, [0.2, 0.6], [0.45, 0.7]);
  now = await elements();
  if (now.length !== before + 2 || now.at(-1).t !== 'p')
    fail(`sketch ${name}: the Apple Pencil does not draw with the pen`);

  // After the Pencil a finger is the hand: it moves the view — once the Pencil is lifted for longer than
  // PEN_GRACE_MS (500, schizzo-puntatori.js), before that it is taken for the hand resting by the Pencil.
  await tab.waitForTimeout(600);
  await fingerStroke(cdp, box, [0.6, 0.4], [0.7, 0.45]);
  if ((await elements()).length !== before + 2)
    fail(`sketch ${name}: a finger after the Apple Pencil drew instead of moving the view`);
  await cdp.detach();
}

/** "Annota" on the first ready photo of the form, a line drawn with an iPad finger, "Fatto". */
export async function checkIpadAnnotation(tab, name) {
  const tile = tab.locator('[data-galleria] [data-foto]').first();
  if (!(await tile.count())) return fail(`annotations ${name}: no ready photo on the form`);
  const drawn = () => tile.locator('.galleria__media .annotazioni path').count();
  const before = await drawn();

  // The photo does not arrive (a weak signal on the site): the tile says so and the button works again.
  const path = await tile.getAttribute('data-foto');
  const photo = (url) => url.pathname === path && !url.search;
  await tab.route(photo, (route) => route.abort());
  await tile.locator('[data-annota]').click();
  await tile
    .locator('[data-annota-stato]', { hasText: PHOTO_NOT_LOADED })
    .waitFor({ timeout: 5000 })
    .catch(() => fail(`annotations ${name}: a photo that does not load says nothing`));
  if (await tile.locator('[data-annota]').isDisabled())
    fail(`annotations ${name}: the button stays off after the photo did not load`);
  await tab.unroute(photo);

  await tile.locator('[data-annota]').click();
  const dialog = tab.locator('[data-schizzo-editor]');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('label[for="schizzo-strumento-penna"]').click();
  const cdp = await tab.context().newCDPSession(tab);
  const box = await dialog.locator('canvas').boundingBox();
  const count = () => tab.evaluate(() => window.rilieviSchizzoEditor.elements.length);
  const start = await count();
  await fingerStroke(cdp, box, [0.3, 0.3], [0.6, 0.5]);
  await cdp.detach();
  if ((await count()) !== start + 1) fail(`annotations ${name}: an iPad finger does not draw`);
  await dialog.locator('[data-schizzo-fatto]').click();
  await dialog.waitFor({ state: 'hidden' });
  await tab
    .waitForFunction(
      ([el, n]) => el.querySelectorAll('.galleria__media .annotazioni path').length > n,
      [await tile.elementHandle(), before],
      { timeout: 5000 },
    )
    .catch(() => fail(`annotations ${name}: the tile does not show what the finger drew`));
}

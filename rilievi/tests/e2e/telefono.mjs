// The portal on a phone (390 px, touch): the side bar from ☰ (interventi.mjs) and the pages a technician
// opens on site — no horizontal scroll, every control keeps its name (axe), a full-page screenshot each.
import { join } from 'node:path';
import { audit, fail, signIn } from './helpers.mjs';
import { checkPhoneMenu } from './interventi.mjs';

export async function checkPhone(browser, { base, shots, scheme, email, password, sheetUrl }) {
  const phone = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await signIn(mobile, base, email, password);
  await checkPhoneMenu(mobile, { base, scheme });
  for (const [name, path] of [
    ['list', '/schede?q=verdi'],
    ['sheet', new URL(sheetUrl).pathname],
    ['interventi', '/interventi'],
    ['intervento', '/interventi/nuovo'],
    ['cartelli', '/cartelli'],
    ['cartello', '/cartelli/nuovo'],
  ]) {
    await mobile.goto(base + path);
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (overflow) fail(`${scheme} mobile ${name}: horizontal scroll`);
    // The phone layout hides labels behind icons: check that every control keeps its name.
    await audit(mobile, `${scheme} mobile ${name}`);
    await mobile.screenshot({
      path: join(shots, `${scheme}-mobile-${name}.png`),
      fullPage: true,
    });
  }
  await phone.close();
}

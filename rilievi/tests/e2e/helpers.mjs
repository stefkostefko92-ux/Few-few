// Shared pieces of the end-to-end check: failures, the axe-core audit and signing in.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

export const failures = [];
export const fail = (message) => {
  failures.push(message);
  console.error(`✘ ${message}`);
};

export async function audit(page, name) {
  // page.evaluate is not subject to the page CSP, so axe runs without weakening it.
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    }),
  );
  for (const violation of result.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      fail(`${name}: ${violation.id} (${violation.impact}) × ${violation.nodes.length}`);
    }
  }
}

// The public pages speak Italian only: no Cyrillic anywhere in what the server sent, comments included.
export async function italianOnly(page, name) {
  const html = await page.content();
  if (/[\u0400-\u04FF]/.test(html)) fail(`${name}: Cyrillic text in the page`);
}

export async function signIn(page, base, who, secret) {
  await page.goto(`${base}/accesso`);
  await page.fill('#email', who);
  await page.fill('#password', secret);
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/(schede|account)/);
}

// The real input sits under its label (visually a tick box); a DOM click is what a tap on the label does,
// and it is not intercepted by the sticky save bar when the field scrolls under it.
export const tick = (page, name, value) =>
  page.locator(`input[name=${name}][value=${value}]`).evaluate((input) => {
    if (!input.checked) input.click();
  });

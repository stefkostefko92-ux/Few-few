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

// Fields on one row of a form grid start on one line (the owner, 31 October 2026: "Искам да сме
// подредени … визуално перфектни на всякакъв вид устройство"): per row, the tops of the controls and the
// bottoms of the labels match within a pixel. Rows are found by overlapping field boxes; a field that is
// a whole row (a tick box) is not compared. The off-screen grids are laid out first (content-visibility).
export async function aligned(page, name) {
  const issues = await page.evaluate(() => {
    const out = [];
    const shown = (el) => el.getClientRects().length > 0;
    const control = (el) =>
      el.querySelector(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea',
      );
    for (const grid of document.querySelectorAll('.grid')) {
      for (let el = grid; el; el = el.parentElement) el.style.contentVisibility = 'visible';
      if (!shown(grid)) continue;
      const boxes = [...grid.children]
        .filter((el) => shown(el) && !el.classList.contains('field--wide') && control(el))
        .map((el) => ({
          r: el.getBoundingClientRect(),
          c: control(el).getBoundingClientRect(),
          l: el.querySelector(':scope > .field__label')?.getBoundingClientRect() ?? null,
          name: control(el).name || control(el).id,
        }))
        .sort((a, b) => a.r.top - b.r.top);
      const rows = [];
      for (const b of boxes) {
        const row = rows.find((rw) => b.r.top < rw.bottom - 2 && b.r.bottom > rw.top + 2);
        if (row) {
          row.items.push(b);
          row.top = Math.min(row.top, b.r.top);
          row.bottom = Math.max(row.bottom, b.r.bottom);
        } else rows.push({ top: b.r.top, bottom: b.r.bottom, items: [b] });
      }
      for (const { items } of rows) {
        if (items.length < 2) continue;
        const spread = (values) => Math.max(...values) - Math.min(...values);
        const controls = spread(items.map((b) => Math.round(b.c.top)));
        const labels = items.filter((b) => b.l).map((b) => Math.round(b.l.bottom));
        if (controls > 1 || (labels.length > 1 && spread(labels) > 1))
          out.push(`${items.map((b) => b.name).join(', ')}: ${controls}px`);
      }
    }
    return out;
  });
  for (const issue of issues) fail(`${name}: fields not aligned — ${issue}`);
  await selectsFit(page, name);
}

// No drop-down cuts its options: the longest option text fits between the left padding and the arrow
// (measured in Chromium: the arrow takes about 28 px). A cut option reads "TELCAL 10 mm, 8 tref…".
// A drop-down that already takes the whole line of its grid or form (the company filter on a phone, a
// field alone on its row) cannot be wider: a long company name there is the company's own, not counted.
async function selectsFit(page, name) {
  const cut = await page.evaluate(() => {
    const out = [];
    const ctx = document.createElement('canvas').getContext('2d');
    for (const select of document.querySelectorAll('select')) {
      if (select.getClientRects().length === 0) continue;
      const cs = getComputedStyle(select);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room =
        select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 28;
      const longest = Math.max(...[...select.options].map((o) => ctx.measureText(o.text).width));
      const line = select.closest('.grid, form');
      if (line) {
        const ls = getComputedStyle(line);
        const inner = line.clientWidth - parseFloat(ls.paddingLeft) - parseFloat(ls.paddingRight);
        if (select.offsetWidth >= inner - 1) continue;
      }
      if (longest > room)
        out.push(`${select.name || select.id}: ${Math.round(longest)}px > ${Math.round(room)}px`);
    }
    return out;
  });
  for (const issue of cut) fail(`${name}: drop-down cuts its text — ${issue}`);
}

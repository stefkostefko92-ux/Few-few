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
  await page.waitForURL(/\/(schede|account|condizioni\/accetta)/);
  await acceptTerms(page, who);
  await readUpdates(page);
}

// The terms before the portal (src/legale/): the rules of use with a tick; for the company's ADMIN, the
// company data and the acceptance, then — on a page of its own — the specific approval of the clauses
// signed with the emailed code (here, without SMTP, the page shows it). Each page checked once with axe.
const termsAudited = new Set();
// As a tap on the label: the styled box over the input would take a pointer click.
const spunta = (input) =>
  input.evaluate((el) => {
    if (!el.checked) el.click();
  });
export async function acceptTerms(page, who) {
  if (!new URL(page.url()).pathname.startsWith('/condizioni/accetta')) return;
  if (!termsAudited.has('accetta')) {
    termsAudited.add('accetta');
    await audit(page, 'terms acceptance');
  }
  const azienda = page.locator('input[name=condizioni]');
  const regole = page.locator('input[name=regole]');
  if (!(await azienda.count()) && !(await regole.count()))
    return fail(`${who}: waits for the company's ADMIN to accept the terms`);
  if (await azienda.count()) {
    if (!(await page.inputValue('#f-sede')))
      await page.fill('#f-sede', 'Via Roma 1, 20121 Milano (MI)');
    if (!(await page.inputValue('#f-partitaIva'))) await page.fill('#f-partitaIva', '01234567890');
    await spunta(azienda);
  }
  if (await regole.count()) await spunta(regole);
  await Promise.all([page.waitForEvent('load'), page.click('form.form button[type=submit]')]);
  if (new URL(page.url()).pathname.startsWith('/condizioni/firma')) {
    if (!termsAudited.has('firma')) {
      termsAudited.add('firma');
      await audit(page, 'terms signature');
    }
    const codice = /\b(\d{6})\b/.exec((await page.locator('.flash').textContent()) ?? '')?.[1];
    if (!codice) return fail(`${who}: no code on the signature page (SMTP set on a test server?)`);
    // Without the tick nothing is sent: the message shows, the typed code stays; the tick clears the message
    // (the owner, 13 November 2026: "spunta l'approvazione" stood next to a ticked box).
    await page.fill('#f-codice', codice);
    await page.click('form.form button[type=submit]');
    const avviso = page.locator('[data-errore-clausole]');
    if (
      !new URL(page.url()).pathname.startsWith('/condizioni/firma') ||
      !(await avviso.isVisible())
    )
      fail(`${who}: the signature went without the tick, or says nothing`);
    if ((await page.inputValue('#f-codice')) !== codice)
      fail(`${who}: the code typed before the tick is lost`);
    await spunta(page.locator('input[name=clausole]'));
    if (await avviso.isVisible()) fail(`${who}: the message stays after the tick`);
    await Promise.all([page.waitForEvent('load'), page.click('form.form button[type=submit]')]);
  }
  if (new URL(page.url()).pathname.startsWith('/condizioni/'))
    fail(`${who}: still on the terms (${page.url()})`);
}

// The popup of the updates (views/partials/novita.ejs, novita.js) comes on the first page after an
// update: modal, checked once with axe, read with "Ho capito" in the background — it closes and does not
// come back on the next page. A new account has nothing to read: no popup.
let updatesAudited = false;
export async function readUpdates(page) {
  const dialog = page.locator('dialog[data-novita]');
  if (!(await dialog.count())) return;
  await page.waitForFunction(() =>
    document.querySelector('dialog[data-novita]')?.matches(':modal'),
  );
  if (!updatesAudited) {
    updatesAudited = true;
    await audit(page, 'updates popup');
    if (!(await dialog.locator('li[data-voce]').count())) fail('updates popup without updates');
  }
  const read = page.waitForResponse(
    (r) => r.url().endsWith('/novita/lette') && r.request().method() === 'POST',
  );
  await dialog.locator('button[type=submit]').click();
  if ((await read).status() !== 204) fail('updates popup: "Ho capito" not saved');
  if (await dialog.evaluate((d) => d.open)) fail('updates popup still open after "Ho capito"');
  await page.reload();
  if (await page.locator('dialog[data-novita]').count()) fail('updates popup back after reading');
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
  await belowTitle(page, name);
  await selectsFit(page, name);
}

// Nothing in a form section sits beside its title. The title of a panel is a float: a block that does not
// clear it (the rows of a quote after the hidden price-list search — the owner, 13 November 2026) collapses
// to zero width at the right edge. Every shown child starts under the title and is not a sliver.
async function belowTitle(page, name) {
  const beside = await page.evaluate(() => {
    const out = new Set();
    for (const title of document.querySelectorAll('.form > .section > .section__title')) {
      const section = title.parentElement;
      for (let el = section; el; el = el.parentElement) el.style.contentVisibility = 'visible';
      if (title.getClientRects().length === 0) continue;
      const bottom = title.getBoundingClientRect().bottom;
      const width = section.getBoundingClientRect().width;
      for (const child of section.children) {
        if (child === title || child.getClientRects().length === 0) continue;
        const r = child.getBoundingClientRect();
        if (r.top < bottom - 1 || (r.height > 40 && r.width < width / 4))
          out.add(section.id || title.textContent.trim().slice(0, 40));
      }
    }
    return [...out];
  });
  for (const section of beside) fail(`${name}: section "${section}" has content beside its title`);
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
